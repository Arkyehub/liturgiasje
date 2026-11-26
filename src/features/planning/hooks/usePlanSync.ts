"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { PlanError, planErrorMessage } from "@/domain/models/SchedulePlan"
import type { PlanDocument, PlanOpenResult } from "@/domain/models/SchedulePlan"
import {
  makeGetPlan,
  makeHeartbeatPlan,
  makeOpenPlan,
  makeReleasePlan,
  makeReopenPlan,
  makeSavePlan
} from "@/main/factories/usecases/plans"

export type SyncStatus = "idle" | "saving" | "saved" | "failed"
export type SyncMode = "idle" | "loading" | "edit" | "readonly" | "concluded" | "unavailable" | "error"

export type PlanSyncTarget = { kind: "mine"; month: string } | { kind: "other"; planId: string } | null

export interface UsePlanSyncResult {
  mode: SyncMode
  /** Documento atual do servidor (state cru). */
  plan: PlanDocument | null
  holderLastSeen: string | null
  status: SyncStatus
  /** Alterações descartadas porque a reserva foi perdida. */
  lostChanges: number
  /** Mensagem do último erro que levou a `error`/`unavailable` (ou falha de reabertura). */
  error: string | null
  /** Identificador desta aba (para ConcludePlan e afins). */
  sessionId: string
  /** Enfileira a gravação do estado; nunca lança nem bloqueia. */
  save(state: unknown): void
  /** Reenvia a gravação que falhou (mesmo request_id). */
  retrySave(): void
  /** Concluído: reabre o plano. Somente leitura do mesmo dono: tenta reservar de novo. */
  reopen(): Promise<void>
  /** Libera a reserva (melhor esforço). */
  release(): void
}

