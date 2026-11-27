import { planToBatch } from "./planToBatch"
import type { PlanMass } from "./types"

const UUID = "123e4567-e89b-42d3-a456-426614174000"

function mass(over: Partial<PlanMass> = {}): PlanMass {
  return {
    key: "k",
    date: "2026-12-05",
    time: "07:00",
    description: "Missa especial",
    wasPublished: false,
    readOnly: false,
    slots: [],
    ...over,
  }
}

describe("planToBatch", () => {
  it("missa nova gera entrada sem massId", () => {
    const r = planToBatch([mass()], [])
    expect(r.entries).toHaveLength(1)
    expect(r.entries[0].massId).toBeUndefined()
    expect(r.entries[0].massData).toEqual({
      date: "2026-12-05",
      time: "07:00:00",
      specialDescription: "Missa especial",
      monthReference: "2026-12",
      expectedRevision: undefined,
    })
  })

  it("missa existente preserva massId, revisão e id real dos slots", () => {
    const m = mass({
      id: "m1",
      scheduleRevision: 4,
      slots: [
        { id: UUID, role: "C", profileId: "p1", locked: false },
        { id: "tmp-1", role: "1L", profileId: "p2", locked: false },
      ],
    })
    const e = planToBatch([m], []).entries[0]
    expect(e.massId).toBe("m1")
    expect(e.massData.expectedRevision).toBe(4)
    expect(e.slots).toEqual([
      { id: UUID, role: "C", profileId: "p1" },
      { id: undefined, role: "1L", profileId: "p2" },
    ])
  })

  it("vaga vazia grava profileId vazio", () => {
    const e = planToBatch([mass({ slots: [{ role: "P", profileId: "", locked: false }] })], []).entries[0]
    expect(e.slots).toEqual([{ id: undefined, role: "P", profileId: "" }])
  })

  it("missas readOnly não geram entrada", () => {
    const r = planToBatch([mass({ id: "a", readOnly: true, wasPublished: true }), mass({ id: "b" })], [])
    expect(r.entries.map((e) => e.massId)).toEqual(["b"])
  })

  it("removed só inclui as que têm id", () => {
    const r = planToBatch([], [mass({ id: "x", scheduleRevision: 2 }), mass()])
    expect(r.removed).toEqual([{ id: "x", expectedRevision: 2 }])
  })

  it("isSwapRequested não vai para o lote: só id, função e leitor", () => {
    const m = mass({ id: "m1", slots: [{ id: UUID, role: "C", profileId: "p1", locked: true, isSwapRequested: true }] })
    expect(planToBatch([m], []).entries[0].slots).toEqual([{ id: UUID, role: "C", profileId: "p1" }])
  })
})
