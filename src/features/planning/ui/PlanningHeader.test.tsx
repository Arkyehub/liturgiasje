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

test("a engrenagem não aparece sem onOpenSettings", () => {
  setup()
  expect(screen.queryByRole("button", { name: "Configurações do planejamento" })).not.toBeInTheDocument()
})

test("engrenagem chama onOpenSettings", async () => {
  const onOpenSettings = jest.fn()
  setup({ onOpenSettings })
  await userEvent.click(screen.getByRole("button", { name: "Configurações do planejamento" }))
  expect(onOpenSettings).toHaveBeenCalledTimes(1)
})

test("createDefaultsDisabled desabilita só o botão de padrões", () => {
  setup({ createDefaultsDisabled: true })
  expect(screen.getByRole("button", { name: /Criar Missas Padrões no mês/ })).toBeDisabled()
  expect(screen.getByRole("button", { name: "Adicionar missa" })).toBeEnabled()
})

test("dica 'no-standard' leva à engrenagem; 'not-empty' é só texto", async () => {
  const onOpenSettings = jest.fn()
  const { rerender } = (() => {
    const view = render(
      <PlanningHeader monthLabel="Dezembro 2026" massCount={0} slotCount={0} readerCount={2} onChangePlan={jest.fn()} onCreateDefaults={jest.fn()}
        createDefaultsDisabled createDefaultsHint="no-standard" onOpenSettings={onOpenSettings} />,
    )
    return view
  })()
  await userEvent.click(screen.getByRole("button", { name: "Defina suas missas padrão na engrenagem" }))
  expect(onOpenSettings).toHaveBeenCalledTimes(1)
  rerender(
    <PlanningHeader monthLabel="Dezembro 2026" massCount={2} slotCount={3} readerCount={2} onChangePlan={jest.fn()} onCreateDefaults={jest.fn()}
      createDefaultsDisabled createDefaultsHint="not-empty" onOpenSettings={onOpenSettings} />,
  )
  expect(screen.getByText("Disponível só com a lista em branco")).toBeInTheDocument()
  expect(screen.queryByRole("button", { name: "Defina suas missas padrão na engrenagem" })).not.toBeInTheDocument()
})

test("dica 'load-error' avisa que não foi possível ler as missas padrão e leva à engrenagem", async () => {
  const onOpenSettings = jest.fn()
  setup({ createDefaultsDisabled: true, createDefaultsHint: "load-error", onOpenSettings })
  await userEvent.click(screen.getByRole("button", { name: /Não foi possível ler suas missas padrão/ }))
  expect(onOpenSettings).toHaveBeenCalledTimes(1)
  expect(screen.queryByText("Defina suas missas padrão na engrenagem")).not.toBeInTheDocument()
})
