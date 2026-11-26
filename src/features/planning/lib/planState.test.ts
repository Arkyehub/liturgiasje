import { parsePlanState, serializePlanState } from "./planState"
import type { PlanMass } from "./types"

function mass(over: Partial<PlanMass> = {}): PlanMass {
  return {
    key: "2026-12-06_07:00",
    date: "2026-12-06",
    time: "07:00",
    description: "",
    wasPublished: false,
    readOnly: false,
    slots: [{ role: "C", profileId: "", locked: false }],
    ...over,
  }
}

describe("serializePlanState", () => {
  it("descarta missas publicadas e mantém as demais", () => {
    const draft = mass({ key: "a" })
    const published = mass({ key: "b", id: "m-b", wasPublished: true, readOnly: true })
    const state = serializePlanState([draft, published], [], true)
    expect(state.masses.map((m) => m.key)).toEqual(["a"])
    expect(state.suggested).toBe(true)
  })

  it("mantém removedMasses completos, sem filtrar", () => {
    const removed = mass({ key: "r", id: "m-r" })
    expect(serializePlanState([], [removed], false).removedMasses).toEqual([removed])
  })

  it("não altera as entradas", () => {
    const masses = [mass({ key: "a" }), mass({ key: "b", wasPublished: true, readOnly: true })]
    const snapshot = JSON.parse(JSON.stringify(masses))
    serializePlanState(masses, [], false)
    expect(masses).toEqual(snapshot)
  })
})

describe("parsePlanState", () => {
  it("devolve null para entradas que não são o formato", () => {
    expect(parsePlanState(null)).toBeNull()
    expect(parsePlanState(undefined)).toBeNull()
    expect(parsePlanState("x")).toBeNull()
    expect(parsePlanState(42)).toBeNull()
    expect(parsePlanState([])).toBeNull()
    expect(parsePlanState({ masses: "x", removedMasses: [], suggested: false })).toBeNull()
    expect(parsePlanState({ masses: [], removedMasses: "x", suggested: false })).toBeNull()
    expect(parsePlanState({ masses: [], removedMasses: [], suggested: "sim" })).toBeNull()
    expect(parsePlanState({ masses: [] })).toBeNull()
  })

  it("rejeita missa ou vaga malformada", () => {
    const ok = serializePlanState([mass()], [], false)
    const bad = (patch: Record<string, unknown>) =>
      parsePlanState({ ...ok, masses: [{ ...ok.masses[0], ...patch }] })
    expect(bad({ date: 20261206 })).toBeNull()
    expect(bad({ date: "06/12/2026" })).toBeNull()
    expect(bad({ key: undefined })).toBeNull()
    expect(bad({ slots: "x" })).toBeNull()
    expect(bad({ slots: [null] })).toBeNull()
    expect(bad({ slots: [{ role: "X", profileId: "", locked: false }] })).toBeNull()
    expect(bad({ slots: [{ role: "C", profileId: 1, locked: false }] })).toBeNull()
    expect(bad({ slots: [{ role: "C", profileId: "", locked: "no" }] })).toBeNull()
    expect(bad({ slots: [{ role: "C", profileId: "", locked: false, warning: "x" }] })).toBeNull()
    expect(bad({ scheduleRevision: "1" })).toBeNull()
    expect(bad({ wasPublished: "false" })).toBeNull()
    expect(parsePlanState({ ...ok, removedMasses: [{ key: 1 }] })).toBeNull()
  })

  it("ida e volta preserva travas, avisos, motivos e troca pedida", () => {
    const m = mass({
      id: "m1",
      scheduleRevision: 3,
      description: "Festa",
      slots: [
        { id: "s1", role: "C", profileId: "p1", locked: true, isSwapRequested: true },
        { role: "1L", profileId: "p2", locked: false, warning: "outside-preference", reason: "equilíbrio" },
      ],
    })
    const removed = mass({ key: "r", id: "m-r" })
    const state = serializePlanState([m], [removed], true)
    const viaJson = parsePlanState(JSON.parse(JSON.stringify(state)))
    expect(viaJson).toEqual(state)
    expect(viaJson?.masses[0].slots[1]).toEqual(m.slots[1])
  })
})
