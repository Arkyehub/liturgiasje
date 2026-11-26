import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { ReadOnlyBanner } from "./ReadOnlyBanner"

const NOW = new Date("2026-11-26T12:00:00Z")
beforeEach(() => {
  jest.useFakeTimers({ advanceTimers: true })
  jest.setSystemTime(NOW)
})
afterEach(() => jest.useRealTimers())

const lastSeen = "2026-11-26T09:00:00Z"

it("other-owner: SOMENTE LEITURA, nome do dono e dica de duplicar", () => {
  render(<ReadOnlyBanner reason="other-owner" ownerName="Maria" lastSeen={lastSeen} />)
  const banner = screen.getByRole("status")
  expect(banner).toHaveTextContent("SOMENTE LEITURA")
  expect(banner).toHaveTextContent("Planejamento de Maria")
  expect(banner).toHaveTextContent(/Duplicar para mim/)
  expect(screen.queryByRole("button")).not.toBeInTheDocument()
})

it("other-device: texto com última atividade e botão Editar", async () => {
  const onReopen = jest.fn()
  render(<ReadOnlyBanner reason="other-device" ownerName="Eu" lastSeen={lastSeen} onReopen={onReopen} />)
  expect(screen.getByRole("status")).toHaveTextContent("SOMENTE LEITURA")
  expect(screen.getByRole("status")).toHaveTextContent("Aberto em outro aparelho (última atividade há 3 horas)")
  await userEvent.click(screen.getByRole("button", { name: "Editar" }))
  expect(onReopen).toHaveBeenCalledTimes(1)
})

it("other-device sem lastSeen omite o parêntese", () => {
  render(<ReadOnlyBanner reason="other-device" ownerName={null} lastSeen={null} onReopen={jest.fn()} />)
  expect(screen.getByRole("status")).toHaveTextContent("Aberto em outro aparelho")
  expect(screen.getByRole("status")).not.toHaveTextContent("última atividade")
})

it("lost-lock: informa as alterações não salvas e oferece Editar", async () => {
  const onReopen = jest.fn()
  render(<ReadOnlyBanner reason="lost-lock" ownerName="Eu" lastSeen={null} lostChanges={3} onReopen={onReopen} />)
  const banner = screen.getByRole("status")
  expect(banner).toHaveTextContent("Você perdeu a reserva deste planejamento")
  expect(banner).toHaveTextContent("3 alterações não foram salvas")
  await userEvent.click(screen.getByRole("button", { name: "Editar" }))
  expect(onReopen).toHaveBeenCalledTimes(1)
})

it("lost-lock com 1 alteração usa o singular e com 0 não menciona", () => {
  const { rerender } = render(<ReadOnlyBanner reason="lost-lock" ownerName={null} lastSeen={null} lostChanges={1} />)
  expect(screen.getByRole("status")).toHaveTextContent("1 alteração não foi salva")
  rerender(<ReadOnlyBanner reason="lost-lock" ownerName={null} lastSeen={null} lostChanges={0} />)
  expect(screen.getByRole("status")).not.toHaveTextContent(/não foi|não foram/)
})

it("concluded: Planejamento concluído com Reabrir", async () => {
  const onReopen = jest.fn()
  render(<ReadOnlyBanner reason="concluded" ownerName="Eu" lastSeen={null} onReopen={onReopen} />)
  expect(screen.getByRole("status")).toHaveTextContent("Planejamento concluído")
  await userEvent.click(screen.getByRole("button", { name: "Reabrir" }))
  expect(onReopen).toHaveBeenCalledTimes(1)
})
