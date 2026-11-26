"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
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

/** pending = aviso ainda não respondido; included = voltam a rascunho ao salvar; kept = somente leitura. */
export type PublishedDecision = "pending" | "included" | "kept"

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
  publishedDecision: PublishedDecision
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
  acceptPublished(): void
  declinePublished(): void
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
 * `month = null` é o estado ocioso (nenhum mês escolhido ainda): não lê nada, não carrega e toda ação é ignorada.
 */
export function usePlanning(month: Date | null): UsePlanningResult {
  // Chave estável: o efeito só recarrega quando o mês muda de fato.
  const monthKey = month ? format(month, "yyyy-MM") : null
  const monthStart = useMemo(() => (monthKey ? startOfMonth(new Date(`${monthKey}-01T00:00:00`)) : null), [monthKey])

  // Mês cujos dados estão em memória; enquanto difere do mês pedido, está carregando.
  const [loadedKey, setLoadedKey] = useState<string | null>(null)
  const [plan, setPlan] = useState<PlanMass[]>([])
  const [removedMasses, setRemovedMasses] = useState<PlanMass[]>([])
  const [readers, setReaders] = useState<PlanReader[]>([])
  const [readerNames, setReaderNames] = useState<Record<string, string>>({})
  const [suggested, setSuggested] = useState(false)
  const [history, setHistory] = useState<SlotHistoryRow[]>([])
  const [unavailable, setUnavailable] = useState<Record<string, string[]>>({})
  const [publishedDecision, setPublishedDecision] = useState<PublishedDecision>("pending")
  // Mês cuja leitura falhou (nulo = sem erro) e contador para "Tentar novamente".
  const [errorKey, setErrorKey] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const idle = monthKey === null
  const error = !idle && errorKey === monthKey
  const loading = !idle && !error && loadedKey !== monthKey
  const ready = !idle && !loading && !error
  // Gravando: o plano fica congelado. `ready` continua valendo para leitura; `editable` guarda as edições.
  const [busy, setBusy] = useState(false)
  const editable = ready && !busy

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
      setPlan(monthMasses)
      setReaders(nextReaders)
      setReaderNames(names)
      setSuggested(false)
      setHistory(historyRows)
      setUnavailable(unavailableMap)
      setRemovedMasses([])
      setPublishedDecision("pending")
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
        setLoadedKey(null)
        setErrorKey(monthKey)
      })
    return () => {
      cancelled = true
    }
  }, [monthKey, monthStart, attempt])

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

  const acceptPublished = useCallback(() => {
    if (idle) return
    setPlan((prev) => prev.map((m) => (m.wasPublished ? { ...m, readOnly: false } : m)))
    setPublishedDecision("included")
  }, [idle])

  const declinePublished = useCallback(() => {
    if (idle) return
    setPlan((prev) => prev.map((m) => (m.wasPublished ? { ...m, readOnly: true } : m)))
    setPublishedDecision("kept")
  }, [idle])

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
    publishedDecision,
    removedMasses,
    loading,
    error,
    retry,
    createDefaults,
    addMass,
    updateMass,
    removeMass,
    acceptPublished,
    declinePublished,
    phase,
    runLamp,
    setSlotReader,
    toggleLock,
    setBusy,
  }
}
