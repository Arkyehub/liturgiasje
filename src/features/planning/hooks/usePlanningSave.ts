"use client"

import { useCallback, useRef, useState } from "react"
import { startOfMonth } from "date-fns"
import { toast } from "sonner"
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
}

export interface UsePlanningSaveResult {
  saving: boolean
  /** Rascunhos reais que o próximo salvar vai substituir; null = nada a substituir / ainda não preparado. */
  replacement: { count: number; dates: string[] } | null
  /** Lê as missas reais agora e calcula a substituição. Sem edição habilitada não lê nem grava. */
  prepareSave(): Promise<{ needsConfirm: boolean }>
  /** Grava como rascunho (um único lote). Nunca publica nem despublica. Em falha, o planejamento fica intacto. */
  saveDraft(): Promise<boolean>
  cancelSave(): void
  previewText(): string
}

const FALLBACK = "Não foi possível salvar o rascunho. Tente novamente."
const READ_FALLBACK = "Não foi possível ler as missas do mês. Tente novamente."
const CONCLUDE_ATTEMPTS = 3

interface Prepared {
  realNow: PlanMass[]
  replaced: PlanMass[]
  dates: string[]
}

export function usePlanningSave({
  month, masses, removedMasses, readerNames, planId, session, enabled, loading, error, reload,
}: UsePlanningSaveArgs): UsePlanningSaveResult {
  const ready = enabled && !loading && !error
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const preparedRef = useRef<Prepared | null>(null)
  const [replacement, setReplacement] = useState<UsePlanningSaveResult["replacement"]>(null)

  const readAndCompare = useCallback(async (): Promise<Prepared> => {
    const real = await makeListSchedulesForMonth().execute(startOfMonth(month), true)
    const realNow = real.map(massToPlan)
    const { replaced, dates } = computeDraftReplacement(masses, realNow, removedMasses)
    return { realNow, replaced, dates }
  }, [month, masses, removedMasses])

  const prepareSave = useCallback(async () => {
    if (!ready || savingRef.current) return { needsConfirm: false }
    try {
      const prepared = await readAndCompare()
      preparedRef.current = prepared
      const needsConfirm = prepared.replaced.length > 0
      setReplacement(needsConfirm ? { count: prepared.replaced.length, dates: prepared.dates } : null)
      return { needsConfirm }
    } catch (err) {
      console.error("[Planejamento] Falha ao ler as missas reais:", err)
      preparedRef.current = null
      setReplacement(null)
      toast.error(scheduleErrorMessage(err, READ_FALLBACK))
      throw err
    }
  }, [ready, readAndCompare])

  const cancelSave = useCallback(() => {
    preparedRef.current = null
    setReplacement(null)
  }, [])

  const saveDraft = useCallback(async () => {
    if (savingRef.current || !ready) return false
    savingRef.current = true
    setSaving(true)
    try {
      const prepared = preparedRef.current ?? (await readAndCompare())
      const { entries, removed } = planToBatch(refreshRevisions(masses, prepared.realNow), removedMasses)
      // Rascunhos reais substituídos que o plano não contém (nem já removeu) entram como exclusão, com a revisão de agora.
      const inPlan = new Set(masses.flatMap((m) => (m.id ? [m.id] : [])))
      const alreadyRemoved = new Set(removed.map((r) => r.id))
      for (const m of prepared.replaced) {
        if (m.id && !inPlan.has(m.id) && !alreadyRemoved.has(m.id)) removed.push({ id: m.id, expectedRevision: m.scheduleRevision })
      }
      await makeSaveScheduleBatch().execute(entries, removed)
      preparedRef.current = null
      setReplacement(null)
      toast.success("Rascunho salvo.")
      // O lote já está gravado: falha ao concluir não é erro de salvar.
      if (planId) {
        for (let attempt = 0; attempt < CONCLUDE_ATTEMPTS; attempt++) {
          try {
            await makeConcludePlan().execute(planId, session)
            break
          } catch (err) {
            console.error("[Planejamento] Falha ao concluir o planejamento:", err)
          }
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
  }, [ready, readAndCompare, masses, removedMasses, planId, session, reload])

  const previewText = useCallback(() => {
    const names: PlanReader[] = Object.entries(readerNames).map(([id, fullName]) => ({ id, fullName, createdAt: "", dayPreferences: {} }))
    return buildPreviewText(masses, names, month)
  }, [masses, readerNames, month])

  return { saving, replacement, prepareSave, saveDraft, cancelSave, previewText }
}
