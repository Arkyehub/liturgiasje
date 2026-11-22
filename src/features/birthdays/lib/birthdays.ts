export const SP_TZ = "America/Sao_Paulo"

export interface BirthdayLike {
  id: string
  fullName: string
  birthDate?: string | null
}

export interface DayMonth {
  day: number
  month: number // 1-12
}

/** Lê "YYYY-MM-DD" (ou ISO) sem aplicar fuso. Retorna null se inválido. */
export function parseDayMonth(birthDate?: string | null): DayMonth | null {
  if (!birthDate) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(birthDate)
  if (!m) return null
  const month = Number(m[2])
  const day = Number(m[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return { day, month }
}

export function isLeapYear(year: number) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

/** Dia/mês em que o aniversário é celebrado no ano (29/02 vira 28/02 em ano não bissexto). */
export function celebrationDayMonth(dm: DayMonth, year: number): DayMonth {
  if (dm.month === 2 && dm.day === 29 && !isLeapYear(year)) return { day: 28, month: 2 }
  return dm
}

export interface SaoPauloNow {
  year: number
  month: number
  day: number
  weekday: number // 0=domingo
  hour: number
  minute: number
  second: number
}

export function getSaoPauloNow(now: Date = new Date()): SaoPauloNow {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SP_TZ,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(now)
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0)
  const year = get("year")
  const month = get("month")
  const day = get("day")
  return {
    year,
    month,
    day,
    weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  }
}

export function isBirthdayToday(birthDate: string | null | undefined, now: Date = new Date()): boolean {
  const dm = parseDayMonth(birthDate)
  if (!dm) return false
  const sp = getSaoPauloNow(now)
  const c = celebrationDayMonth(dm, sp.year)
  return c.day === sp.day && c.month === sp.month
}

/** Milissegundos até a próxima meia-noite de São Paulo (mínimo 1s). */
export function msUntilNextSaoPauloMidnight(now: Date = new Date()): number {
  const sp = getSaoPauloNow(now)
  const elapsed = ((sp.hour * 60 + sp.minute) * 60 + sp.second) * 1000 + now.getMilliseconds()
  return Math.max(1000, 24 * 60 * 60 * 1000 - elapsed)
}

export function weekdayOf(year: number, dm: DayMonth): number {
  const c = celebrationDayMonth(dm, year)
  return new Date(Date.UTC(year, c.month - 1, c.day)).getUTCDay()
}

export interface BirthdayEntry<T extends BirthdayLike> {
  member: T
  day: number
  month: number
}

export interface MonthGroup<T extends BirthdayLike> {
  month: number // 1-12
  entries: BirthdayEntry<T>[]
}

/** Agrupa por mês (só meses com aniversariantes), ordenando por dia e depois por nome. */
export function groupBirthdaysByMonth<T extends BirthdayLike>(members: T[]): MonthGroup<T>[] {
  const byMonth = new Map<number, BirthdayEntry<T>[]>()
  for (const member of members) {
    const dm = parseDayMonth(member.birthDate)
    if (!dm) continue
    const list = byMonth.get(dm.month) ?? []
    list.push({ member, day: dm.day, month: dm.month })
    byMonth.set(dm.month, list)
  }
  return [...byMonth.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([month, entries]) => ({
      month,
      entries: entries.sort((a, b) => a.day - b.day || a.member.fullName.localeCompare(b.member.fullName, "pt-BR")),
    }))
}

export const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
]
export const WEEKDAY_ABBR = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"]

// ---- "Visto" guardado no aparelho ----
export const BIRTHDAY_SEEN_KEY = "liturgiasje:birthday-seen"

export function birthdayNoticeId(profileId: string, year: number) {
  return `birthday-${profileId}-${year}`
}

export function readSeenBirthdays(): Set<string> {
  try {
    const raw = window.localStorage.getItem(BIRTHDAY_SEEN_KEY)
    const arr = raw ? JSON.parse(raw) : []
    return new Set(Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [])
  } catch {
    return new Set()
  }
}

export function saveSeenBirthday(noticeId: string): Set<string> {
  const current = readSeenBirthdays()
  current.add(noticeId)
  try {
    // mantém só os 50 mais recentes para não crescer sem limite
    window.localStorage.setItem(BIRTHDAY_SEEN_KEY, JSON.stringify([...current].slice(-50)))
  } catch {
    /* armazenamento indisponível: o "visto" vale só nesta sessão */
  }
  return current
}

export interface BirthdayNotice<T extends BirthdayLike> {
  id: string
  kind: "birthday"
  member: T
  isOwn: boolean
  isRead: boolean
  isPublished: true
}

/** Cards de aniversário do dia (virtuais, gerados pelo sistema). */
export function buildBirthdayNotices<T extends BirthdayLike>(
  members: T[],
  seen: ReadonlySet<string>,
  currentProfileId?: string | null,
  now: Date = new Date()
): BirthdayNotice<T>[] {
  const year = getSaoPauloNow(now).year
  return members
    .filter((m) => isBirthdayToday(m.birthDate, now))
    .map((member) => {
      const id = birthdayNoticeId(member.id, year)
      return { id, kind: "birthday" as const, member, isOwn: member.id === currentProfileId, isRead: seen.has(id), isPublished: true as const }
    })
}
