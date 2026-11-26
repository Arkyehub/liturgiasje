import { otherMassTimes } from "./massConflicts"
import type { PlanMass } from "./types"

const m = (key: string, date: string, time: string): PlanMass => ({ key, date, time, description: "", wasPublished: false, readOnly: false, slots: [] })

test("excludes only the mass being edited, by key", () => {
  const plan = [m("a", "2026-12-08", "19:00"), m("b", "2026-12-08", "19:00"), m("c", "2026-12-09", "07:00")]
  expect(otherMassTimes(plan, "a")).toEqual([{ date: "2026-12-08", time: "19:00" }, { date: "2026-12-09", time: "07:00" }])
  expect(otherMassTimes(plan)).toHaveLength(3)
})
