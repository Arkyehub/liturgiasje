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

/**
 * Chave de day_preferences para um dia da semana do JavaScript (0=domingo … 6=sábado).
 * O app grava o Domingo como "6", terça como "2" e sexta como "5". Sábado não tem preferência
 * (retorna null), para nunca herdar a do Domingo.
 */
export function preferenceKeyForWeekday(jsWeekday: number): string | null {
  if (jsWeekday === 0) return "6"
  if (jsWeekday === 6) return null
  return String(jsWeekday)
}

/** Horários preferidos do leitor numa data (YYYY-MM-DD); vazio quando o dia não é de preferência. */
export function preferredTimesForDate(prefs: DayPreferences, dateKey: string): string[] {
  const d = new Date(dateKey + "T00:00:00")
  if (Number.isNaN(d.getTime())) return []
  const key = preferenceKeyForWeekday(d.getDay())
  const times = key ? prefs?.[key] : undefined
  return Array.isArray(times) ? times : []
}
