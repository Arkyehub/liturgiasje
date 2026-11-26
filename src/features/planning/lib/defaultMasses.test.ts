import { buildDefaultMasses } from "./defaultMasses"

describe("buildDefaultMasses (dezembro/2026)", () => {
  const masses = buildDefaultMasses(new Date(2026, 11, 1), [])
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
    const r = buildDefaultMasses(new Date(2026, 11, 1), [{ date: "2026-12-06", time: "07:00" }])
    expect(r).toHaveLength(24)
    expect(r.some((m) => m.date === "2026-12-06" && m.time === "07:00")).toBe(false)
  })
})
