import { buildPreviewText } from "./previewText"
import type { PlanMass, PlanReader } from "./types"

const readers: PlanReader[] = [
  { id: "r1", fullName: "Ana Ribeiro", createdAt: "2026-01-01", dayPreferences: {} },
  { id: "r2", fullName: "Carla Mendes", createdAt: "2026-01-01", dayPreferences: {} },
  { id: "r3", fullName: "Diego Souza", createdAt: "2026-01-01", dayPreferences: {} },
]

const masses: PlanMass[] = [
  {
    key: "b", date: "2026-12-04", time: "19:00", description: "", wasPublished: false, readOnly: false,
    slots: [
      { role: "L", profileId: "", locked: false },
      { role: "C", profileId: "r3", locked: false },
    ],
  },
  {
    key: "a", date: "2026-12-01", time: "19:00", description: "", wasPublished: false, readOnly: false,
    slots: [
      { role: "L", profileId: "r2", locked: false, warning: "outside-preference" },
      { role: "C", profileId: "r1", locked: false },
    ],
  },
]

describe("buildPreviewText", () => {
  const text = buildPreviewText(masses, readers, new Date("2026-12-01T00:00:00"))

  it("contém as linhas esperadas na ordem", () => {
    const parts = [
      "*PRÉVIA – Escala de Dezembro/2026 (não publicada)*",
      "*terça-feira – 01/12*",
      "19:00 - Missa",
      "C - Ana Ribeiro",
      "L - Carla Mendes ⚠️",
      "*sexta-feira – 04/12*",
      "C - Diego Souza",
      "L - ---",
      "⚠️ = fora da preferência do leitor",
    ]
    let pos = -1
    for (const p of parts) {
      const i = text.indexOf(p, pos + 1)
      expect(i).toBeGreaterThan(pos)
      pos = i
    }
  })

  it("usa a descrição especial quando existir", () => {
    const m = [{ ...masses[0], description: "Missa de Natal" }]
    expect(buildPreviewText(m, readers, new Date("2026-12-01T00:00:00"))).toContain("19:00 - Missa de Natal")
  })

  it("não contém e-mail nem dígitos de telefone", () => {
    expect(text).not.toContain("@")
    expect(text).not.toMatch(/\d{4,}[-\s]?\d{4}/)
  })
})
