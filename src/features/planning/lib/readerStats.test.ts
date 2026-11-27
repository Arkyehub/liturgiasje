import { computeReaderStats } from "./readerStats"
import type { PlanReader } from "./types"
import type { SlotHistoryRow } from "@/domain/models/Schedule"

const MONTH = new Date("2026-12-01T00:00:00")

function reader(id: string, createdAt = "2025-01-01T10:00:00Z"): PlanReader {
  return { id, fullName: id, createdAt, dayPreferences: {} }
}
function row(date: string, profileId: string, role = "1L", originalProfileId?: string | null): SlotHistoryRow {
  return { date, role, profileId, originalProfileId }
}

describe("computeReaderStats", () => {
  it("conta escalada cumprida, troca assumida e passada", () => {
    const s = computeReaderStats(
      [reader("A"), reader("B")],
      [row("2026-11-01", "A", "1L", null), row("2026-11-08", "B", "1L", "A")],
      MONTH,
    )
    expect(s.A.scheduled).toBe(1)
    expect(s.A.passed).toBe(1)
    expect(s.A.monthlyAverage).toBeCloseTo(1 / 3)
    expect(s.B.takeovers).toBe(1)
    expect(s.B.scheduled).toBe(0)
  })

  it("passed do passador nao conta como servida", () => {
    const s = computeReaderStats(
      [reader("A"), reader("B")],
      [row("2026-11-08", "B", "1L", "A")],
      MONTH,
    )
    expect(s.A.passed).toBe(1)
    expect(s.A.scheduled).toBe(0)
    expect(s.A.monthlyAverage).toBe(0)
    expect(s.B.monthlyAverage).toBeCloseTo(1 / 3)
  })

  it("originalProfileId ausente conta como escalada", () => {
    const s = computeReaderStats([reader("A")], [row("2026-11-01", "A")], MONTH)
    expect(s.A.scheduled).toBe(1)
    expect(s.A.takeovers).toBe(0)
  })

  it("media 3 meses; historico fora da janela nao entra mas entra no roleShare", () => {
    const rows = [
      row("2026-09-05", "A"), row("2026-09-12", "A"),
      row("2026-10-05", "A"), row("2026-10-12", "A"),
      row("2026-11-05", "A"), row("2026-11-12", "A"),
      row("2026-05-05", "A", "C"),
    ]
    const s = computeReaderStats([reader("A")], rows, MONTH)
    expect(s.A.monthlyAverage).toBe(2)
    expect(s.A.roleShare.C).toBeCloseTo(1 / 7)
  })

  it("leitor recente usa meses desde a entrada", () => {
    const rows = [row("2026-10-05", "A"), row("2026-11-05", "A"), row("2026-11-12", "A")]
    const s = computeReaderStats(
      [reader("A", "2026-10-15T12:00:00Z"), reader("B", "2026-11-20T12:00:00Z")],
      [...rows, row("2026-11-05", "B"), row("2026-11-12", "B"), row("2026-11-19", "B")],
      MONTH,
    )
    expect(s.A.monthlyAverage).toBe(1.5)
    expect(s.B.monthlyAverage).toBe(3)
  })

  it("novato do mes planejado recebe media do grupo", () => {
    const s = computeReaderStats(
      [reader("A"), reader("B"), reader("N", "2026-12-02T10:00:00Z")],
      [row("2026-11-01", "A"), row("2026-11-02", "A"), row("2026-11-03", "A")],
      MONTH,
    )
    expect(s.A.monthlyAverage).toBe(1)
    expect(s.B.monthlyAverage).toBe(0)
    expect(s.N.monthlyAverage).toBe(0.5)
  })

  it("sem ninguem com meses, media do grupo e 0", () => {
    const s = computeReaderStats([reader("N", "2026-12-02T10:00:00Z")], [], MONTH)
    expect(s.N.monthlyAverage).toBe(0)
  })

  it("ignora linhas do mes planejado ou posteriores", () => {
    const s = computeReaderStats(
      [reader("A")],
      [row("2026-12-01", "A"), row("2027-01-10", "A")],
      MONTH,
    )
    expect(s.A.scheduled).toBe(0)
    expect(s.A.monthlyAverage).toBe(0)
  })

  it("roleShare por grupo", () => {
    const rows = [row("2026-11-01", "A", "1L")]
    for (let i = 1; i <= 14; i++) rows.push(row(`2026-10-${String(i).padStart(2, "0")}`, "A", "C"))
    const s = computeReaderStats([reader("A"), reader("B")], rows, MONTH)
    expect(s.A.roleShare.C).toBeCloseTo(14 / 15)
    expect(s.A.roleShare.R).toBeCloseTo(1 / 15)
    expect(s.A.roleShare.P).toBe(0)
    expect(s.B.roleShare).toEqual({ C: 0, R: 0, P: 0 })
  })
})
