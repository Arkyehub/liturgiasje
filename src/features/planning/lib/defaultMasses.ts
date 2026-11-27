import { format, getDaysInMonth } from "date-fns"
import { PLANNER_ROLES, type StandardMass } from "@/domain/models/PlannerSettings"
import type { PlanMass } from "./types"

/**
 * Missas padrão do mês a partir das configurações do coordenador (dia da semana, horário, funções).
 * Não há nenhuma missa embutida: sem `standardMasses`, a lista é vazia. Data+horário já existentes são ignorados.
 */
export function buildDefaultMasses(
  month: Date,
  existing: { date: string; time: string }[],
  standardMasses: StandardMass[]
): PlanMass[] {
  if (standardMasses.length === 0) return []
  const taken = new Set(existing.map((e) => `${e.date}_${e.time}`))
  const monthPrefix = format(month, "yyyy-MM")
  const days = getDaysInMonth(month)
  const result: PlanMass[] = []

  for (let day = 1; day <= days; day++) {
    const date = `${monthPrefix}-${String(day).padStart(2, "0")}`
    const dow = new Date(`${date}T00:00:00`).getDay()
    const ofDay = standardMasses.filter((m) => m.weekday === dow).sort((a, b) => a.time.localeCompare(b.time))
    for (const standard of ofDay) {
      const key = `${date}_${standard.time}`
      if (taken.has(key)) continue
      taken.add(key)
      const roles = PLANNER_ROLES.filter((r) => standard.roles.includes(r))
      result.push({
        key,
        date,
        time: standard.time,
        description: "",
        wasPublished: false,
        readOnly: false,
        slots: roles.map((role) => ({ role, profileId: "", locked: false })),
      })
    }
  }
  return result
}
