"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { endOfMonth, format, startOfMonth, subMonths } from "date-fns"
import { toast } from "sonner"
import type { Mass, SlotHistoryRow } from "@/domain/models/Schedule"
import { makeListSchedulesForMonth, makeListSlotHistory } from "@/main/factories/usecases/schedule"
import { makeListProfiles, makeListUnavailableForRange } from "@/main/factories/usecases/profiles"
import { eligibleReaders, type PlanMass, type PlanReader, type PlanSlot, type PlanSummary, type ReaderStats, type RoleCode } from "../lib/types"
import { buildDefaultMasses } from "../lib/defaultMasses"
import { computeReaderStats } from "../lib/readerStats"
import { suggestSchedule, summarizePlan } from "../lib/suggestSchedule"
import { isOutsidePreference } from "../lib/slotPreference"
import { ROLE_ORDER } from "../lib/format"
import { parsePlanState, serializePlanState } from "../lib/planState"
import { reconcilePlan, type ReconcileNotice } from "../lib/reconcilePlan"
import type { PlanDocument } from "@/domain/models/SchedulePlan"
import { usePlanSync, type PlanSyncTarget, type SyncMode, type SyncStatus } from "./usePlanSync"

/** Qual planejamento abrir: o meu (editável) ou o de outro coordenador (somente leitura). */
export type PlanTarget = { kind: "mine"; month: Date } | { kind: "other"; month: Date; planId: string }

/** planning = montando as missas; suggested = a lâmpada já rodou (lista por função). */
export type PlanningPhase = "planning" | "suggested"

export interface UsePlanningResult {
  masses: PlanMass[]
  readers: PlanReader[]
  /** Nome de TODOS os perfis (inclusive arquivados) para exibir vagas já gravadas. */
  readerNames: Record<string, string>
  stats: Record<string, ReaderStats>
  unavailable: Record<string, string[]>
  summary: PlanSummary
  publishedCount: number
  /** Missas já gravadas que o admin removeu do planejamento (para o lote de gravação). */
  removedMasses: PlanMass[]
  loading: boolean
  /** A leitura do mês falhou: não há dados confiáveis, então nada pode ser planejado. */
  error: boolean
  /** Refaz as leituras do mês depois de uma falha. */
  retry(): void
  /** Inclui missas novas no plano; sem efeito enquanto carrega ou com erro. */
  createDefaults(): void
  addMass(m: PlanMass): void
  updateMass(key: string, patch: Partial<PlanMass>): void
  removeMass(key: string): void
  phase: PlanningPhase
  /** Lâmpada / "Sugerir de novo": preenche as vagas livres; travadas e somente leitura ficam. */
  runLamp(): void
  /** Troca manual: define o leitor e TRAVA a vaga. Ignora escolhas que quebram regras duras. */
  setSlotReader(massKey: string, slotIndex: number, profileId: string): void
  toggleLock(massKey: string, slotIndex: number): void
  /**
   * Gravação em andamento: enquanto verdadeiro, nenhuma edição é aceita (a recarga depois de gravar
   * descartaria o que fosse feito nesse intervalo).
   */
  setBusy(busy: boolean): void
  /** Estado da sincronização com o servidor (spec 5.4). */
  mode: SyncMode
  syncStatus: SyncStatus
  lostChanges: number
  notices: ReconcileNotice[]
  ownerName: string | null
  holderLastSeen: string | null
  /** Verdadeiro quando o planejamento não pode ser editado (modo diferente de "edit"). */
  readOnly: boolean
  sessionId: string
  planId: string | null
  /** Mensagem de erro de `error`/`unavailable` da sincronização. */
  syncError: string | null
  retrySave(): void
  reopen(): Promise<void>
  syncPlan: PlanDocument | null
}

const ymd = (d: Date) => format(d, "yyyy-MM-dd")
const byDateTime = (a: PlanMass, b: PlanMass) =>
  a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date)

/** Postgres `time` chega como "07:00:00"; o planejamento trabalha com "HH:mm". */
export function normalizeTime(time: string): string {
  return time.slice(0, 5)
}

export function massToPlan(mass: Mass): PlanMass {
  const slots: PlanSlot[] = [...mass.slots]
    .sort((a, b) => (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9))
    .map((s) => ({
      id: s.id,
      role: s.role as RoleCode,
      profileId: s.profileId ?? "",
      locked: !!s.profileId,
      // Só presente quando verdadeiro: o plano de quem não tem troca pendente não muda.
      ...(s.isSwapRequested ? { isSwapRequested: true } : {}),
    }))
  return {
    key: mass.id,
    id: mass.id,
    scheduleRevision: mass.scheduleRevision,
    date: mass.date.slice(0, 10),
    time: normalizeTime(mass.time),
    description: mass.specialDescription ?? "",
    wasPublished: mass.isPublished,
    readOnly: mass.isPublished,
    slots,
  }
}

