import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { ROLE_ORDER } from "./format"
import type { PlanMass, PlanReader } from "./types"

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function buildPreviewText(masses: PlanMass[], readers: PlanReader[], month: Date): string {
  const names = new Map(readers.map((r) => [r.id, r.fullName]))
  const sorted = [...masses].sort((a, b) =>
    a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date)
  )

  let text = `*PRÉVIA – Escala de ${capitalize(format(month, "MMMM/yyyy", { locale: ptBR }))} (não publicada)*\n\n`

  let currentDate = ""
  for (const mass of sorted) {
    if (mass.date !== currentDate) {
      currentDate = mass.date
      const d = new Date(`${mass.date}T00:00:00`)
      text += `*${format(d, "EEEE", { locale: ptBR })} – ${format(d, "dd/MM")}*\n`
    }
    text += `${mass.time.substring(0, 5)} - ${mass.description || "Missa"}\n`
    const slots = [...mass.slots].sort((a, b) => (ROLE_ORDER[a.role] ?? 99) - (ROLE_ORDER[b.role] ?? 99))
    for (const slot of slots) {
      const name = (slot.profileId && names.get(slot.profileId)) || "---"
      text += `${slot.role} - ${name}${slot.warning ? " ⚠️" : ""}\n`
    }
    text += "\n"
  }

  text += "⚠️ = fora da preferência do leitor"
  return text
}
