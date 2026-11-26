import type { PlanMass, PlanReader, PlanSlot, PlanSummary, SuggestInput } from "./types"

interface PickContext {
  mass: PlanMass
  slot: PlanSlot
}

/**
 * Escolhe o leitor para uma vaga entre candidatos já elegíveis pelas regras duras.
 * Critério neutro e determinístico (fullName, depois id). Ponto de extensão da pontuação.
 */
function pickReader(candidates: PlanReader[], ctx: PickContext): PlanReader | null {
  void ctx
  if (candidates.length === 0) return null
  return [...candidates].sort(
    (a, b) => a.fullName.localeCompare(b.fullName, "pt-BR") || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  )[0]
}

function suggestMass(mass: PlanMass, input: SuggestInput): PlanMass {
  if (mass.readOnly) return mass

  const unavailable = new Set(input.unavailable[mass.date] ?? [])
  const used = new Set<string>()
  for (const s of mass.slots) {
    if (s.locked && s.profileId) used.add(s.profileId)
  }

  const slots = mass.slots.map((slot): PlanSlot => {
    if (slot.locked) return slot
    const candidates = input.readers.filter((r) => !unavailable.has(r.id) && !used.has(r.id))
    const chosen = pickReader(candidates, { mass, slot })
    const { warning: _w, reason: _r, ...rest } = slot
    void _w
    void _r
    if (!chosen) return { ...rest, profileId: "" }
    used.add(chosen.id)
    return { ...rest, profileId: chosen.id }
  })

  return { ...mass, slots }
}

export function suggestSchedule(input: SuggestInput): PlanMass[] {
  return input.masses.map((m) => suggestMass(m, input))
}

export function summarizePlan(masses: PlanMass[]): PlanSummary {
  let totalSlots = 0
  let filled = 0
  let outsidePreference = 0
  let locked = 0
  for (const m of masses) {
    for (const s of m.slots) {
      totalSlots++
      if (s.profileId !== "") filled++
      if (s.warning === "outside-preference") outsidePreference++
      if (s.locked) locked++
    }
  }
  return { totalSlots, filled, empty: totalSlots - filled, outsidePreference, locked }
}
