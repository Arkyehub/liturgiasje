import { isOutsidePreference, prefersMass } from "./slotPreference"
import type { PlanReader } from "./types"

const reader = (dayPreferences: Record<string, string[]>): PlanReader => ({ id: "r", fullName: "R", createdAt: "2025-01-01", dayPreferences })

test("prefersMass reads day_preferences for the mass's weekday (Sunday = '6')", () => {
  const r = reader({ "6": ["09:00"], "2": ["19:00"] })
  expect(prefersMass(r, { date: "2026-12-06", time: "09:00" })).toBe(true)
  expect(prefersMass(r, { date: "2026-12-06", time: "07:00" })).toBe(false)
  expect(prefersMass(r, { date: "2026-12-01", time: "19:00" })).toBe(true)
})

test("isOutsidePreference only flags preference-eligible day/times the reader did not mark", () => {
  const r = reader({ "6": ["09:00"] })
  expect(isOutsidePreference(r, { date: "2026-12-06", time: "07:00" })).toBe(true) // domingo 07:00
  expect(isOutsidePreference(r, { date: "2026-12-06", time: "09:00" })).toBe(false)
  expect(isOutsidePreference(r, { date: "2026-12-08", time: "19:00" })).toBe(true) // terça 19:00
  expect(isOutsidePreference(r, { date: "2026-12-06", time: "08:00" })).toBe(false) // horário fora da grade
  expect(isOutsidePreference(r, { date: "2026-12-05", time: "19:00" })).toBe(false) // sábado: sem preferência
  expect(isOutsidePreference(r, { date: "2026-12-09", time: "19:00" })).toBe(false) // quarta
})
