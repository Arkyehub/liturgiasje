import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { SaveIndicator } from "./SaveIndicator"

it("idle não renderiza nada visível", () => {
  const { container } = render(<SaveIndicator status="idle" />)
  expect(container).toHaveTextContent("")
})

it("saving mostra Salvando…", () => {
  render(<SaveIndicator status="saving" />)
  expect(screen.getByText("Salvando…")).toBeInTheDocument()
})

it("saved mostra Salvo", () => {
  render(<SaveIndicator status="saved" />)
  expect(screen.getByText("Salvo")).toBeInTheDocument()
})

it("failed mostra botão que chama onRetry", async () => {
  const onRetry = jest.fn()
  render(<SaveIndicator status="failed" onRetry={onRetry} />)
  await userEvent.click(screen.getByRole("button", { name: "Falhou — tentar de novo" }))
  expect(onRetry).toHaveBeenCalledTimes(1)
})

it("a região é aria-live polite", () => {
  const { container } = render(<SaveIndicator status="saved" />)
  expect(container.querySelector('[aria-live="polite"]')).toHaveTextContent("Salvo")
})
