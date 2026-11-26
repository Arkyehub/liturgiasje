import { plural, ROLE_ORDER, targetLabel, topRole } from "./format"
import type { ReaderStats } from "./types"

const stats = (roleShare: ReaderStats["roleShare"]): ReaderStats => ({
  readerId: "r",
  monthlyAverage: 1,
  scheduled: 0,
  takeovers: 0,
  passed: 0,
  roleShare,
})

test("targetLabel rounds a fractional target into a range", () => {
  expect(targetLabel(0)).toBe("—")
  expect(targetLabel(Number.NaN)).toBe("—")
  expect(targetLabel(4)).toBe("4")
  expect(targetLabel(1.75)).toBe("1 a 2")
})

test("plural picks the singular only for 1", () => {
  expect(plural(1, "missa", "missas")).toBe("1 missa")
  expect(plural(0, "missa", "missas")).toBe("0 missas")
})

test("topRole returns the dominant group, or null without history", () => {
  expect(topRole(undefined)).toBeNull()
  expect(topRole(stats({ C: 0, R: 0, P: 0 }))).toBeNull()
  expect(topRole(stats({ C: 0.2, R: 0.7, P: 0.1 }))).toEqual({ label: "Leitura", percent: 70 })
})

test("ROLE_ORDER sorts C, 1L, 2L, L, P", () => {
  const roles = ["P", "2L", "C", "1L"]
  expect([...roles].sort((a, b) => ROLE_ORDER[a] - ROLE_ORDER[b])).toEqual(["C", "1L", "2L", "P"])
})
