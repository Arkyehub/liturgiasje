import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import PlanejamentoPage from "./page"
import { useAuth } from "@/shared/hooks/useAuth"
import { makeListSchedulesForMonth, makeListSlotHistory } from "@/main/factories/usecases/schedule"
import { makeListProfiles, makeListUnavailableForRange } from "@/main/factories/usecases/profiles"
import type { Mass } from "@/domain/models/Schedule"
import type { Profile } from "@/domain/models/Profile"

const push = jest.fn()
jest.mock("next/navigation", () => ({ useRouter: () => ({ push, back: jest.fn() }) }))
jest.mock("@/shared/hooks/useAuth", () => ({ useAuth: jest.fn() }))
jest.mock("@/main/factories/usecases/schedule", () => ({
  makeListSchedulesForMonth: jest.fn(),
  makeListSlotHistory: jest.fn(),
}))
jest.mock("@/main/factories/usecases/profiles", () => ({
  makeListProfiles: jest.fn(),
  makeListUnavailableForRange: jest.fn(),
}))
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }))
jest.mock("lucide-react", () => new Proxy({ __esModule: true }, { get: (t, p) => (p in t ? (t as Record<string | symbol, unknown>)[p] : () => <i />) }))

const asAdmin = () =>
  (useAuth as jest.Mock).mockReturnValue({ user: { id: "auth-admin" }, profile: { id: "admin", role: "admin" }, loading: false })
const asReader = () =>
  (useAuth as jest.Mock).mockReturnValue({ user: { id: "auth-r" }, profile: { id: "r", role: "reader" }, loading: false })

const profile = (id: string): Profile => ({
  id, fullName: `Leitor ${id}`, role: "reader", authUserId: `auth-${id}`, archivedAt: null, createdAt: "2025-01-01", updatedAt: "2025-01-01",
})

const publishedMass = (id: string, time: string): Mass => ({
  id,
  date: "2026-12-06",
  time,
  isPublished: true,
  monthReference: "2026-12",
  slots: [{ id: `s-${id}`, massId: id, role: "C", profileId: "a", isConfirmed: false, isSwapRequested: false, createdAt: "2026-11-01" }],
})

function setup(masses: Mass[] = []) {
  ;(makeListSchedulesForMonth as jest.Mock).mockReturnValue({ execute: jest.fn().mockResolvedValue(masses) })
  ;(makeListSlotHistory as jest.Mock).mockReturnValue({ execute: jest.fn().mockResolvedValue([]) })
  ;(makeListProfiles as jest.Mock).mockReturnValue({ execute: jest.fn().mockResolvedValue([profile("a"), profile("b")]) })
  ;(makeListUnavailableForRange as jest.Mock).mockReturnValue({ execute: jest.fn().mockResolvedValue({}) })
}

beforeEach(() => {
  push.mockClear()
  // Só o relógio é falso: a página abre no mês atual (dezembro de 2026).
  jest.useFakeTimers({
    now: new Date(2026, 11, 10, 12),
    doNotFake: [
      "hrtime", "nextTick", "performance", "queueMicrotask", "requestAnimationFrame", "cancelAnimationFrame",
      "requestIdleCallback", "cancelIdleCallback", "setImmediate", "clearImmediate", "setInterval", "clearInterval",
      "setTimeout", "clearTimeout",
    ],
  })
})
afterEach(() => jest.useRealTimers())

test("a non-admin is sent back to the home page", async () => {
  asReader()
  setup()
  render(<PlanejamentoPage />)
  await waitFor(() => expect(push).toHaveBeenCalledWith("/"))
  expect(makeListSchedulesForMonth).not.toHaveBeenCalled()
})

test("the admin sees the title, the month and the summary", async () => {
  asAdmin()
  setup()
  render(<PlanejamentoPage />)
  expect(await screen.findByRole("heading", { name: "Planejamento de Escala" })).toBeInTheDocument()
  expect(screen.getByText("Dezembro 2026")).toBeInTheDocument()
  expect(await screen.findByText("0 missas · 0 vagas · 2 leitores aptos")).toBeInTheDocument()
  expect(push).not.toHaveBeenCalled()
})

test("creating the default masses on an empty December shows 25 masses / 82 slots in notebook lines", async () => {
  asAdmin()
  setup()
  render(<PlanejamentoPage />)
  await screen.findByText("0 missas · 0 vagas · 2 leitores aptos")

  await userEvent.click(screen.getByRole("button", { name: /Criar Missas Padrões no mês/ }))
  expect(screen.getByText("25 missas · 82 vagas · 2 leitores aptos")).toBeInTheDocument()
  expect(screen.getByText("82 vagas sem leitor")).toBeInTheDocument()

  // a data (06 + DOM) aparece só na 1ª das 4 missas do domingo
  const list = screen.getByRole("list", { name: "Missas do mês" })
  expect(within(list).getAllByText("06")).toHaveLength(1)
  const sunday = within(list).getAllByRole("listitem").filter((li) => li.getAttribute("data-date") === "2026-12-06")
  expect(sunday).toHaveLength(4)
  expect(within(sunday[0]).getByText("06")).toBeInTheDocument()
  expect(within(sunday[0]).getByText("DOM")).toBeInTheDocument()
  expect(within(sunday[1]).queryByText("DOM")).not.toBeInTheDocument()
  expect(within(sunday[0]).getByText("07:00")).toBeInTheDocument()
  expect(within(sunday[0]).getByText("C · 1L · 2L · P")).toBeInTheDocument()
  const tuesday = within(list).getAllByRole("listitem").find((li) => li.getAttribute("data-date") === "2026-12-01") as HTMLElement
  expect(within(tuesday).getByText("C · L")).toBeInTheDocument()
  expect(within(tuesday).getByText("TER")).toBeInTheDocument()
})

test("with 2 published masses the notice offers to include them; including makes them editable", async () => {
  asAdmin()
  setup([publishedMass("m1", "07:00:00"), publishedMass("m2", "09:00:00")])
  render(<PlanejamentoPage />)
  const notice = await screen.findByRole("alertdialog")
  expect(within(notice).getByText(/Existem 2 missas publicadas em dezembro/)).toBeInTheDocument()
  expect(within(notice).getByText(/voltarão a rascunho/)).toBeInTheDocument()
  expect(within(notice).getByText(/deixam de ver/)).toBeInTheDocument()
  expect(within(notice).getByText(/lembretes/)).toBeInTheDocument()

  await userEvent.click(within(notice).getByRole("button", { name: "Incluir no planejamento" }))
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
  expect(screen.queryByText("publicada")).not.toBeInTheDocument()
  expect(screen.getAllByText("volta a rascunho ao salvar")).toHaveLength(2)
})

test("keeping published masses leaves them read-only with a 'publicada' mark", async () => {
  asAdmin()
  setup([publishedMass("m1", "07:00:00"), publishedMass("m2", "09:00:00")])
  render(<PlanejamentoPage />)
  const notice = await screen.findByRole("alertdialog")
  await userEvent.click(within(notice).getByRole("button", { name: "Manter somente leitura" }))
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
  expect(screen.getAllByText("publicada")).toHaveLength(2)
  // linhas somente leitura não abrem edição
  const rows = within(screen.getByRole("list", { name: "Missas do mês" })).getAllByRole("button")
  rows.forEach((b) => expect(b).toBeDisabled())
})
