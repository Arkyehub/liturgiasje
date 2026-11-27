"use client"

import { useCallback, useRef, useState } from "react"
import { format, startOfMonth } from "date-fns"
import { toast } from "sonner"
import type { RemovedMass } from "@/domain/models/Schedule"
import { makeListSchedulesForMonth, makeSaveScheduleBatch } from "@/main/factories/usecases/schedule"
import { makeConcludePlan } from "@/main/factories/usecases/plans"
import { scheduleErrorMessage } from "@/features/schedule/scheduleErrorMessage"
import type { PlanMass, PlanReader } from "../lib/types"
import { planToBatch } from "../lib/planToBatch"
import { computeDraftReplacement, refreshRevisions } from "../lib/draftReplacement"
import { buildPreviewText } from "../lib/previewText"
import { massToPlan } from "./usePlanning"

interface UsePlanningSaveArgs {
  month: Date
  masses: PlanMass[]
  removedMasses: PlanMass[]
  readerNames: Record<string, string>
  planId: string | null
  session: string
  /** Só em modo de edição (`planning.mode === "edit"`) há o que gravar. */
  enabled: boolean
  loading: boolean
  error: boolean
  /** Recarrega o mês (ids e revisões novos depois de gravar). */
  reload(): void
  /** Chamado depois que ConcludePlan deu certo e ANTES de `reload()` (a sincronização sai do modo de edição). */
  onConcluded?: () => void | Promise<void>
}

export interface UsePlanningSaveResult {
  saving: boolean
  /** Rascunhos reais que o próximo salvar vai substituir; null = nada a substituir / ainda não preparado. */
  replacement: { count: number; dates: string[] } | null
  /** Lê as missas reais agora e calcula a substituição. Sem edição habilitada não lê nem grava. */
  /** `proceed` = a leitura das missas reais foi bem-sucedida e pode-se pedir a confirmação; `needsConfirm` = há rascunhos a substituir. */
  prepareSave(): Promise<{ needsConfirm: boolean; proceed: boolean }>
  /** Grava como rascunho (um único lote). Nunca publica nem despublica. Em falha, o planejamento fica intacto. */
  saveDraft(): Promise<boolean>
  cancelSave(): void
  previewText(): string
}

const FALLBACK = "Não foi possível salvar o rascunho. Tente novamente."
const READ_FALLBACK = "Não foi possível ler as missas do mês. Tente novamente."
const CONCLUDE_ATTEMPTS = 3

/**
 * Missas reais que salvar apagaria: rascunhos substituídos (datas cobertas pelo plano) e missas removidas
 * pelo plano cuja revisão real mudou. Removidas sem mudança são apagadas mas não listadas.
 * `ids` identifica exatamente o que foi confirmado.
 */
interface Prepared {
  monthKey: string
  realNow: PlanMass[]
  /** Substituídos que o plano não contém: serão apagados. */
  replaced: PlanMass[]
  /** Removidas de propósito que ainda existem como rascunho real: apagadas com a revisão atual. */
  removedReal: PlanMass[]
  /** O que a confirmação mostra: substituídos + removidas alteradas por outra pessoa. */
  listed: PlanMass[]
  dates: string[]
  ids: string
  /** Alguma missa editável do plano foi publicada por outra pessoa depois que o plano foi aberto. */
  publishedElsewhere: boolean
}

/**
 * Salvar despublicaria (`update_mass_with_slots` grava `is_published = false`) uma missa que o plano ainda
 * trata como rascunho: nada pode ser gravado; a reconciliação deixa a missa publicada real vencer.
 */
function hasPublishedElsewhere(masses: PlanMass[], realNow: PlanMass[]): boolean {
  const realById = new Map(realNow.flatMap((m) => (m.id ? [[m.id, m] as const] : [])))
  return masses.some((m) => !m.readOnly && !!m.id && realById.get(m.id)?.wasPublished === true)
}

function compare(masses: PlanMass[], removedMasses: PlanMass[], realNow: PlanMass[], monthKey: string): Prepared {
  const { replaced: replacedAll } = computeDraftReplacement(masses, realNow, removedMasses)
  const inPlan = new Set(masses.flatMap((m) => (m.id ? [m.id] : [])))
  const replaced = replacedAll.filter((m) => !(m.id && inPlan.has(m.id)))
  const realById = new Map(realNow.flatMap((m) => (m.id ? [[m.id, m] as const] : [])))
  const removedReal: PlanMass[] = []
  const changed: PlanMass[] = []
  for (const r of removedMasses) {
    const real = r.id ? realById.get(r.id) : undefined
    if (!real || real.wasPublished) continue
    removedReal.push(real)
    if (real.scheduleRevision !== r.scheduleRevision) changed.push(real)
  }
  const listed = [...replacedAll, ...changed]
  const dates = [...new Set(listed.map((m) => m.date))].sort()
  const ids = JSON.stringify([listed.map((m) => `${m.id}:${m.scheduleRevision}`).sort(), removedReal.map((m) => `${m.id}:${m.scheduleRevision}`).sort(), dates])
  return { monthKey, realNow, replaced, removedReal, listed, dates, ids, publishedElsewhere: hasPublishedElsewhere(masses, realNow) }
}