/**
 * Garante chave única no plano: mantém a chave proposta se estiver livre,
 * senão acrescenta um sufixo (~2, ~3...). Necessário porque missas novas usam
 * `${date}_${time}` e a edição do horário não muda a chave.
 */
function withUniqueKeys(incoming: PlanMass[], existing: PlanMass[]): PlanMass[] {
  const taken = new Set(existing.map((m) => m.key))
  return incoming.map((m) => {
    let key = m.key
    for (let n = 2; taken.has(key); n++) key = `${m.key}~${n}`
    taken.add(key)
    return key === m.key ? m : { ...m, key }
  })
}

/**
 * `target = null` é o estado ocioso (nenhum mês escolhido ainda): não lê nada, não carrega e toda ação é ignorada.
 * As leituras reais (missas, perfis, histórico, indisponibilidades) e o planejamento guardado no servidor
 * (`usePlanSync`) carregam em paralelo; o plano inicial é o guardado reconciliado com a realidade.
 */
export function usePlanning(target: PlanTarget | null): UsePlanningResult {
  const month = target?.month ?? null
  // Chave estável: o efeito só recarrega quando o mês muda de fato.
  const monthKey = month ? format(month, "yyyy-MM") : null
  const monthStart = useMemo(() => (monthKey ? startOfMonth(new Date(`${monthKey}-01T00:00:00`)) : null), [monthKey])
  const planId = target?.kind === "other" ? target.planId : null
  const targetKey = target && monthKey ? (planId ? `other:${planId}:${monthKey}` : `mine:${monthKey}`) : null
  const syncTarget = useMemo<PlanSyncTarget>(
    () => (!monthKey ? null : planId ? { kind: "other", planId } : { kind: "mine", month: monthKey }),
    [monthKey, planId],
  )
  const sync = usePlanSync(syncTarget)

  // Mês cujos dados estão em memória; enquanto difere do mês pedido, está carregando.
  const [loadedKey, setLoadedKey] = useState<string | null>(null)
  const [realMasses, setRealMasses] = useState<PlanMass[]>([])
  const [plan, setPlan] = useState<PlanMass[]>([])
  const [removedMasses, setRemovedMasses] = useState<PlanMass[]>([])
  const [readers, setReaders] = useState<PlanReader[]>([])
  const [readerNames, setReaderNames] = useState<Record<string, string>>({})
  const [suggested, setSuggested] = useState(false)
  const [history, setHistory] = useState<SlotHistoryRow[]>([])
  const [unavailable, setUnavailable] = useState<Record<string, string[]>>({})
  const [notices, setNotices] = useState<ReconcileNotice[]>([])
  // Plano reconciliado já aplicado (alvo + época): a primeira foto é a linha de base e nunca é gravada.
  const [baseline, setBaseline] = useState<{ targetKey: string; epoch: number; real: PlanMass[] } | null>(null)
  // Mês cuja leitura falhou (nulo = sem erro) e contador para "Tentar novamente".
  const [errorKey, setErrorKey] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const idle = monthKey === null
  const error = !idle && errorKey === monthKey

  // O documento do servidor só vale se for do alvo pedido (na troca de alvo o hook de sync ainda mostra o antigo por um render).
  const syncPlanOk =
    !!sync.plan && (planId ? sync.plan.id === planId : sync.plan.monthReference === monthKey)
  const syncSettled =
    sync.mode !== "idle" && sync.mode !== "loading" && (syncPlanOk || !["edit", "readonly", "concluded"].includes(sync.mode))
  const applied = baseline !== null && baseline.targetKey === targetKey && baseline.real === realMasses
  const loading = !idle && !error && (loadedKey !== monthKey || !applied || !syncSettled)
  const ready = !idle && !loading && !error
  const mode: SyncMode = idle ? "idle" : syncSettled ? sync.mode : "loading"
  // Gravando: o plano fica congelado. `ready` continua valendo para leitura; `editable` guarda as edições.
  const [busy, setBusy] = useState(false)
  // Gravação falhou: novas edições ficam travadas até "tentar de novo" (spec 5.4), senão o servidor ficaria atrás do local.
  const editable = ready && mode === "edit" && sync.status !== "failed" && !busy

  useEffect(() => {
    if (!monthStart || !monthKey) return
    let cancelled = false
    const historyFrom = ymd(startOfMonth(subMonths(monthStart, 12)))
    const historyTo = ymd(endOfMonth(subMonths(monthStart, 1)))
    const settle = (
      monthMasses: PlanMass[],
      nextReaders: PlanReader[],
      names: Record<string, string>,
      historyRows: SlotHistoryRow[],
      unavailableMap: Record<string, string[]>,
    ) => {
      setRealMasses(monthMasses)
      setReaders(nextReaders)
      setReaderNames(names)
      setHistory(historyRows)
      setUnavailable(unavailableMap)
    }
    Promise.all([
      makeListSchedulesForMonth().execute(monthStart, true),
      makeListProfiles().execute(),
      makeListSlotHistory().execute(historyFrom, historyTo),
      makeListUnavailableForRange().execute(ymd(monthStart), ymd(endOfMonth(monthStart))),
    ])
      .then(([monthMasses, profiles, historyRows, unavailableMap]) => {
        if (cancelled) return
        const names = Object.fromEntries(profiles.map((p) => [p.id, p.fullName]))
        settle(monthMasses.map(massToPlan).sort(byDateTime), eligibleReaders(profiles), names, historyRows, unavailableMap)
        setErrorKey(null)
        setLoadedKey(monthKey)
      })
      .catch((error) => {
        if (cancelled) return
        console.error("[Planejamento] Falha ao carregar o mês:", error)
        toast.error("Não foi possível carregar o planejamento deste mês.")
        // Sem dados confiáveis: nada de lista vazia "planejável".
        settle([], [], {}, [], {})
        setPlan([])
        setRemovedMasses([])
        setSuggested(false)
        setLoadedKey(null)
        setErrorKey(monthKey)
      })
    return () => {
      cancelled = true
    }
  }, [monthKey, monthStart, attempt])

  // Reconciliação: o plano guardado (ou nada) contra as missas reais. Roda quando a realidade, o alvo ou o documento do servidor mudam.
  const epochRef = useRef(0)
  // Último estado gravado desta sessão de edição: uma recarga das leituras não pode voltar ao estado do servidor da abertura.
  const sentRef = useRef<{ doc: PlanDocument; state: unknown } | null>(null)
  useEffect(() => {
    if (!targetKey || loadedKey !== monthKey || !syncSettled) return
    const sent = sync.mode === "edit" && sentRef.current?.doc === sync.plan ? sentRef.current : null
    const raw = sent ? sent.state : syncPlanOk ? sync.plan?.state : null
    const stored = raw == null ? null : parsePlanState(raw)
    const reconciled = reconcilePlan(stored, realMasses, raw != null && stored === null)
    // Sincronização com um sistema externo (o documento do servidor + a leitura real): o plano local passa a ser a foto
    // reconciliada e todos os setters entram no mesmo lote, junto com a nova linha de base.
    /* eslint-disable react-hooks/set-state-in-effect */
    setPlan(reconciled.masses)
    setRemovedMasses(reconciled.removedMasses)
    setSuggested(reconciled.suggested)
    setNotices(reconciled.notices)
    setBaseline({ targetKey, epoch: ++epochRef.current, real: realMasses })
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [targetKey, monthKey, loadedKey, syncSettled, syncPlanOk, sync.mode, sync.plan, realMasses])

  // Autosave: depois da linha de base, cada alteração do estado serializado vira UMA gravação (só em "edit").
  const lastSigRef = useRef<{ epoch: number; sig: string } | null>(null)
  const { save } = sync
  useEffect(() => {
    if (!baseline || baseline.targetKey !== targetKey) return
    const state = serializePlanState(plan, removedMasses, suggested)
    const sig = JSON.stringify(state)
    const last = lastSigRef.current
    // Primeiro render de uma nova linha de base: só adota a assinatura, não grava.
    if (!last || last.epoch !== baseline.epoch) {
      lastSigRef.current = { epoch: baseline.epoch, sig }
      return
    }
    if (last.sig === sig) return
    lastSigRef.current = { epoch: baseline.epoch, sig }
    if (mode !== "edit" || !sync.plan) return
    sentRef.current = { doc: sync.plan, state }
    save(state)
  }, [baseline, targetKey, plan, removedMasses, suggested, mode, save, sync.plan])

  // Também serve de recarga depois de salvar: volta a "carregando" para não editar dados velhos.
  const retry = useCallback(() => {
    if (idle) return
    setLoadedKey(null)
    setErrorKey(null)
    setAttempt((a) => a + 1)
  }, [idle])

  // Durante a troca de mês (ou com erro) não exibe missas de outro estado.
  const masses = useMemo(() => (ready ? plan : []), [ready, plan])
  const stats = useMemo(() => (monthStart ? computeReaderStats(readers, history, monthStart) : {}), [readers, history, monthStart])
  const summary = useMemo(() => summarizePlan(masses), [masses])
  const publishedCount = useMemo(() => masses.filter((m) => m.wasPublished).length, [masses])

  const createDefaults = useCallback(() => {
    if (!editable || !monthStart) return
    setPlan((prev) => {
      const defaults = buildDefaultMasses(monthStart, prev.map((m) => ({ date: m.date, time: normalizeTime(m.time) })))
      return [...prev, ...withUniqueKeys(defaults, prev)].sort(byDateTime)
    })
  }, [monthStart, editable])

  const addMass = useCallback(
    (m: PlanMass) => {
      if (!editable) return
      setPlan((prev) => [...prev, ...withUniqueKeys([m], prev)].sort(byDateTime))
    },
    [editable],
  )

  const updateMass = useCallback(
    (key: string, patch: Partial<PlanMass>) => {
      if (!editable) return
      setPlan((prev) =>
        prev
          .map((m) => (m.key === key && !m.readOnly ? { ...m, ...patch, key: m.key } : m))
          .sort(byDateTime),
      )
    },
    [editable],
  )

  const removeMass = useCallback(
    (key: string) => {
      if (!editable) return
      const target = masses.find((m) => m.key === key)
      if (!target || target.readOnly) return
      setPlan((prev) => prev.filter((m) => m.key !== key))
      if (target.id) setRemovedMasses((r) => (r.some((x) => x.key === key) ? r : [...r, target]))
    },
    [editable, masses],
  )

  const phase: PlanningPhase = ready && suggested ? "suggested" : "planning"

  const runLamp = useCallback(() => {
    if (!editable) return
    if (plan.length === 0) {
      toast.info("Crie as missas do mês primeiro")
      return
    }
    if (readers.length === 0) {
      toast.warning("Nenhum leitor apto (ativos, com ou sem conta vinculada): as vagas ficaram sem leitor.")
    }
    setPlan((prev) => suggestSchedule({ masses: prev, readers, stats, unavailable }))
    setSuggested(true)
  }, [editable, plan.length, readers, stats, unavailable])

  const setSlotReader = useCallback(
    (massKey: string, slotIndex: number, profileId: string) => {
      if (!editable) return
      const reader = readers.find((r) => r.id === profileId)
      if (!reader) return // arquivado ou desconhecido
      setPlan((prev) =>
        prev.map((m) => {
          const slot = m.slots[slotIndex]
          if (m.key !== massKey || m.readOnly || !slot || slot.isSwapRequested) return m
          if (unavailable[m.date]?.includes(profileId)) return m
          if (m.slots.some((s, i) => i !== slotIndex && s.profileId === profileId)) return m
          const { warning: _w, reason: _r, ...rest } = slot
          void _w
          void _r
          const next: PlanSlot = { ...rest, profileId, locked: true, reason: "Escolhido à mão" }
          if (isOutsidePreference(reader, m)) next.warning = "outside-preference"
          return { ...m, slots: m.slots.map((s, i) => (i === slotIndex ? next : s)) }
        }),
      )
    },
    [editable, readers, unavailable],
  )

  const toggleLock = useCallback(
    (massKey: string, slotIndex: number) => {
      if (!editable) return
      setPlan((prev) =>
        prev.map((m) => {
          const slot = m.slots[slotIndex]
          if (m.key !== massKey || m.readOnly || !slot || slot.profileId === "" || slot.isSwapRequested) return m
          return { ...m, slots: m.slots.map((s, i) => (i === slotIndex ? { ...s, locked: !s.locked } : s)) }
        }),
      )
    },
    [editable],
  )

  return {
    masses,
    readers,
    readerNames,
    stats,
    unavailable,
    summary,
    publishedCount,
    removedMasses,
    loading,
    error,
    retry,
    createDefaults,
    addMass,
    updateMass,
    removeMass,
    phase,
    runLamp,
    setSlotReader,
    toggleLock,
    setBusy,
    mode,
    syncStatus: sync.status,
    lostChanges: sync.lostChanges,
    // Avisos de reconciliação só no modo de edição: em leitura/concluído/outro o plano é só exibido.
    notices: mode === "edit" ? notices : [],
    ownerName: sync.plan?.ownerName ?? null,
    holderLastSeen: sync.holderLastSeen,
    readOnly: mode !== "edit",
    sessionId: sync.sessionId,
    planId: sync.plan?.id ?? null,
    syncError: sync.error,
    retrySave: sync.retrySave,
    reopen: sync.reopen,
    syncPlan: sync.plan,
  }
}
