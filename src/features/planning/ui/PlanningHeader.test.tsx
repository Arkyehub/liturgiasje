import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { PlanningHeader } from "./PlanningHeader"

jest.mock("lucide-react", () => new Proxy({ __esModule: true }, { get: (t, p) => (p in t ? (t as Record<string | symbol, unknown>)[p] : () => <i />) }))

function setup(props: Partial<React.ComponentProps<typeof PlanningHeader>> = {}) {
  const handlers = { onChangePlan: jest.fn(), onCreateDefaults: jest.fn(), onAddMass: jest.fn() }
  render(<PlanningHeader monthLabel="Dezembro 2026" massCount={1} slotCount={3} readerCount={2} {...handlers} {...props} />)
  return handlers
}

test("shows the month label and counts, without month arrows", () => {
  setup()
  expect(screen.getByText("Dezembro 2026")).toBeInTheDocument()
  expect(screen.getByText("1 missa · 3 vagas · 2 leitores aptos")).toBeInTheDocument()
  expect(screen.queryByRole("button", { name: "Mês anterior" })).not.toBeInTheDocument()
  expect(screen.queryByRole("button", { name: "Próximo mês" })).not.toBeInTheDocument()
})

test("'Trocar planejamento' calls onChangePlan and is a 44px target", async () => {
  const { onChangePlan } = setup()
  const button = screen.getByRole("button", { name: "Trocar planejamento" })
  expect(button.className).toMatch(/min-h-11/)
  await userEvent.click(button)
  expect(onChangePlan).toHaveBeenCalledTimes(1)
})

test("changeDisabled disables only 'Trocar planejamento'", async () => {
  const { onChangePlan } = setup({ changeDisabled: true })
  const button = screen.getByRole("button", { name: "Trocar planejamento" })
  expect(button).toBeDisabled()
  await userEvent.click(button)
  expect(onChangePlan).not.toHaveBeenCalled()
  expect(screen.getByRole("button", { name: /Criar Missas Padrões no mês/ })).toBeEnabled()
})

test("actionsDisabled disables the creation actions", () => {
  setup({ actionsDisabled: true })
  expect(screen.getByRole("button", { name: /Criar Missas Padrões no mês/ })).toBeDisabled()
  expect(screen.getByRole("button", { name: "Adicionar missa" })).toBeDisabled()
  expect(screen.getByRole("button", { name: "Trocar planejamento" })).toBeEnabled()
})
