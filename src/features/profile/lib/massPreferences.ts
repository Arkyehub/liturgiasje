export interface MassPreferenceDay {
  /** Chave gravada em preferences.day_preferences. O app usa "6" para Domingo. */
  key: string
  label: string
  times: string[]
}

/** Dias e horários de missa em que o leitor pode marcar preferência. */
export const MASS_PREFERENCE_DAYS: MassPreferenceDay[] = [
  { key: "6", label: "Domingo", times: ["07:00", "09:00", "11:00", "19:00"] },
  { key: "2", label: "Terça-feira", times: ["19:00"] },
  { key: "5", label: "Sexta-feira", times: ["19:00"] },
]

type DayPreferences = Record<string, string[]> | undefined

/** Liga/desliga um horário num dia, sem mexer nos outros dias. Dia sem horários sai do objeto. */
export function toggleDayPreference(prefs: DayPreferences, dayKey: string, time: string): Record<string, string[]> {
  const current = prefs?.[dayKey] ?? []
  const next = current.includes(time) ? current.filter((t) => t !== time) : [...current, time].sort()
  const { [dayKey]: _removed, ...others } = prefs ?? {}
  void _removed
  return next.length > 0 ? { ...others, [dayKey]: next } : others
}

/** O perfil só precisa de ao menos uma missa preferida, em qualquer dia. */
export function hasAnyMassPreference(prefs: DayPreferences): boolean {
  return Object.values(prefs ?? {}).some((times) => Array.isArray(times) && times.length > 0)
}
