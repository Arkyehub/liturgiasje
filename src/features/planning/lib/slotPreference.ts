import { MASS_PREFERENCE_DAYS, preferenceKeyForWeekday, preferredTimesForDate } from "@/features/profile/lib/massPreferences"
import type { PlanMass, PlanReader } from "./types"

type MassTime = Pick<PlanMass, "date" | "time">

/** O leitor marcou o dia/horário desta missa como preferência. */
export function prefersMass(reader: PlanReader, mass: MassTime): boolean {
  return preferredTimesForDate(reader.dayPreferences, mass.date).includes(mass.time)
}

/**
 * O dia/horário da missa é um dos que o leitor pode marcar como preferência
 * (Dom 07/09/11/19, Ter e Sex 19:00). Sábado não tem chave de preferência: nunca é.
 * Única fonte da regra do ⚠️ (lâmpada, troca manual e cards).
 */
export function isPreferenceSlot(mass: MassTime): boolean {
  const key = preferenceKeyForWeekday(new Date(`${mass.date}T00:00:00`).getDay())
  if (key === null) return false
  return MASS_PREFERENCE_DAYS.some((d) => d.key === key && d.times.includes(mass.time))
}

/** ⚠️: vaga em dia/horário de preferência que o leitor não marcou. */
export function isOutsidePreference(reader: PlanReader, mass: MassTime): boolean {
  return isPreferenceSlot(mass) && !prefersMass(reader, mass)
}
