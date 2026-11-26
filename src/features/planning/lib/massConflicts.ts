import type { PlanMass } from "./types"

/** Data/horário das OUTRAS missas do plano: a missa em edição (por chave) não conflita consigo mesma. */
export function otherMassTimes(masses: PlanMass[], editingKey?: string): { date: string; time: string }[] {
  return masses.filter((m) => m.key !== editingKey).map((m) => ({ date: m.date, time: m.time }))
}
