"use client"

import { useCallback, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import type { ScheduleBatchEntry } from "@/domain/models/Schedule"
import { makeSaveScheduleBatch, makeUpdateMassesStatus } from "@/main/factories/usecases/schedule"
import { scheduleErrorMessage } from "@/features/schedule/scheduleErrorMessage"
import type { PlanMass, PlanReader } from "../lib/types"
import { planToBatch } from "../lib/planToBatch"
import { buildPreviewText } from "../lib/previewText"

interface UsePlanningSaveArgs {
  month: Date
  masses: PlanMass[]
  removedMasses: PlanMass[]
  readerNames: Record<string, string>
  loading: boolean
  error: boolean
  /** Recarrega o mês (ids e revisões novos depois de gravar). */
  reload(): void
}

export interface UsePlanningSaveResult {
  /** Há mudanças no planejamento que ainda não foram gravadas. */
  dirty: boolean
  saving: boolean
  /** Missas publicadas incluídas que o próximo salvar vai despublicar (pede confirmação antes). */
  unpublishCount: number
  /** Uma tentativa anterior despublicou missas, mas a gravação falhou: elas estão em rascunho no banco. */
  leftAsDraft: boolean
  /** Grava como rascunho. Nunca publica. Em falha, o planejamento fica intacto. */
  saveDraft(): Promise<boolean>
  previewText(): string
}

const FALLBACK = "Não foi possível salvar o rascunho. Tente novamente."
const LEFT_AS_DRAFT = "Atenção: as missas ficaram em rascunho; salve novamente ou republique."

/**
 * `set_masses_publication` faz UPDATE em `masses` e o gatilho `lock_mass_schedule_change`
 * soma 1 a `schedule_revision`. A revisão esperada dessas missas no lote passa a ser +1.
 */
function withRevisions(entries: ScheduleBatchEntry[], revisions: Record<string, number | undefined>): ScheduleBatchEntry[] {
  return entries.map((e) =>
    e.massId && e.massId in revisions ? { ...e, massData: { ...e.massData, expectedRevision: revisions[e.massId] } } : e,
  )
}

export function usePlanningSave({ month, masses, removedMasses, readerNames, loading, error, reload }: UsePlanningSaveArgs): UsePlanningSaveResult {
  const ready = !loading && !error
  const batch = useMemo(() => planToBatch(masses, removedMasses), [masses, removedMasses])
  const signature = useMemo(() => JSON.stringify(batch), [batch])

  // Retrato do mês recém-carregado; trocado a cada carga (troca de mês ou recarga após salvar).
  const [baseline, setBaseline] = useState<string | null>(null)
  const [wasReady, setWasReady] = useState(false)
  // Missas já despublicadas por uma tentativa que falhou depois: id → revisão esperada agora.
  const [unpublished, setUnpublished] = useState<Record<string, number | undefined>>({})
  if (ready !== wasReady) {
    setWasReady(ready)
    setBaseline(ready ? signature : null)
    setUnpublished({})
  }

  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)

  const pending = batch.unpublishIds.filter((id) => !(id in unpublished))
  const dirty = ready && baseline !== null && signature !== baseline

  const saveDraft = useCallback(async () => {
    if (savingRef.current || !ready) return false
    savingRef.current = true
    setSaving(true)
    const revisions = { ...unpublished }
    const toUnpublish = batch.unpublishIds.filter((id) => !(id in revisions))
    try {
      if (toUnpublish.length > 0) {
        await makeUpdateMassesStatus().execute(toUnpublish, false)
        for (const id of toUnpublish) {
          const rev = batch.entries.find((e) => e.massId === id)?.massData.expectedRevision
          revisions[id] = rev === undefined ? undefined : rev + 1
        }
        setUnpublished(revisions)
      }
      await makeSaveScheduleBatch().execute(withRevisions(batch.entries, revisions), batch.removed)
      toast.success("Rascunho salvo.")
      reload()
      return true
    } catch (err) {
      console.error("[Planejamento] Falha ao salvar o rascunho:", err)
      const message = scheduleErrorMessage(err, FALLBACK)
      toast.error(Object.keys(revisions).length > 0 ? `${message} ${LEFT_AS_DRAFT}` : message)
      return false
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }, [ready, batch, unpublished, reload])

  const previewText = useCallback(() => {
    const names: PlanReader[] = Object.entries(readerNames).map(([id, fullName]) => ({ id, fullName, createdAt: "", dayPreferences: {} }))
    return buildPreviewText(masses, names, month)
  }, [masses, readerNames, month])

  return {
    dirty,
    saving,
    unpublishCount: pending.length,
    leftAsDraft: Object.keys(unpublished).length > 0,
    saveDraft,
    previewText,
  }
}
