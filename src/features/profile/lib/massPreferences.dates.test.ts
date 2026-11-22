import { preferenceKeyForWeekday, preferredTimesForDate } from "./massPreferences"

const prefs = { "6": ["09:00", "19:00"], "2": ["19:00"], "5": ["19:00"] }

describe("preferências por data", () => {
  it("sábado não tem chave (não herda o domingo)", () => {
    expect(preferenceKeyForWeekday(6)).toBeNull()
    expect(preferredTimesForDate(prefs, "2026-11-21")).toEqual([]) // sábado
  })
  it("domingo usa a chave 6", () => {
    expect(preferredTimesForDate(prefs, "2026-11-22")).toEqual(["09:00", "19:00"]) // domingo
  })
  it("terça e sexta usam as próprias chaves", () => {
    expect(preferredTimesForDate(prefs, "2026-11-24")).toEqual(["19:00"]) // terça
    expect(preferredTimesForDate(prefs, "2026-11-27")).toEqual(["19:00"]) // sexta
    expect(preferredTimesForDate(prefs, "2026-11-23")).toEqual([]) // segunda
  })
  it("data inválida ou sem preferências", () => {
    expect(preferredTimesForDate(undefined, "2026-11-22")).toEqual([])
    expect(preferredTimesForDate(prefs, "lixo")).toEqual([])
  })
})
