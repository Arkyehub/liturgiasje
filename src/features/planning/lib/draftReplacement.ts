import type { PlanMass } from "./types"

/**
 * Rascunhos reais (não publicados) que salvar substituiria, em datas cobertas por missas EDITÁVEIS do plano:
 * os que o plano não contém, e os que o plano contém mas mudaram (`scheduleRevision` diferente) desde que foi aberto.
 * Publicadas nunca entram; datas só com missa publicada no plano não contam; rascunhos de datas não cobertas ficam intocados.
 * `removed`: missas que o plano removeu de propósito; seus ids não entram em `replaced` (o lote as apaga por conta própria).
 */
export function computeDraftReplacement(
  plan: PlanMass[],
  realNow: PlanMass[],
  removed: PlanMass[] = [],
): { replaced: PlanMass[]; dates: string[] } {
  const coveredDates = new Set(plan.filter((m) => !m.wasPublished).map((m) => m.date))
  const planRevisions = new Map<string, number | undefined>()
  for (const m of plan) if (m.id) planRevisions.set(m.id, m.scheduleRevision)
  const removedIds = new Set(removed.flatMap((m) => (m.id ? [m.id] : [])))
  const replaced = realNow.filter((m) => {
    if (m.wasPublished || !coveredDates.has(m.date)) return false
    if (m.id && removedIds.has(m.id)) return false
    if (m.id && planRevisions.has(m.id)) return planRevisions.get(m.id) !== m.scheduleRevision
    return true
  })
  const dates = [...new Set(replaced.map((m) => m.date))].sort()
  return { replaced, dates }
}

/** Atualiza `scheduleRevision` das missas do plano com `id` a partir da realidade atual; as demais ficam como estão. */
export function refreshRevisions(plan: PlanMass[], realNow: PlanMass[]): PlanMass[] {
  const revisions = new Map<string, number | undefined>()
  for (const m of realNow) if (m.id) revisions.set(m.id, m.scheduleRevision)
  return plan.map((m) => (m.id && revisions.has(m.id) ? { ...m, scheduleRevision: revisions.get(m.id) } : m))
}
