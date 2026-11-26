import type { PlanMass } from "./types"

/**
 * Rascunhos reais (não publicados) que salvar substituiria: datas cobertas pelo plano cujo `id` o plano não contém.
 * Publicadas nunca entram; rascunhos de datas que o plano não cobre ficam intocados.
 */
export function computeDraftReplacement(plan: PlanMass[], realNow: PlanMass[]): { replaced: PlanMass[]; dates: string[] } {
  const coveredDates = new Set(plan.map((m) => m.date))
  const planIds = new Set(plan.flatMap((m) => (m.id ? [m.id] : [])))
  const replaced = realNow.filter((m) => !m.wasPublished && coveredDates.has(m.date) && !(m.id && planIds.has(m.id)))
  const dates = [...new Set(replaced.map((m) => m.date))].sort()
  return { replaced, dates }
}

/** Atualiza `scheduleRevision` das missas do plano com `id` a partir da realidade atual; as demais ficam como estão. */
export function refreshRevisions(plan: PlanMass[], realNow: PlanMass[]): PlanMass[] {
  const revisions = new Map<string, number | undefined>()
  for (const m of realNow) if (m.id) revisions.set(m.id, m.scheduleRevision)
  return plan.map((m) => (m.id && revisions.has(m.id) ? { ...m, scheduleRevision: revisions.get(m.id) } : m))
}
