import { reconcilePlan } from "./reconcilePlan"
import type { PlanState } from "./planState"
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
const real = (id: string, date: string, time: string, rev = 1, published = false): PlanMass =>
  mass({ key: id, id, scheduleRevision: rev, date, time, wasPublished: published, readOnly: published })
const state = (masses: PlanMass[], removedMasses: PlanMass[] = [], suggested = true): PlanState => ({
  masses,
  removedMasses,
  suggested,
})

describe("reconcilePlan", () => {
  it("(a) sem estado guardado devolve o real, ordenado, sem avisos", () => {
    const r = [real("b", "2026-12-07", "09:00"), real("a", "2026-12-06", "07:00")]
    const out = reconcilePlan(null, r)
    expect(out.masses.map((m) => m.id)).toEqual(["a", "b"])
    expect(out.removedMasses).toEqual([])
    expect(out.suggested).toBe(false)
    expect(out.notices).toEqual([])
  })

  it("(b) revisão igual mantém a versão guardada", () => {
    const stored = mass({ key: "m1", id: "m1", scheduleRevision: 2, description: "editada", date: "2026-12-06", time: "07:00" })
    const out = reconcilePlan(state([stored]), [real("m1", "2026-12-06", "07:00", 2)])
    expect(out.masses).toHaveLength(1)
    expect(out.masses[0].description).toBe("editada")
    expect(out.suggested).toBe(true)
    expect(out.notices).toEqual([])
  })

  it("(c) revisão real diferente: vale a real e avisa changed", () => {
    const stored = mass({ key: "m1", id: "m1", scheduleRevision: 2, description: "editada" })
    const out = reconcilePlan(state([stored]), [real("m1", "2026-12-06", "07:00", 3)])
    expect(out.masses).toHaveLength(1)
    expect(out.masses[0].scheduleRevision).toBe(3)
    expect(out.masses[0].description).toBe("")
    expect(out.notices).toEqual([{ kind: "changed", dates: ["2026-12-06"] }])
  })

  it("(d) missa guardada com id que sumiu do real sai do plano e avisa removed", () => {
    const stored = mass({ key: "m9", id: "m9", scheduleRevision: 1, date: "2026-12-13" })
    const out = reconcilePlan(state([stored]), [])
    expect(out.masses).toEqual([])
    expect(out.notices).toEqual([{ kind: "removed", dates: ["2026-12-13"] }])
  })

  it("(e) real publicada entra readOnly e descarta a guardada do mesmo horário com aviso published", () => {
    const stored = mass({ key: "2026-12-06_07:00", description: "minha" })
    const pub = real("p1", "2026-12-06", "07:00", 1, true)
    const out = reconcilePlan(state([stored]), [pub])
    expect(out.masses).toHaveLength(1)
    expect(out.masses[0]).toMatchObject({ id: "p1", readOnly: true, wasPublished: true })
    expect(out.notices).toEqual([{ kind: "published", dates: ["2026-12-06"] }])
  })

  it("(e2) guardada com id que passou a publicada: vale a real publicada e avisa published", () => {
    const stored = mass({ key: "m1", id: "m1", scheduleRevision: 1 })
    const out = reconcilePlan(state([stored]), [real("m1", "2026-12-06", "07:00", 2, true)])
    expect(out.masses).toHaveLength(1)
    expect(out.masses[0].readOnly).toBe(true)
    expect(out.notices).toEqual([{ kind: "published", dates: ["2026-12-06"] }])
  })

  it("publicada sem conflito entra sem aviso e não atrapalha guardada de outro horário", () => {
    const stored = mass({ key: "2026-12-06_19:00", time: "19:00" })
    const out = reconcilePlan(state([stored]), [real("p1", "2026-12-06", "07:00", 1, true)])
    expect(out.masses.map((m) => m.time)).toEqual(["07:00", "19:00"])
    expect(out.notices).toEqual([])
  })

  it("(f) real nova (rascunho fora do estado) entra normalmente", () => {
    const kept = mass({ key: "m1", id: "m1", scheduleRevision: 1 })
    const out = reconcilePlan(state([kept]), [
      real("m1", "2026-12-06", "07:00", 1),
      real("n1", "2026-12-13", "09:00", 1),
    ])
    expect(out.masses.map((m) => m.id)).toEqual(["m1", "n1"])
    expect(out.notices).toEqual([])
  })

  it("(g) guardada sem id no mesmo dia e horário de uma real: real vence com changed", () => {
    const stored = mass({ key: "2026-12-06_07:00", description: "minha" })
    const out = reconcilePlan(state([stored]), [real("r1", "2026-12-06", "07:00", 1)])
    expect(out.masses).toHaveLength(1)
    expect(out.masses[0].id).toBe("r1")
    expect(out.notices).toEqual([{ kind: "changed", dates: ["2026-12-06"] }])
  })

  it("guardada sem id sem conflito é mantida", () => {
    const stored = mass({ key: "2026-12-20_09:00", date: "2026-12-20", time: "09:00" })
    const out = reconcilePlan(state([stored]), [])
    expect(out.masses).toEqual([stored])
    expect(out.notices).toEqual([])
  })

  it("(h) estado inválido recebido gera invalid-state e usa o real", () => {
    const r = [real("a", "2026-12-06", "07:00")]
    const out = reconcilePlan(null, r, true)
    expect(out.masses.map((m) => m.id)).toEqual(["a"])
    expect(out.notices).toEqual([{ kind: "invalid-state", dates: [] }])
  })

  it("agrupa avisos por tipo com datas únicas e ordenadas", () => {
    const s1 = mass({ key: "m1", id: "m1", scheduleRevision: 1, date: "2026-12-20", time: "09:00" })
    const s2 = mass({ key: "m2", id: "m2", scheduleRevision: 1, date: "2026-12-06", time: "09:00" })
    const s3 = mass({ key: "m3", id: "m3", scheduleRevision: 1, date: "2026-12-06", time: "11:00" })
    const out = reconcilePlan(state([s1, s2, s3]), [
      real("m1", "2026-12-20", "09:00", 5),
      real("m2", "2026-12-06", "09:00", 5),
    ])
    expect(out.notices).toEqual([
      { kind: "changed", dates: ["2026-12-06", "2026-12-20"] },
      { kind: "removed", dates: ["2026-12-06"] },
    ])
  })

  it("removedMasses só ficam se a real existe, não é publicada e tem a mesma revisão; a removida não volta a masses", () => {
    const keep = mass({ key: "k", id: "k", scheduleRevision: 1 })
    const gone = mass({ key: "g", id: "g", scheduleRevision: 1 })
    const pub = mass({ key: "p", id: "p", scheduleRevision: 1 })
    const out = reconcilePlan(state([], [keep, gone, pub]), [
      real("k", "2026-12-06", "07:00", 1),
      real("p", "2026-12-07", "07:00", 1, true),
    ])
    expect(out.removedMasses.map((m) => m.id)).toEqual(["k"])
    expect(out.masses.map((m) => m.id)).toEqual(["p"])
    expect(out.notices).toEqual([])
  })

  it("remoção com revisão real diferente cai: a real volta ao plano com aviso changed", () => {
    const removed = mass({ key: "k", id: "k", scheduleRevision: 1, date: "2026-12-13" })
    const out = reconcilePlan(state([], [removed]), [real("k", "2026-12-13", "07:00", 2)])
    expect(out.removedMasses).toEqual([])
    expect(out.masses.map((m) => m.id)).toEqual(["k"])
    expect(out.masses[0].scheduleRevision).toBe(2)
    expect(out.notices).toEqual([{ kind: "changed", dates: ["2026-12-13"] }])
  })

  it("nunca devolve duas missas com a mesma key e ordena por data e hora", () => {
    const dup1 = mass({ key: "2026-12-06_07:00" })
    const dup2 = mass({ key: "2026-12-06_07:00", time: "08:00" })
    const out = reconcilePlan(state([dup2, dup1]), [real("2026-12-06_07:00", "2026-12-13", "07:00")])
    const keys = out.masses.map((m) => m.key)
    expect(new Set(keys).size).toBe(keys.length)
    expect(out.masses.map((m) => `${m.date} ${m.time}`)).toEqual(["2026-12-06 07:00", "2026-12-06 08:00", "2026-12-13 07:00"])
    expect(out.masses.find((m) => m.id)?.key).toBe("2026-12-06_07:00")
  })

  it("não altera as entradas", () => {
    const s = state([mass({ key: "m1", id: "m1", scheduleRevision: 1 })])
    const r = [real("m1", "2026-12-06", "07:00", 2)]
    const a = JSON.parse(JSON.stringify(s))
    const b = JSON.parse(JSON.stringify(r))
    reconcilePlan(s, r)
    expect(s).toEqual(a)
    expect(r).toEqual(b)
  })

  it("reabrir depois de salvar como rascunho: o rascunho real (com id e vagas travadas) vence a versão antiga do plano", () => {
    const stored = mass({ key: "2026-12-06_07:00", slots: [{ role: "C", profileId: "p1", locked: false }] }) // sem id, vaga só sugerida
    const draft = mass({ key: "d1", id: "d1", scheduleRevision: 3, slots: [{ id: "s1", role: "C", profileId: "p1", locked: true }] })
    const out = reconcilePlan(state([stored]), [draft])
    expect(out.masses).toHaveLength(1)
    expect(out.masses[0]).toMatchObject({ id: "d1", wasPublished: false, readOnly: false })
    expect(out.masses[0].slots[0].locked).toBe(true)
  })

  it("data publicada depois: a missa do plano naquele horário é descartada com aviso e a publicada entra somente leitura", () => {
    const stored = mass({ key: "x", id: "d1", scheduleRevision: 1 })
    const out = reconcilePlan(state([stored]), [real("d1", "2026-12-06", "07:00", 2, true)])
    expect(out.masses).toHaveLength(1)
    expect(out.masses[0]).toMatchObject({ id: "d1", wasPublished: true, readOnly: true })
    expect(out.notices).toEqual([{ kind: "published", dates: ["2026-12-06"] }])
  })
})