const CHANGED = "O planejamento mudou; confira e salve de novo."
const PUBLISHED_ELSEWHERE = "Algumas missas foram publicadas fora do planejamento. Atualizando…"

export function usePlanningSave({
  month, masses, removedMasses, readerNames, planId, session, enabled, loading, error, reload, onConcluded,
}: UsePlanningSaveArgs): UsePlanningSaveResult {
  const ready = enabled && !loading && !error
  const monthKey = format(month, "yyyy-MM")
  const monthKeyRef = useRef(monthKey)
  monthKeyRef.current = monthKey
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const preparedRef = useRef<Prepared | null>(null)
  const [replacement, setReplacement] = useState<UsePlanningSaveResult["replacement"]>(null)

  const prepareSave = useCallback(async () => {
    if (!ready || savingRef.current) return { needsConfirm: false, proceed: false }
    const key = monthKey
    try {
      const real = await makeListSchedulesForMonth().execute(startOfMonth(month), true)
      // O mês mudou durante a leitura: o resultado não vale mais.
      if (monthKeyRef.current !== key) return { needsConfirm: false, proceed: false }
      const prepared = compare(masses, removedMasses, real.map(massToPlan), key)
      if (prepared.publishedElsewhere) {
        preparedRef.current = null
        setReplacement(null)
        toast.error(PUBLISHED_ELSEWHERE)
        reload()
        return { needsConfirm: false, proceed: false }
      }
      preparedRef.current = prepared
      const needsConfirm = prepared.listed.length > 0
      setReplacement(needsConfirm ? { count: prepared.listed.length, dates: prepared.dates } : null)
      return { needsConfirm, proceed: true }
    } catch (err) {
      console.error("[Planejamento] Falha ao ler as missas reais:", err)
      preparedRef.current = null
      setReplacement(null)
      toast.error(scheduleErrorMessage(err, READ_FALLBACK))
      throw err
    }
  }, [ready, month, monthKey, masses, removedMasses, reload])

  const cancelSave = useCallback(() => {
    preparedRef.current = null
    setReplacement(null)
  }, [])

  const saveDraft = useCallback(async () => {
    if (savingRef.current || !ready) return false
    const prepared = preparedRef.current
    if (!prepared) return false
    // O que foi confirmado precisa ser exatamente o que será apagado agora.
    const current = prepared.monthKey === monthKey ? compare(masses, removedMasses, prepared.realNow, monthKey) : null
    if (!current || current.ids !== prepared.ids) {
      preparedRef.current = null
      setReplacement(null)
      toast.error(CHANGED)
      return false
    }
    savingRef.current = true
    setSaving(true)
    try {
      // Leitura nova: alguém pode ter publicado uma missa do plano enquanto a confirmação estava aberta.
      let fresh: PlanMass[]
      try {
        fresh = (await makeListSchedulesForMonth().execute(startOfMonth(month), true)).map(massToPlan)
      } catch (err) {
        console.error("[Planejamento] Falha ao reler as missas reais:", err)
        toast.error(scheduleErrorMessage(err, READ_FALLBACK))
        return false
      }
      if (monthKeyRef.current !== monthKey) return false
      if (hasPublishedElsewhere(masses, fresh)) {
        preparedRef.current = null
        setReplacement(null)
        toast.error(PUBLISHED_ELSEWHERE)
        reload()
        return false
      }
      const { entries } = planToBatch(refreshRevisions(masses, prepared.realNow), removedMasses)
      const removed: RemovedMass[] = [...prepared.removedReal, ...prepared.replaced].flatMap((m) =>
        m.id ? [{ id: m.id, expectedRevision: m.scheduleRevision }] : [],
      )
      await makeSaveScheduleBatch().execute(entries, removed)
      preparedRef.current = null
      setReplacement(null)
      toast.success("Rascunho salvo.")
      // O lote já está gravado: falha ao concluir não é erro de salvar.
      let concluded = false
      if (planId) {
        for (let attempt = 0; attempt < CONCLUDE_ATTEMPTS && !concluded; attempt++) {
          try {
            await makeConcludePlan().execute(planId, session)
            concluded = true
          } catch (err) {
            console.error("[Planejamento] Falha ao concluir o planejamento:", err)
          }
        }
      }
      if (concluded) {
        // O servidor limpou a reserva: a sincronização precisa saber antes da recarga, senão segue em "edit".
        try {
          await onConcluded?.()
        } catch (err) {
          console.error("[Planejamento] Falha ao atualizar o estado concluído:", err)
        }
      }
      reload()
      return true
    } catch (err) {
      console.error("[Planejamento] Falha ao salvar o rascunho:", err)
      toast.error(scheduleErrorMessage(err, FALLBACK))
      return false
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }, [ready, month, monthKey, masses, removedMasses, planId, session, reload, onConcluded])

  const previewText = useCallback(() => {
    const names: PlanReader[] = Object.entries(readerNames).map(([id, fullName]) => ({ id, fullName, createdAt: "", dayPreferences: {} }))
    return buildPreviewText(masses, names, month)
  }, [masses, readerNames, month])

  return { saving, replacement, prepareSave, saveDraft, cancelSave, previewText }
}
