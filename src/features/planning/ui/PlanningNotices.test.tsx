import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { PlanningNotices } from "./PlanningNotices"

jest.mock("lucide-react", () => new Proxy({ __esModule: true }, { get: (t, p) => (p in t ? (t as Record<string | symbol, unknown>)[p] : () => <i />) }))

test("shows one box per kind with sorted dd/MM dates", () => {
  render(
    <PlanningNotices
      notices={[
        { kind: "changed", dates: ["2026-12-20", "2026-12-06"] },
        { kind: "removed", dates: ["2026-12-13"] },
        { kind: "published", dates: ["2026-12-25", "2026-12-08"] },
        { kind: "invalid-state", dates: [] },
      ]}
    />,
  )
  expect(screen.getByText("A escala mudou fora do planejamento: 06/12, 20/12")).toBeInTheDocument()
  expect(screen.getByText("Missas removidas fora do planejamento: 13/12")).toBeInTheDocument()
  expect(
    screen.getByText("Datas que agora estão publicadas (a edição do planejamento nelas foi descartada): 08/12, 25/12"),
  ).toBeInTheDocument()
  expect(screen.getByText("O planejamento guardado estava corrompido e foi ignorado.")).toBeInTheDocument()
})

test("dismissing one box keeps the others", async () => {
  render(
    <PlanningNotices
      notices={[
        { kind: "changed", dates: ["2026-12-06"] },
        { kind: "removed", dates: ["2026-12-13"] },
      ]}
    />,
  )
  const [first] = screen.getAllByRole("button", { name: "Dispensar aviso" })
  expect(first.className).toMatch(/h-11/)
  await userEvent.click(first)
  expect(screen.queryByText(/A escala mudou/)).not.toBeInTheDocument()
  expect(screen.getByText("Missas removidas fora do planejamento: 13/12")).toBeInTheDocument()
})

test("renders nothing without notices", () => {
  const { container } = render(<PlanningNotices notices={[]} />)
  expect(container).toBeEmptyDOMElement()
})
