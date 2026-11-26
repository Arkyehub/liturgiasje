import { computeDraftReplacement, refreshRevisions } from "./draftReplacement"
import type { PlanMass } from "./types"

function mass(over: Partial<PlanMass> = {}): PlanMass {
  return {
    key: "k",
    date: "2026-12-06",
    time: "07:00",
    description: "",
    wasPublished: false,
    readOnly: false,
    slots: [],
    ...over,
  }
}
const real = (id: string, date: string, time: string, rev = 1, published = false): PlanMass =>
  mass({ key: id, id, scheduleRevision: rev, date, time, wasPublished: published, readOnly: published })

describe("computeDraftReplacement", () => {
  it("inclui rascunhos reais de datas cobertas pelo plano cujo id não está no plano", () => {
    const plan = [mass({ key: "n1" }), mass({ key: "m1", id: "m1", scheduleRevision: 1, time: "09:00" })]
    const now = [real("m1", "2026-12-06", "09:00"), real("m2", "2026-12-06", "19:00")]
    const out = computeDraftReplacement(plan, now)
    expect(out.replaced.map((m) => m.id)).toEqual(["m2"])
    expect(out.dates).toEqual(["2026-12-06"])
  })

  it("não inclui rascunhos de datas que o plano não cobre", () => {
    const out = computeDraftReplacement([mass()], [real("m2", "2026-12-13", "09:00")])
    expect(out).toEqual({ replaced: [], dates: [] })
  })

  it("nunca inclui publicadas", () => {
    const out = computeDraftReplacement([mass()], [real("p1", "2026-12-06", "19:00", 1, true)])
    expect(out.replaced).toEqual([])
  })

  it("data coberta só por missa publicada do plano não conta", () => {
    const plan = [mass({ key: "p", id: "p1", date: "2026-12-06", wasPublished: true, readOnly: true })]
    const out = computeDraftReplacement(plan, [real("d1", "2026-12-06", "19:00")])
    expect(out).toEqual({ replaced: [], dates: [] })
  })

  it("inclui missa do plano que mudou por fora (revisão diferente) e não a que não mudou", () => {
    const plan = [
      mass({ key: "m1", id: "m1", scheduleRevision: 1, time: "07:00" }),
      mass({ key: "m2", id: "m2", scheduleRevision: 1, time: "09:00" }),
    ]
    const now = [real("m1", "2026-12-06", "07:00", 2), real("m2", "2026-12-06", "09:00", 1)]
    const out = computeDraftReplacement(plan, now)
    expect(out.replaced.map((m) => m.id)).toEqual(["m1"])
    expect(out.dates).toEqual(["2026-12-06"])
  })

  it("ids removidos pelo plano não entram em replaced", () => {
    const plan = [mass({ key: "n1" })]
    const removed = [mass({ key: "r", id: "r1", scheduleRevision: 1 })]
    const now = [real("r1", "2026-12-06", "19:00", 1), real("x1", "2026-12-06", "21:00", 1)]
    expect(computeDraftReplacement(plan, now, removed).replaced.map((m) => m.id)).toEqual(["x1"])
    expect(computeDraftReplacement(plan, now).replaced.map((m) => m.id)).toEqual(["r1", "x1"])
  })

  it("dates ordenadas e sem repetição", () => {
    const plan = [mass({ date: "2026-12-20" }), mass({ key: "x", date: "2026-12-06" })]
    const now = [
      real("a", "2026-12-20", "07:00"),
      real("b", "2026-12-20", "09:00"),
      real("c", "2026-12-06", "09:00"),
    ]
    const out = computeDraftReplacement(plan, now)
    expect(out.replaced).toHaveLength(3)
    expect(out.dates).toEqual(["2026-12-06", "2026-12-20"])
  })
})

describe("refreshRevisions", () => {
  it("atualiza scheduleRevision das missas com id, sem tocar nas outras nem mutar", () => {
    const plan = [mass({ key: "m1", id: "m1", scheduleRevision: 1 }), mass({ key: "n1" }), mass({ key: "m9", id: "m9", scheduleRevision: 4 })]
    const snapshot = JSON.parse(JSON.stringify(plan))
    const out = refreshRevisions(plan, [real("m1", "2026-12-06", "07:00", 7)])
    expect(out[0].scheduleRevision).toBe(7)
    expect(out[1]).toBe(plan[1])
    expect(out[2].scheduleRevision).toBe(4)
    expect(plan).toEqual(snapshot)
    expect(out).not.toBe(plan)
  })
})
