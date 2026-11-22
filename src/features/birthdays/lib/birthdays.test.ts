import {
  parseDayMonth, isBirthdayToday, groupBirthdaysByMonth, msUntilNextSaoPauloMidnight,
  celebrationDayMonth, buildBirthdayNotices, weekdayOf,
} from "./birthdays"

describe("birthdays lib", () => {
  it("lê dia/mês sem deslocar por fuso", () => {
    expect(parseDayMonth("1990-03-01")).toEqual({ day: 1, month: 3 })
    expect(parseDayMonth("1990-12-31T00:00:00Z")).toEqual({ day: 31, month: 12 })
    expect(parseDayMonth("lixo")).toBeNull()
    expect(parseDayMonth(null)).toBeNull()
  })

  it("29/02 é celebrado em 28/02 em ano não bissexto", () => {
    expect(celebrationDayMonth({ day: 29, month: 2 }, 2026)).toEqual({ day: 28, month: 2 })
    expect(celebrationDayMonth({ day: 29, month: 2 }, 2028)).toEqual({ day: 29, month: 2 })
  })

  it("isBirthdayToday usa o dia de São Paulo", () => {
    // 22/11/2026 01:00 UTC ainda é 21/11 em São Paulo (UTC-3)
    const now = new Date("2026-11-22T01:00:00Z")
    expect(isBirthdayToday("1990-11-21", now)).toBe(true)
    expect(isBirthdayToday("1990-11-22", now)).toBe(false)
    expect(isBirthdayToday("2000-02-29", new Date("2026-02-28T15:00:00Z"))).toBe(true)
  })

  it("calcula o tempo até a meia-noite de São Paulo", () => {
    // 23:00 em SP = 02:00 UTC do dia seguinte → falta 1h
    expect(msUntilNextSaoPauloMidnight(new Date("2026-11-22T02:00:00Z"))).toBe(60 * 60 * 1000)
  })

  it("agrupa por mês e ordena por dia e nome", () => {
    const groups = groupBirthdaysByMonth([
      { id: "1", fullName: "Zeca", birthDate: "1990-05-10" },
      { id: "2", fullName: "Ana", birthDate: "1991-05-10" },
      { id: "3", fullName: "Bia", birthDate: "1992-01-02" },
      { id: "4", fullName: "Sem data", birthDate: null },
    ])
    expect(groups.map((g) => g.month)).toEqual([1, 5])
    expect(groups[1].entries.map((e) => e.member.fullName)).toEqual(["Ana", "Zeca"])
  })

  it("monta cards do dia marcando próprio e já visto", () => {
    const now = new Date("2026-11-22T15:00:00Z")
    const members = [
      { id: "a", fullName: "Ana", birthDate: "1990-11-22" },
      { id: "b", fullName: "Beto", birthDate: "1990-11-23" },
    ]
    const notices = buildBirthdayNotices(members, new Set(["birthday-a-2026"]), "a", now)
    expect(notices).toHaveLength(1)
    expect(notices[0]).toMatchObject({ id: "birthday-a-2026", isOwn: true, isRead: true })
  })

  it("dia da semana de 22/11/2026 é domingo", () => {
    expect(weekdayOf(2026, { day: 22, month: 11 })).toBe(0)
  })
})
