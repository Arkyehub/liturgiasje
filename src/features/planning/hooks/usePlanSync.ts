"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { PlanError, planErrorMessage } from "@/domain/models/SchedulePlan"
import type { PlanDocument, PlanOpenResult } from "@/domain/models/SchedulePlan"
import { makeGetPlan, makeOpenPlan, makeReopenPlan, makeSavePlan } from "@/main/factories/usecases/plans"

export type SyncStatus = "idle" | "saving" | "saved" | "failed"
export type SyncMode = "idle" | "loading" | "edit" | "readonly" | "concluded" | "unavailable" | "error"

export type PlanSyncTarget = { kind: "mine"; month: string } | { kind: "other"; planId: string } | null

/** Mudança vinda de outro aparelho do mesmo dono (ou conflito de gravação). `seq` muda a cada ocorrência. */
export interface ExternalChange {
  seq: number
  /** O servidor passou a ter a versão de outro aparelho que concluiu o planejamento. */
  concluded: boolean
  /** Alterações locais que não foram aplicadas porque outro aparelho gravou antes. */
  lost: number
}

export interface UsePlanSyncResult {
  mode: SyncMode
  /** Documento atual do servidor (state cru). */
  plan: PlanDocument | null
  status: SyncStatus
  /** Mensagem do último erro que levou a `error`/`unavailable` (ou falha de reabertura). */
  error: string | null
  /** Última mudança trazida de outro aparelho (para avisar o usuário). */
  externalChange: ExternalChange | null
  /** Identificador desta aba (para ConcludePlan e afins). */
  sessionId: string
  /** Enfileira a gravação do estado; nunca lança nem bloqueia. */
  save(state: unknown): void
  /** Reenvia a gravação que falhou (mesmo request_id). */
  retrySave(): void
  /** Concluído: reabre o plano. */
  reopen(): Promise<void>
  /**
   * O servidor concluiu o planejamento: mata a fila, relê o documento e passa a `concluded`.
   */
  markConcluded(): Promise<void>
}

const SESSION_KEY = "planejamento:session"
/** Intervalo da checagem de mudanças vindas de outro aparelho (só com a aba visível). */
const POLL_MS = 30_000
/** Esperas antes de cada repetição: 3 repetições, com o mesmo request_id. */
const RETRY_DELAYS_MS = [2_000, 5_000, 5_000]

interface Job {
  state: unknown
  requestId: string
  /** Quantas chamadas de save() este estado representa. */
  count: number
}

