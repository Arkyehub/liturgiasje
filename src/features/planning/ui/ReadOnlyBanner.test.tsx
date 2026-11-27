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

it("concluded: Planejamento concluído com Reabrir", async () => {
  const onReopen = jest.fn()
  render(<ReadOnlyBanner reason="concluded" ownerName="Eu" lastSeen={null} onReopen={onReopen} />)
  expect(screen.getByRole("status")).toHaveTextContent("Planejamento concluído")
  await userEvent.click(screen.getByRole("button", { name: "Reabrir" }))
  expect(onReopen).toHaveBeenCalledTimes(1)
})
