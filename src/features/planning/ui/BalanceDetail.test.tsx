import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { BalanceDetail } from "./BalanceDetail"
import type { PlanMass, PlanReader, ReaderStats, RoleCode } from "../lib/types"

jest.mock("lucide-react", () => new Proxy({ __esModule: true }, { get: (t, p) => (p in t ? (t as Record<string | symbol, unknown>)[p] : () => <i />) }))

const reader = (id: string, fullName: string): PlanReader => ({ id, fullName, createdAt: "2025-01-01", dayPreferences: {} })
const readers = [reader("a", "Ana Teste"), reader("b", "Bruno Teste"), reader("c", "Carla Teste")]

const stats = (readerId: string, extra: Partial<ReaderStats>): ReaderStats => ({
  readerId,
  monthlyAverage: 2,
  scheduled: 6,
  takeovers: 0,
  passed: 0,
  roleShare: { C: 0, R: 0, P: 0 },
  ...extra,
})

const massWith = (key: string, date: string, ids: string[]): PlanMass => ({
  key,
  date,
  time: "07:00",
  description: "",
  wasPublished: false,
  readOnly: false,
  slots: ids.map((profileId, i) => ({ role: (["C", "1L", "2L", "P"] as RoleCode[])[i], profileId, locked: false })),
})

// 12 vagas para 3 leitores → meta 4. Ana 6 (acima), Bruno 4 (na meta), Carla 1 (abaixo), 1 vazia.
const masses: PlanMass[] = [
  massWith("m1", "2026-12-06", ["a", "b", "c", ""]),
  massWith("m2", "2026-12-08", ["a", "b"]),
  massWith("m3", "2026-12-11", ["a", "b"]),
  massWith("m4", "2026-12-15", ["a", "b"]),
  massWith("m5", "2026-12-18", ["a"]),
  massWith("m6", "2026-12-22", ["a"]),
]
const allStats = {
  a: stats("a", { scheduled: 9, takeovers: 3, passed: 1, monthlyAverage: 4, roleShare: { C: 0.7, R: 0.2, P: 0.1 } }),
  b: stats("b", { scheduled: 6, takeovers: 0, passed: 2, monthlyAverage: 2, roleShare: { C: 0.1, R: 0.8, P: 0.1 } }),
  c: stats("c", { scheduled: 2, takeovers: 0, passed: 0, monthlyAverage: 0.7 }),
}

function renderDetail(onClose = jest.fn()) {
  render(
    <BalanceDetail
      masses={masses}
      readers={readers}
      stats={allStats}
      unavailable={{ "2026-12-13": ["c"], "2026-12-20": ["c"] }}
      monthLabel="Dezembro 2026"
      onClose={onClose}
    />,
  )
  return onClose
}

const rows = () => within(screen.getByRole("list", { name: "Equilíbrio por leitor" })).getAllByRole("listitem")

test("shows the target and how many readers are above / below it", () => {
  renderDetail()
  expect(screen.getByRole("heading", { name: "Equilíbrio do mês" })).toBeInTheDocument()
  expect(screen.getByText("Dezembro 2026 · 12 vagas para 3 leitores")).toBeInTheDocument()
  expect(screen.getByText("Meta").nextSibling).toHaveTextContent("4")
  expect(screen.getByText("Acima").nextSibling).toHaveTextContent("1 leitor")
  expect(screen.getByText("Abaixo").nextSibling).toHaveTextContent("1 leitor")
})

test("each reader shows name, most-done role, count vs target and scheduled / takeovers / passed", () => {
  renderDetail()
  const ana = rows().find((r) => within(r).queryByText("Ana Teste")) as HTMLElement
  expect(within(ana).getByText("Comentarista · 70%")).toBeInTheDocument()
  expect(within(ana).getByLabelText("6 de meta 4")).toBeInTheDocument()
  expect(within(ana).getByText("Últimos 3 meses: 9 escaladas · 3 trocas assumidas · 1 passada")).toBeInTheDocument()
  expect(within(ana).getByText(/Acima da meta/)).toBeInTheDocument()
  expect(within(ana).getByText(/assume trocas/)).toBeInTheDocument()

  const bruno = rows().find((r) => within(r).queryByText("Bruno Teste")) as HTMLElement
  expect(within(bruno).getByText("Leitura · 80%")).toBeInTheDocument()
  expect(within(bruno).getByLabelText("4 de meta 4")).toBeInTheDocument()
  expect(within(bruno).getByText("Últimos 3 meses: 6 escaladas · 0 trocas assumidas · 2 passadas")).toBeInTheDocument()
  expect(within(bruno).getByText(/Na meta/)).toBeInTheDocument()

  const carla = rows().find((r) => within(r).queryByText("Carla Teste")) as HTMLElement
  expect(within(carla).getByText("Sem histórico de funções")).toBeInTheDocument()
  expect(within(carla).getByLabelText("1 de meta 4")).toBeInTheDocument()
  expect(within(carla).getByText(/Abaixo da meta/)).toBeInTheDocument()
  expect(within(carla).getByText(/indisponível em 2 dias/)).toBeInTheDocument()
  expect(within(carla).getByText(/média baixa → prioridade/)).toBeInTheDocument()
})

test("readers are sorted from most to fewest this month, so above/below target stand out", () => {
  renderDetail()
  expect(rows().map((r) => r.getAttribute("data-reader"))).toEqual(["a", "b", "c"])
  expect(rows()[0]).toHaveAttribute("data-balance", "over")
  expect(rows()[1]).toHaveAttribute("data-balance", "on")
  expect(rows()[2]).toHaveAttribute("data-balance", "under")
})

test("the back button closes the detail", async () => {
  const onClose = renderDetail()
  await userEvent.click(screen.getByRole("button", { name: "Voltar às sugestões" }))
  expect(onClose).toHaveBeenCalledTimes(1)
})
