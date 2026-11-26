import { buildDefaultMasses } from "./defaultMasses"
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

function prefReader(id: string, dayPreferences: Record<string, string[]>): PlanReader {
  return { ...reader(id), dayPreferences }
}

function loads(masses: PlanMass[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const m of masses) for (const s of m.slots) if (s.profileId) out[s.profileId] = (out[s.profileId] ?? 0) + 1
  return out
}

// Dez/2026: 05 = sábado, 06 = domingo, 08 = terça, 11 = sexta.
describe("suggestSchedule — pontuação", () => {
  it("prefere quem marcou preferência", () => {
    const A = prefReader("A", { "6": ["07:00"] })
    const B = prefReader("B", { "6": ["09:00"] })
    const out = suggestSchedule(input([mass("m1", "2026-12-06", [slot("C")], { time: "07:00" })], [B, A]))
    expect(out[0].slots[0].profileId).toBe("A")
    expect(out[0].slots[0].warning).toBeUndefined()
    expect(typeof out[0].slots[0].reason).toBe("string")
    expect(out[0].slots[0].reason?.length).toBeGreaterThan(0)
  })

  it("fora da preferência recebe aviso", () => {
    const A = prefReader("A", { "6": ["07:00"] })
    const B = prefReader("B", { "6": ["09:00"] })
    const out = suggestSchedule(
      input([mass("m1", "2026-12-06", [slot("C")], { time: "07:00" })], [A, B], { "2026-12-06": ["A"] })
    )
    expect(out[0].slots[0].profileId).toBe("B")
    expect(out[0].slots[0].warning).toBe("outside-preference")
  })

  it("sábado não gera aviso", () => {
    const A = prefReader("A", { "6": ["07:00"] })
    const out = suggestSchedule(input([mass("m1", "2026-12-05", [slot("C")], { time: "07:00" })], [A]))
    expect(out[0].slots[0].profileId).toBe("A")
    expect(out[0].slots[0].warning).toBeUndefined()
  })

  it("equilíbrio", () => {
    const four = ["A", "B", "C", "D"].map((id) => reader(id))
    const masses = ["2026-12-01", "2026-12-04", "2026-12-08", "2026-12-11"].map((d, i) =>
      mass(`m${i}`, d, [slot("C"), slot("L")])
    )
    expect(loads(suggestSchedule(input(masses, four)))).toEqual({ A: 2, B: 2, C: 2, D: 2 })

    const allPrefs = { "6": ["07:00", "09:00", "11:00", "19:00"], "2": ["19:00"], "5": ["19:00"] }
    const many = Array.from({ length: 22 }, (_, i) => prefReader(`r${String(i).padStart(2, "0")}`, allPrefs))
    const dec = buildDefaultMasses(new Date(2026, 11, 1), [])
    expect(dec).toHaveLength(25)
    expect(dec.reduce((n, m) => n + m.slots.length, 0)).toBe(82)
    const out = suggestSchedule(input(dec, many))
    expect(summarizePlan(out).empty).toBe(0)
    const counts = many.map((r) => loads(out)[r.id] ?? 0)
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1)
  })

  it("média mais baixa tem prioridade", () => {
    const A = reader("A")
    const B = reader("B")
    const i = input([mass("m1", "2026-12-08", [slot("C")])], [B, A])
    i.stats.A.monthlyAverage = 1
    i.stats.B.monthlyAverage = 5
    expect(suggestSchedule(i)[0].slots[0].profileId).toBe("A")
    // o desempate por nome também daria A; invertendo as médias, a escolha precisa virar B
    const i2 = input([mass("m1", "2026-12-08", [slot("C")])], [reader("A"), reader("B")])
    i2.stats.A.monthlyAverage = 5
    i2.stats.B.monthlyAverage = 1
    expect(suggestSchedule(i2)[0].slots[0].profileId).toBe("B")
  })

  it("afinidade", () => {
    const i = input([mass("m1", "2026-12-08", [slot("C"), slot("1L")])], [reader("A"), reader("B")])
    i.stats.A.roleShare = { C: 0.9, R: 0.1, P: 0 }
    i.stats.B.roleShare = { C: 0.1, R: 0.9, P: 0 }
    const out = suggestSchedule(i)
    expect(out[0].slots.map((s) => s.profileId)).toEqual(["A", "B"])

    const j = input([mass("m1", "2026-12-08", [slot("C"), slot("1L")])], [reader("A"), reader("B")])
    j.stats.A.roleShare = { C: 0.1, R: 0.9, P: 0 }
    j.stats.B.roleShare = { C: 0.9, R: 0.1, P: 0 }
    expect(suggestSchedule(j)[0].slots.map((s) => s.profileId)).toEqual(["B", "A"])
  })

  it("espaçamento", () => {
    const out = suggestSchedule(
      input(
        [
          mass("m1", "2026-12-06", [slot("C")], { time: "07:00" }),
          mass("m2", "2026-12-06", [slot("C")], { time: "09:00" }),
        ],
        [reader("A"), reader("B"), reader("C")]
      )
    )
    expect(out[0].slots[0].profileId).not.toBe("")
    expect(out[1].slots[0].profileId).not.toBe("")
    expect(out[0].slots[0].profileId).not.toBe(out[1].slots[0].profileId)
  })

  it("vagas mais restritas primeiro", () => {
    const masses = [mass("sun", "2026-12-06", [slot("C")]), mass("tue", "2026-12-08", [slot("C")])]
    const out = suggestSchedule(
      input(masses, [reader("X"), reader("Y")], { "2026-12-06": ["X"] })
    )
    expect(out.find((m) => m.key === "tue")?.slots[0].profileId).toBe("X")
    expect(out.find((m) => m.key === "sun")?.slots[0].profileId).toBe("Y")
  })

  it("travadas contam na carga", () => {
    const out = suggestSchedule(
      input(
        [
          mass("m1", "2026-12-08", [slot("C", { profileId: "A", locked: true })]),
          mass("m2", "2026-12-11", [slot("C")]),
        ],
        [reader("A"), reader("B")]
      )
    )
    expect(out[0].slots[0]).toEqual({ role: "C", profileId: "A", locked: true })
    expect(out[1].slots[0].profileId).toBe("B")
  })

  it("rodada de melhoria nunca mexe em travadas nem quebra regra dura", () => {
    const readers = ["A", "B", "C"].map((id) => reader(id))
    const masses = [
      mass("m1", "2026-12-08", [slot("C", { profileId: "A", locked: true }), slot("L")]),
      mass("m2", "2026-12-11", [slot("C"), slot("L")]),
      mass("m3", "2026-12-15", [slot("C"), slot("L")]),
    ]
    const out = suggestSchedule(input(masses, readers, { "2026-12-11": ["B"], "2026-12-15": ["B"] }))
    expect(out[0].slots[0]).toEqual({ role: "C", profileId: "A", locked: true })
    for (const m of out) {
      const ids = m.slots.map((s) => s.profileId).filter(Boolean)
      expect(new Set(ids).size).toBe(ids.length)
    }
    expect(out[1].slots.map((s) => s.profileId)).not.toContain("B")
    expect(out[2].slots.map((s) => s.profileId)).not.toContain("B")
    expect(summarizePlan(out).empty).toBe(0)
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
