import { suggestSchedule, summarizePlan } from "./suggestSchedule"
import type { PlanMass, PlanReader, PlanSlot, ReaderStats, SuggestInput } from "./types"

function reader(id: string, fullName = id): PlanReader {
  return { id, fullName, createdAt: "2025-01-01T00:00:00Z", dayPreferences: {} }
}

function stats(readers: PlanReader[]): Record<string, ReaderStats> {
  const out: Record<string, ReaderStats> = {}
  for (const r of readers) {
    out[r.id] = {
      readerId: r.id,
      monthlyAverage: 0,
      scheduled: 0,
      takeovers: 0,
      passed: 0,
      roleShare: { C: 0, R: 0, P: 0 },
    }
  }
  return out
}

function slot(role: PlanSlot["role"], extra: Partial<PlanSlot> = {}): PlanSlot {
  return { role, profileId: "", locked: false, ...extra }
}

function mass(key: string, date: string, slots: PlanSlot[], extra: Partial<PlanMass> = {}): PlanMass {
  return {
    key,
    date,
    time: "19:00",
    description: "Missa",
    wasPublished: false,
    readOnly: false,
    slots,
    ...extra,
  }
}

function input(masses: PlanMass[], readers: PlanReader[], unavailable: Record<string, string[]> = {}): SuggestInput {
  return { masses, readers, stats: stats(readers), unavailable }
}

describe("suggestSchedule", () => {
  it("nunca sugere leitor indisponível na data", () => {
    const out = suggestSchedule(
      input([mass("m1", "2026-12-06", [slot("C")])], [reader("A"), reader("B")], { "2026-12-06": ["A"] })
    )
    expect(out[0].slots[0].profileId).toBe("B")
  })

  it("vaga fica vazia quando ninguém é elegível", () => {
    const out = suggestSchedule(
      input([mass("m1", "2026-12-06", [slot("C"), slot("1L")])], [reader("A")], { "2026-12-06": ["A"] })
    )
    expect(out[0].slots.map((s) => s.profileId)).toEqual(["", ""])

    const out2 = suggestSchedule(
      input(
        [mass("m1", "2026-12-06", [slot("C")]), mass("m2", "2026-12-07", [slot("C")])],
        [reader("A")],
        { "2026-12-06": ["A"] }
      )
    )
    expect(out2[0].slots[0].profileId).toBe("")
    expect(out2[1].slots[0].profileId).toBe("A")
  })

  it("não repete leitor na mesma missa", () => {
    const out = suggestSchedule(
      input(
        [mass("m1", "2026-12-06", [slot("C"), slot("1L"), slot("2L"), slot("P")])],
        [reader("A"), reader("B"), reader("C")]
      )
    )
    const filled = out[0].slots.filter((s) => s.profileId !== "")
    expect(filled).toHaveLength(3)
    expect(new Set(filled.map((s) => s.profileId)).size).toBe(3)
    expect(out[0].slots.filter((s) => s.profileId === "")).toHaveLength(1)
  })

  it("preserva vagas travadas e missas readOnly", () => {
    const readOnlyMass = mass("m2", "2026-12-07", [slot("C", { profileId: "B" })], { readOnly: true })
    const m1 = mass("m1", "2026-12-06", [
      slot("C", { profileId: "A", locked: true }),
      slot("1L", { profileId: "B" }),
    ])
    const out = suggestSchedule(input([m1, readOnlyMass], [reader("A"), reader("B"), reader("C")]))
    expect(out[0].slots[0]).toEqual({ role: "C", profileId: "A", locked: true })
    expect(out[1]).toEqual(readOnlyMass)
    // A travado conta como ocupado; vaga refeita nunca usa A
    expect(out[0].slots[1].profileId).not.toBe("A")
    expect(out[0].slots[1].profileId).toBe("B")
  })

  it("entrada não é mutada e resultado é determinístico", () => {
    const i = input(
      [mass("m1", "2026-12-06", [slot("C", { profileId: "A" }), slot("1L")])],
      [reader("B", "Bia"), reader("A", "Ana")]
    )
    const before = JSON.stringify(i)
    const r1 = suggestSchedule(i)
    const r2 = suggestSchedule(i)
    expect(JSON.stringify(i)).toBe(before)
    expect(r1).toEqual(r2)
    expect(r1).not.toBe(i.masses)
  })

  it("mês sem missas ou sem leitores", () => {
    expect(suggestSchedule(input([], [reader("A")]))).toEqual([])
    const out = suggestSchedule(input([mass("m1", "2026-12-06", [slot("C"), slot("1L")])], []))
    expect(out[0].slots.every((s) => s.profileId === "")).toBe(true)
  })
})

describe("summarizePlan", () => {
  it("conta vagas, preenchidas, vazias, fora de preferência e travadas", () => {
    const m = mass("m1", "2026-12-06", [
      slot("C", { profileId: "A", locked: true }),
      slot("1L", { profileId: "B", warning: "outside-preference" }),
      slot("2L", { profileId: "C", locked: true }),
      slot("L"),
      slot("P"),
    ])
    expect(summarizePlan([m])).toEqual({
      totalSlots: 5,
      filled: 3,
      empty: 2,
      outsidePreference: 1,
      locked: 2,
    })
  })
})
