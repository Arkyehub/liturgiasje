import { buildDefaultMasses } from "./defaultMasses"
import { SAMPLE_STANDARD } from "./testFixtures"

describe("buildDefaultMasses", () => {
  it("sem missas padrão configuradas não cria nada", () => {
    expect(buildDefaultMasses(new Date(2026, 11, 1), [], [])).toEqual([])
  })

  describe("estrutura de exemplo em dezembro/2026", () => {
    const masses = buildDefaultMasses(new Date(2026, 11, 1), [], SAMPLE_STANDARD)
    const at = (d: string) => masses.filter((m) => m.date === d)

    it("gera 25 missas e 82 vagas", () => {
      expect(masses).toHaveLength(25)
      expect(masses.reduce((n, m) => n + m.slots.length, 0)).toBe(82)
    })
    it("terças e sextas 19:00 com C,L", () => {
      for (const d of ["01", "08", "15", "22", "29", "04", "11", "18", "25"]) {
        const l = at(`2026-12-${d}`)
        expect(l).toHaveLength(1)
        expect(l[0].time).toBe("19:00")
        expect(l[0].slots.map((s) => s.role)).toEqual(["C", "L"])
      }
    })
    it("domingos com 4 horários e C,1L,2L,P", () => {
      for (const d of ["06", "13", "20", "27"]) {
        const l = at(`2026-12-${d}`)
        expect(l.map((m) => m.time)).toEqual(["07:00", "09:00", "11:00", "19:00"])
        l.forEach((m) => expect(m.slots.map((s) => s.role)).toEqual(["C", "1L", "2L", "P"]))
      }
    })
    it("valores iniciais e keys únicas", () => {
      masses.forEach((m) => {
        expect(m.wasPublished).toBe(false)
        expect(m.readOnly).toBe(false)
        m.slots.forEach((s) => {
          expect(s.profileId).toBe("")
          expect(s.locked).toBe(false)
        })
      })
      expect(new Set(masses.map((m) => m.key)).size).toBe(25)
    })
    it("ignora missas existentes", () => {
      const r = buildDefaultMasses(new Date(2026, 11, 1), [{ date: "2026-12-06", time: "07:00" }], SAMPLE_STANDARD)
      expect(r).toHaveLength(24)
      expect(r.some((m) => m.date === "2026-12-06" && m.time === "07:00")).toBe(false)
    })
  })

  it("usa só o que o coordenador configurou: um horário numa quarta, funções em ordem canônica", () => {
    const r = buildDefaultMasses(new Date(2026, 11, 1), [], [{ weekday: 3, time: "06:30", roles: ["P", "C"] }])
    expect(r.map((m) => m.date)).toEqual(["2026-12-02", "2026-12-09", "2026-12-16", "2026-12-23", "2026-12-30"])
    r.forEach((m) => {
      expect(m.time).toBe("06:30")
      expect(m.slots.map((s) => s.role)).toEqual(["C", "P"])
    })
  })

  it("dois padrões iguais não duplicam a missa", () => {
    const r = buildDefaultMasses(new Date(2026, 11, 1), [], [
      { weekday: 3, time: "06:30", roles: ["C"] },
      { weekday: 3, time: "06:30", roles: ["L"] },
    ])
    expect(r).toHaveLength(5)
  })
})
