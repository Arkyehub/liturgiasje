import { format, getDaysInMonth } from "date-fns"
import type { PlanMass, RoleCode } from "./types"

const WEEKDAY_ROLES: RoleCode[] = ["C", "L"]
const SUNDAY_ROLES: RoleCode[] = ["C", "1L", "2L", "P"]
const SUNDAY_TIMES = ["07:00", "09:00", "11:00", "19:00"]

export function buildDefaultMasses(
  month: Date,
  existing: { date: string; time: string }[]
): PlanMass[] {
  const taken = new Set(existing.map((e) => `${e.date}_${e.time}`))
  const monthPrefix = format(month, "yyyy-MM")
  const days = getDaysInMonth(month)
  const result: PlanMass[] = []

  for (let day = 1; day <= days; day++) {
    const date = `${monthPrefix}-${String(day).padStart(2, "0")}`
    const dow = new Date(`${date}T00:00:00`).getDay()
    let times: string[] = []
    let roles: RoleCode[] = []
    if (dow === 2 || dow === 5) {
      times = ["19:00"]
      roles = WEEKDAY_ROLES
    } else if (dow === 0) {
      times = SUNDAY_TIMES
      roles = SUNDAY_ROLES
    }
    for (const time of times) {
      const key = `${date}_${time}`
      if (taken.has(key)) continue
      result.push({
        key,
        date,
        time,
        description: "",
        wasPublished: false,
        readOnly: false,
        slots: roles.map((role) => ({ role, profileId: "", locked: false })),
      })
    }
  }
  return result
}