const SESSION_KEY = "planejamento:session"
const HEARTBEAT_MS = 30_000
const POLL_MS = 20_000
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
  const [holderLastSeen, setHolderLastSeen] = useState<string | null>(null)
  const [status, setStatus] = useState<SyncStatus>("idle")
  const [lostChanges, setLostChanges] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState("")

  const targetKey = target ? (target.kind === "mine" ? `mine:${target.month}` : `other:${target.planId}`) : ""
  const targetRef = useRef(target)
  targetRef.current = target

  const sessionRef = useRef("")
  const modeRef = useRef<SyncMode>(mode)
  const planRef = useRef<PlanDocument | null>(null)
  const revisionRef = useRef(0)
  const holdingRef = useRef(false)
  const failedRef = useRef(false)
  const pendingRef = useRef<Job | null>(null)
  const inflightRef = useRef<Job | null>(null)
  const pumpingRef = useRef(false)
  const pollingRef = useRef(false)
  const genRef = useRef(0)
  /** Época da fila de gravação: qualquer troca de reserva/alvo a invalida (sendJob e pump param). */
  const epochRef = useRef(0)
  /** Tentativa de gravação em rede neste momento (para o release esperar o resultado). */
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
   * Libera a reserva. release() e o desmonte fazem UMA tentativa de melhor esforço de enviar o estado
   * mais recente ainda não aplicado (sem repetições nem espera; erros engolidos) e só então chamam
   * ReleasePlan. Depois disso a fila está morta e save() é ignorado.
   */
  const releaseNow = useCallback(() => {
    if (!holdingRef.current) return
    holdingRef.current = false
    const planId = planRef.current?.id
    if (!planId) return
    const session = sessionRef.current
    const pend = pendingRef.current
    const inflight = inflightRef.current
    const active = activeRef.current
    const revision0 = revisionRef.current
    killQueue()
    void (async () => {
      try {
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
      } finally {
        try {
          await makeReleasePlan().execute(planId, session)
        } catch {
          // melhor esforço
        }
      }
    })()
  }, [killQueue])

  const applyOpen = useCallback(
    (result: PlanOpenResult) => {
      killQueue()
      revisionRef.current = result.plan.revision
      setPlan(result.plan)
      setHolderLastSeen(result.holderLastSeen)
      setError(null)
      if (result.mode === "edit") {
        holdingRef.current = true
        failedRef.current = false
        pendingRef.current = null
        inflightRef.current = null
        setLostChanges(0)
        setStatus("idle")
      }
      setMode(result.mode)
    },
    [killQueue, setMode, setPlan]
  )

  /** Recarrega o documento depois de perder a reserva/conflito (melhor esforço). */
  const reloadPlan = useCallback(
    async (gen: number, planId: string) => {
      try {
        const doc = await makeGetPlan().execute(planId)
        if (gen !== genRef.current || !doc) return
        revisionRef.current = doc.revision
        setPlan(doc)
      } catch {
        // mantém o documento anterior; o polling tenta de novo
      }
    },
    [setPlan]
  )

  /** Reserva perdida ou conflito de revisão: nada mais é gravado; vira somente leitura. */
  const dropToReadonly = useCallback(
    (gen: number, releaseReservation: boolean) => {
      if (modeRef.current !== "edit") return
      const lost = (inflightRef.current?.count ?? 0) + (pendingRef.current?.count ?? 0)
      killQueue()
      setLostChanges(lost)
      setStatus("idle")
      setMode("readonly")
      const planId = planRef.current?.id
      if (releaseReservation) releaseNow()
      else holdingRef.current = false
      if (planId) void reloadPlan(gen, planId)
    },
    [killQueue, releaseNow, reloadPlan, setMode]
  )

  const handleWriteError = useCallback(
    (gen: number, e: unknown): "retry" | "failed" | "stop" => {
      switch (codeOf(e)) {
        case "plan_lock_lost":
          dropToReadonly(gen, false)
          return "stop"
        case "plan_revision_conflict":
          dropToReadonly(gen, true)
          return "stop"
        case "plan_expired":
          killQueue()
          holdingRef.current = false
          setError(planErrorMessage(e))
          setStatus("idle")
          setMode("error")
          return "stop"
        case "plan_concluded": {
          killQueue()
          holdingRef.current = false
          const planId = planRef.current?.id
          setStatus("idle")
          setMode("concluded")
          if (planId) void reloadPlan(gen, planId)
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
    [dropToReadonly, killQueue, reloadPlan, setMode]
  )

  /** Envia o job (com repetições, mesmo request_id). Retorna true se foi aplicado. */
  const sendJob = useCallback(
    async (epoch: number, job: Job): Promise<boolean> => {
      const save = makeSavePlan()
      for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
        if (epoch !== epochRef.current || modeRef.current !== "edit" || !holdingRef.current) return false
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
      if (modeRef.current !== "edit" || !holdingRef.current || failedRef.current) return
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

  const release = useCallback(() => {
    releaseNow()
  }, [releaseNow])

  const reopen = useCallback(async () => {
    const t = targetRef.current
    const gen = genRef.current
    const current = modeRef.current
    try {
      let result: PlanOpenResult | null = null
      if (current === "concluded" && planRef.current) {
        result = await makeReopenPlan().execute(planRef.current.id, sessionRef.current)
      } else if (current === "readonly" && t?.kind === "mine") {
        result = await makeOpenPlan().execute(t.month, sessionRef.current)
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
    holdingRef.current = false
    killQueue()
    pollingRef.current = false
    planRef.current = null
    revisionRef.current = 0
    setPlanState(null)
    setHolderLastSeen(null)
    setStatus("idle")
    setLostChanges(0)
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
      releaseNow()
      killQueue()
      timers.forEach(clearTimeout)
      timers.clear()
    }
  }, [targetKey, applyOpen, killQueue, releaseNow, setMode, setPlan])

  // Heartbeat: só em edit; também ao voltar a ficar visível.
  useEffect(() => {
    if (mode !== "edit") return
    const gen = genRef.current
    const beat = () => {
      const planId = planRef.current?.id
      if (!planId || modeRef.current !== "edit" || !holdingRef.current) return
      Promise.resolve(makeHeartbeatPlan().execute(planId, sessionRef.current)).catch(e => {
        if (gen === genRef.current && codeOf(e) === "plan_lock_lost") dropToReadonly(gen, false)
      })
    }
    const interval = setInterval(beat, HEARTBEAT_MS)
    const onVisible = () => {
      if (document.visibilityState === "visible") beat()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      clearInterval(interval)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [mode, dropToReadonly])

  // Leitura periódica: somente leitura (próprio ou de outro coordenador).
  useEffect(() => {
    if (mode !== "readonly") return
    const gen = genRef.current
    const interval = setInterval(() => {
      const planId = planRef.current?.id
      if (!planId || pollingRef.current) return
      pollingRef.current = true
      makeGetPlan()
        .execute(planId)
        .then(
          doc => {
            if (gen !== genRef.current || modeRef.current !== "readonly" || !doc) return
            if (doc.revision !== planRef.current?.revision) {
              revisionRef.current = doc.revision
              setPlan(doc)
            }
          },
          () => {}
        )
        .finally(() => {
          pollingRef.current = false
        })
    }, POLL_MS)
    return () => clearInterval(interval)
  }, [mode, setPlan])

  return useMemo(
    () => ({ mode, plan, holderLastSeen, status, lostChanges, error, sessionId, save, retrySave, reopen, release }),
    [mode, plan, holderLastSeen, status, lostChanges, error, sessionId, save, retrySave, reopen, release]
  )
}