const newId = (): string => {
  try {
    if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID()
  } catch {
    // cai no fallback
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`
}

let memorySessionId: string | null = null

function readSessionId(): string {
  try {
    const stored = window.sessionStorage.getItem(SESSION_KEY)
    if (stored) return stored
    const created = memorySessionId ?? newId()
    memorySessionId = created
    window.sessionStorage.setItem(SESSION_KEY, created)
    return created
  } catch {
    memorySessionId ??= newId()
    return memorySessionId
  }
}

const codeOf = (e: unknown) => (e instanceof PlanError ? e.code : null)

export function usePlanSync(target: PlanSyncTarget): UsePlanSyncResult {
  const [mode, setModeState] = useState<SyncMode>(target ? "loading" : "idle")
  const [plan, setPlanState] = useState<PlanDocument | null>(null)
  const [status, setStatus] = useState<SyncStatus>("idle")
  const [externalChange, setExternalChange] = useState<ExternalChange | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState("")

  const targetKey = target ? (target.kind === "mine" ? `mine:${target.month}` : `other:${target.planId}`) : ""
  const targetRef = useRef(target)
  targetRef.current = target

  const sessionRef = useRef("")
  const modeRef = useRef<SyncMode>(mode)
  const planRef = useRef<PlanDocument | null>(null)
  const revisionRef = useRef(0)
  /** Ressincronizando depois de um conflito: edições feitas nesse intervalo são descartadas (o documento do servidor vence). */
  const resyncRef = useRef(false)
  const externalSeqRef = useRef(0)
  const failedRef = useRef(false)
  const pendingRef = useRef<Job | null>(null)
  const inflightRef = useRef<Job | null>(null)
  const pumpingRef = useRef(false)
  const pollingRef = useRef(false)
  const genRef = useRef(0)
  /** Época da fila de gravação: qualquer troca de alvo/documento a invalida (sendJob e pump param). */
  const epochRef = useRef(0)
  /** Tentativa de gravação em rede neste momento (para o flush esperar o resultado). */
  const activeRef = useRef<Promise<number> | null>(null)
  const timersRef = useRef(new Set<ReturnType<typeof setTimeout>>())

  const setMode = useCallback((m: SyncMode) => {
    modeRef.current = m
    setModeState(m)
  }, [])

  const setPlan = useCallback((p: PlanDocument | null) => {
    planRef.current = p
    setPlanState(p)
  }, [])

  const sleep = useCallback(
    (ms: number) =>
      new Promise<void>(resolve => {
        const t = setTimeout(() => {
          timersRef.current.delete(t)
          resolve()
        }, ms)
        timersRef.current.add(t)
      }),
    []
  )

  /** Invalida a fila: descarta pendentes, para esperas de repetição e impede qualquer gravação antiga. */
  const killQueue = useCallback(() => {
    epochRef.current++
    pumpingRef.current = false
    pendingRef.current = null
    inflightRef.current = null
    failedRef.current = false
    timersRef.current.forEach(clearTimeout)
    timersRef.current.clear()
  }, [])

  /**
   * Ao sair da tela (desmonte do hook ou troca de alvo): UMA tentativa de melhor esforço de enviar o estado mais recente ainda
   * não aplicado (sem repetições nem espera; erros engolidos). Depois disso a fila está morta e save() é ignorado.
   */
  const flushNow = useCallback(() => {
    if (modeRef.current !== "edit") return
    const planId = planRef.current?.id
    if (!planId) return
    const session = sessionRef.current
    const pend = pendingRef.current
    const inflight = inflightRef.current
    const active = activeRef.current
    const revision0 = revisionRef.current
    killQueue()
    void (async () => {
      let revision = revision0
      let inflightApplied = false
      if (active) {
        try {
          revision = await active
          inflightApplied = true
        } catch {
          // a tentativa em rede falhou: o estado volta a ser candidato
        }
      }
      const job = pend ?? (inflightApplied ? null : inflight)
      if (job) {
        try {
          await makeSavePlan().execute(planId, session, job.requestId, revision, job.state)
        } catch {
          // melhor esforço
        }
      }
    })()
  }, [killQueue])

  const announce = useCallback((concluded: boolean, lost: number) => {
    setExternalChange({ seq: ++externalSeqRef.current, concluded, lost })
  }, [])

  const applyOpen = useCallback(
    (result: PlanOpenResult) => {
      killQueue()
      resyncRef.current = false
      revisionRef.current = result.plan.revision
      setPlan(result.plan)
      setError(null)
      if (result.mode === "edit") {
        failedRef.current = false
        pendingRef.current = null
        inflightRef.current = null
        setStatus("idle")
      }
      setMode(result.mode)
    },
    [killQueue, setMode, setPlan]
  )

  /**
   * Outro aparelho gravou antes (conflito de revisão) ou concluiu o planejamento: a fila local é descartada e o
   * documento do servidor passa a valer. As edições locais ainda não aplicadas são contadas e avisadas.
   */
  const adoptServerPlan = useCallback(
    async (gen: number, planId: string, lost: number) => {
      resyncRef.current = true
      try {
        const doc = await makeGetPlan().execute(planId)
        if (gen !== genRef.current) return
        if (!doc) {
          setError(planErrorMessage(new PlanError("plan_not_found")))
          setMode("error")
          return
        }
        revisionRef.current = doc.revision
        setPlan(doc)
        setStatus("idle")
        if (doc.status === "concluido") setMode("concluded")
        announce(doc.status === "concluido", lost)
      } catch {
        // sem rede agora: a checagem periódica traz o documento depois
      } finally {
        if (gen === genRef.current) resyncRef.current = false
      }
    },
    [announce, setMode, setPlan]
  )

  const handleWriteError = useCallback(
    (gen: number, e: unknown): "retry" | "failed" | "stop" => {
      switch (codeOf(e)) {
        case "plan_revision_conflict": {
          const lost = (inflightRef.current?.count ?? 0) + (pendingRef.current?.count ?? 0)
          const planId = planRef.current?.id
          killQueue()
          setStatus("idle")
          if (planId) void adoptServerPlan(gen, planId, lost)
          return "stop"
        }
        case "plan_not_found":
        case "plan_expired":
          killQueue()
          setError(planErrorMessage(e))
          setStatus("idle")
          setMode("error")
          return "stop"
        case "plan_concluded": {
          const lost = (inflightRef.current?.count ?? 0) + (pendingRef.current?.count ?? 0)
          const planId = planRef.current?.id
          killQueue()
          setStatus("idle")
          setMode("concluded")
          if (planId) void adoptServerPlan(gen, planId, lost)
          return "stop"
        }
        case null:
        case "unknown":
        case "unavailable":
          return "retry"
        default:
          return "failed"
      }
    },
    [adoptServerPlan, killQueue, setMode]
  )

  /** Envia o job (com repetições, mesmo request_id). Retorna true se foi aplicado. */
  const sendJob = useCallback(
    async (epoch: number, job: Job): Promise<boolean> => {
      const save = makeSavePlan()
      for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
        if (epoch !== epochRef.current || modeRef.current !== "edit") return false
        const planId = planRef.current?.id
        if (!planId) return false
        const call = save.execute(planId, sessionRef.current, job.requestId, revisionRef.current, job.state)
        activeRef.current = call
        try {
          const revision = await call
          if (epoch !== epochRef.current || modeRef.current !== "edit") return false
          revisionRef.current = revision
          return true
        } catch (e) {
          if (epoch !== epochRef.current || modeRef.current !== "edit") return false
          const verdict = handleWriteError(genRef.current, e)
          if (verdict === "stop") return false
          if (verdict === "retry" && attempt < RETRY_DELAYS_MS.length) {
            await sleep(RETRY_DELAYS_MS[attempt])
            continue
          }
          failedRef.current = true
          setStatus("failed")
          return false
        } finally {
          if (activeRef.current === call) activeRef.current = null
        }
      }
      return false
    },
    [handleWriteError, sleep]
  )

  const pump = useCallback(async () => {
    if (pumpingRef.current) return
    pumpingRef.current = true
    const epoch = epochRef.current
    let drained = false
    try {
      while (epoch === epochRef.current && modeRef.current === "edit" && !failedRef.current) {
        let job = inflightRef.current
        if (!job) {
          job = pendingRef.current
          if (!job) {
            drained = true
            break
          }
          pendingRef.current = null
          inflightRef.current = job
        }
        const ok = await sendJob(epoch, job)
        if (!ok) break
        if (epoch === epochRef.current) inflightRef.current = null
      }
    } finally {
      if (epoch === epochRef.current) pumpingRef.current = false
    }
    if (drained && epoch === epochRef.current) setStatus("saved")
  }, [sendJob])

  const save = useCallback(
    (state: unknown) => {
      if (modeRef.current !== "edit" || failedRef.current || resyncRef.current) return
      const prev = pendingRef.current
      pendingRef.current = { state, requestId: newId(), count: (prev?.count ?? 0) + 1 }
      setStatus("saving")
      void pump()
    },
    [pump]
  )

  const retrySave = useCallback(() => {
    if (modeRef.current !== "edit" || !failedRef.current) return
    failedRef.current = false
    setStatus("saving")
    void pump()
  }, [pump])

  const markConcluded = useCallback(async () => {
    const planId = planRef.current?.id
    if (modeRef.current !== "edit" || !planId) return
    const gen = genRef.current
    // Nada mais é gravado: o servidor já concluiu.
    killQueue()
    setStatus("idle")
    let doc: PlanDocument | null = null
    try {
      doc = await makeGetPlan().execute(planId)
    } catch {
      // mantém o documento anterior
    }
    if (gen !== genRef.current) return
    if (doc) {
      revisionRef.current = doc.revision
      setPlan(doc)
    }
    setMode("concluded")
  }, [killQueue, setMode, setPlan])

  const reopen = useCallback(async () => {
    const gen = genRef.current
    const current = modeRef.current
    try {
      let result: PlanOpenResult | null = null
      if (current === "concluded" && planRef.current) {
        result = await makeReopenPlan().execute(planRef.current.id, sessionRef.current)
      }
      if (result && gen === genRef.current) applyOpen(result)
    } catch (e) {
      if (gen !== genRef.current) return
      setError(planErrorMessage(e))
      if (codeOf(e) === "unavailable") setMode("unavailable")
    }
  }, [applyOpen, setMode])

  // Abertura / troca de alvo.
  useEffect(() => {
    const gen = ++genRef.current
    const t = targetRef.current
    const timers = timersRef.current
    const generation = genRef
    sessionRef.current = readSessionId()
    setSessionId(sessionRef.current)
    killQueue()
    pollingRef.current = false
    resyncRef.current = false
    planRef.current = null
    revisionRef.current = 0
    setPlanState(null)
    setStatus("idle")
    setExternalChange(null)
    setError(null)
    if (!t) {
      setMode("idle")
      return
    }
    setMode("loading")
    const fail = (e: unknown) => {
      if (gen !== genRef.current) return
      setError(planErrorMessage(e))
      setMode(codeOf(e) === "unavailable" ? "unavailable" : "error")
    }
    if (t.kind === "mine") {
      makeOpenPlan()
        .execute(t.month, sessionRef.current)
        .then(result => {
          if (gen === genRef.current) applyOpen(result)
        }, fail)
    } else {
      makeGetPlan()
        .execute(t.planId)
        .then(doc => {
          if (gen !== genRef.current) return
          if (!doc) return fail(new PlanError("plan_not_found"))
          revisionRef.current = doc.revision
          setPlan(doc)
          setMode("readonly")
        }, fail)
    }
    return () => {
      generation.current++
      flushNow()
      killQueue()
      timers.forEach(clearTimeout)
      timers.clear()
    }
  }, [targetKey, applyOpen, killQueue, flushNow, setMode, setPlan])

  // Checagem de mudanças de outro aparelho: a cada 30 s com a aba visível e ao voltar a ela (sem realtime).
  // Em edição só aplica quando não há gravação pendente; se houver, o conflito de revisão resolve na gravação.
  useEffect(() => {
    if (mode !== "edit" && mode !== "readonly" && mode !== "concluded") return
    const gen = genRef.current
    const check = () => {
      const planId = planRef.current?.id
      if (!planId || pollingRef.current || resyncRef.current) return
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return
      if (modeRef.current === "edit" && (pendingRef.current || inflightRef.current || pumpingRef.current || failedRef.current)) return
      pollingRef.current = true
      makeGetPlan()
        .execute(planId)
        .then(
          doc => {
            if (gen !== genRef.current || !doc) return
            const current = modeRef.current
            if (current === "edit") {
              // Gravou algo enquanto a leitura estava em andamento: não pisa na edição local.
              if (pendingRef.current || inflightRef.current || pumpingRef.current || failedRef.current) return
              if (doc.revision === revisionRef.current && doc.status !== "concluido") return
              revisionRef.current = doc.revision
              setPlan(doc)
              if (doc.status === "concluido") setMode("concluded")
              announce(doc.status === "concluido", 0)
            } else if (current === "readonly" || current === "concluded") {
              if (doc.revision !== revisionRef.current) {
                revisionRef.current = doc.revision
                setPlan(doc)
              }
            }
          },
          () => {}
        )
        .finally(() => {
          pollingRef.current = false
        })
    }
    const interval = setInterval(check, POLL_MS)
    const onVisible = () => {
      if (document.visibilityState === "visible") check()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      clearInterval(interval)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [mode, announce, setMode, setPlan])

  return useMemo(
    () => ({ mode, plan, status, error, externalChange, sessionId, save, retrySave, reopen, markConcluded }),
    [mode, plan, status, error, externalChange, sessionId, save, retrySave, reopen, markConcluded]
  )
}
