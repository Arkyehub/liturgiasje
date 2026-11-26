import { act, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import PlanejamentoPage from "./page"
import { useAuth } from "@/shared/hooks/useAuth"
import {
  makeListSchedulesForMonth,
  makeListSlotHistory,
  makeSaveScheduleBatch,
  makeUpdateMassesStatus,
} from "@/main/factories/usecases/schedule"
import { makeConcludePlan } from "@/main/factories/usecases/plans"
import { makeListProfiles, makeListUnavailableForRange } from "@/main/factories/usecases/profiles"
import type { Mass } from "@/domain/models/Schedule"
import type { Profile } from "@/domain/models/Profile"
import { resetSync } from "@/features/planning/hooks/planSyncTestDouble"

const push = jest.fn()
jest.mock("next/navigation", () => ({ useRouter: () => ({ push, back: jest.fn() }) }))
jest.mock("@/shared/hooks/useAuth", () => ({ useAuth: jest.fn() }))
jest.mock("@/main/factories/usecases/schedule", () => ({
  makeListSchedulesForMonth: jest.fn(),
  makeListSlotHistory: jest.fn(),
  makeSaveScheduleBatch: jest.fn(),
  makeUpdateMassesStatus: jest.fn(),
}))
jest.mock("@/main/factories/usecases/plans", () => ({ makeConcludePlan: jest.fn() }))
jest.mock("@/main/factories/usecases/profiles", () => ({
  makeListProfiles: jest.fn(),
  makeListUnavailableForRange: jest.fn(),
}))
jest.mock("@/features/planning/hooks/usePlanSync", () => jest.requireActual("@/features/planning/hooks/planSyncTestDouble"))
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warning: jest.fn() } }))
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

let saveBatch: jest.Mock
let updateStatus: jest.Mock
let conclude: jest.Mock

function setup(masses: Mass[] = []) {
  conclude = jest.fn().mockResolvedValue(undefined)
  ;(makeConcludePlan as jest.Mock).mockReturnValue({ execute: conclude })
  saveBatch = jest.fn().mockResolvedValue(undefined)
  updateStatus = jest.fn().mockResolvedValue(undefined)
  ;(makeSaveScheduleBatch as jest.Mock).mockReturnValue({ execute: saveBatch })
  ;(makeUpdateMassesStatus as jest.Mock).mockReturnValue({ execute: updateStatus })
  ;(makeListSchedulesForMonth as jest.Mock).mockReturnValue({ execute: jest.fn().mockResolvedValue(masses) })
  ;(makeListSlotHistory as jest.Mock).mockReturnValue({ execute: jest.fn().mockResolvedValue([]) })
  ;(makeListProfiles as jest.Mock).mockReturnValue({ execute: jest.fn().mockResolvedValue([profile("a"), profile("b")]) })
  ;(makeListUnavailableForRange as jest.Mock).mockReturnValue({ execute: jest.fn().mockResolvedValue({}) })
}

beforeEach(() => {
  jest.clearAllMocks()
  resetSync()
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

// A página abre sem mês: o teste escolhe o mês (por padrão o atual, dezembro de 2026) antes de qualquer leitura.
async function openPage(optionName: RegExp = /^Dezembro 2026/) {
  const view = render(<PlanejamentoPage />)
  await userEvent.click(await screen.findByRole("button", { name: optionName }))
  return view
}

test("a non-admin is sent back to the home page", async () => {
  asReader()
  setup()
  render(<PlanejamentoPage />)
  await waitFor(() => expect(push).toHaveBeenCalledWith("/"))
  expect(makeListSchedulesForMonth).not.toHaveBeenCalled()
  expect(makeListProfiles).not.toHaveBeenCalled()
  expect(makeListSlotHistory).not.toHaveBeenCalled()
  expect(makeListUnavailableForRange).not.toHaveBeenCalled()
  expect(screen.queryByText("Qual mês você vai planejar?")).not.toBeInTheDocument()
})

test("on entry no month is selected and nothing is read: the page asks which month to plan", async () => {
  asAdmin()
  setup([publishedMass("m1", "07:00:00")])
  render(<PlanejamentoPage />)
  expect(await screen.findByRole("heading", { name: "Qual mês você vai planejar?" })).toBeInTheDocument()
  expect(makeListSchedulesForMonth).not.toHaveBeenCalled()
  expect(makeListProfiles).not.toHaveBeenCalled()
  expect(makeListSlotHistory).not.toHaveBeenCalled()
  expect(makeListUnavailableForRange).not.toHaveBeenCalled()
  // sem aviso de publicadas, sem cabeçalho de mês, sem rodapé/lâmpada, sem lista
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
  expect(screen.queryByRole("button", { name: "Mês anterior" })).not.toBeInTheDocument()
  expect(screen.queryByRole("button", { name: "Sugerir escala" })).not.toBeInTheDocument()
  expect(screen.queryByRole("list", { name: "Missas do mês" })).not.toBeInTheDocument()
  expect(push).not.toHaveBeenCalled()
})

test("the chooser offers the current month, the next one marked 'Sugerido' and the one after", async () => {
  asAdmin()
  setup()
  render(<PlanejamentoPage />)
  const current = await screen.findByRole("button", { name: /^Dezembro 2026/ })
  const next = screen.getByRole("button", { name: /^Janeiro 2027/ })
  const after = screen.getByRole("button", { name: /^Fevereiro 2027/ })
  expect(screen.getAllByRole("button")).toHaveLength(3)
  expect(within(next).getByText("Sugerido")).toBeInTheDocument()
  expect(within(current).queryByText("Sugerido")).not.toBeInTheDocument()
  expect(within(after).queryByText("Sugerido")).not.toBeInTheDocument()
  // toque grande (>= 44px): classe min-h-14 = 56px
  ;[current, next, after].forEach((b) => expect(b.className).toMatch(/min-h-1[1-9]|min-h-[2-9]\d/))
})

test("choosing the next month reads with that month's ranges and then shows the published notice", async () => {
  asAdmin()
  const listMonth = jest.fn().mockResolvedValue([{ ...publishedMass("m1", "07:00:00"), date: "2027-01-03", monthReference: "2027-01" }])
  const listHistory = jest.fn().mockResolvedValue([])
  const listUnavailable = jest.fn().mockResolvedValue({})
  setup()
  ;(makeListSchedulesForMonth as jest.Mock).mockReturnValue({ execute: listMonth })
  ;(makeListSlotHistory as jest.Mock).mockReturnValue({ execute: listHistory })
  ;(makeListUnavailableForRange as jest.Mock).mockReturnValue({ execute: listUnavailable })
  render(<PlanejamentoPage />)
  await userEvent.click(await screen.findByRole("button", { name: /^Janeiro 2027/ }))

  const notice = await screen.findByRole("alertdialog")
  expect(within(notice).getByText(/Existe 1 missa publicada em janeiro/)).toBeInTheDocument()
  expect(listMonth).toHaveBeenCalledTimes(1)
  expect(listMonth).toHaveBeenCalledWith(new Date(2027, 0, 1), true)
  expect(listHistory).toHaveBeenCalledWith("2026-01-01", "2026-12-31")
  expect(listUnavailable).toHaveBeenCalledWith("2027-01-01", "2027-01-31")
  expect(screen.getByText("Janeiro 2027")).toBeInTheDocument()
  expect(screen.queryByText("Qual mês você vai planejar?")).not.toBeInTheDocument()
})

test("after choosing a month the header arrows still change it", async () => {
  asAdmin()
  setup()
  await openPage(/^Janeiro 2027/)
  await screen.findByText("0 missas · 0 vagas · 2 leitores aptos")
  expect(screen.getByText("Janeiro 2027")).toBeInTheDocument()
  await userEvent.click(screen.getByRole("button", { name: "Próximo mês" }))
  expect(screen.getByText("Fevereiro 2027")).toBeInTheDocument()
  await userEvent.click(screen.getByRole("button", { name: "Mês anterior" }))
  await userEvent.click(screen.getByRole("button", { name: "Mês anterior" }))
  expect(screen.getByText("Dezembro 2026")).toBeInTheDocument()
  await screen.findByText("0 missas · 0 vagas · 2 leitores aptos")
})

test("the admin sees the title, the month and the summary", async () => {
  asAdmin()
  setup()
  await openPage()
  expect(await screen.findByRole("heading", { name: "Planejamento de Escala" })).toBeInTheDocument()
  expect(screen.getByText("Dezembro 2026")).toBeInTheDocument()
  expect(await screen.findByText("0 missas · 0 vagas · 2 leitores aptos")).toBeInTheDocument()
  expect(push).not.toHaveBeenCalled()
})

test("the reader count includes active readers without a linked account and excludes archived ones", async () => {
  asAdmin()
  setup()
  ;(makeListProfiles as jest.Mock).mockReturnValue({
    execute: jest.fn().mockResolvedValue([
      profile("a"),
      { ...profile("b"), authUserId: null },
      { ...profile("c"), archivedAt: "2026-01-01" },
      { ...profile("d"), authUserId: null, archivedAt: "2026-01-01" },
    ]),
  })
  await openPage()
  expect(await screen.findByText("0 missas · 0 vagas · 2 leitores aptos")).toBeInTheDocument()
})

test("creating the default masses on an empty December shows 25 masses / 82 slots in notebook lines", async () => {
  asAdmin()
  setup()
  await openPage()
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

test("with 2 published masses the notice offers to include them; including never makes them editable", async () => {
  asAdmin()
  setup([publishedMass("m1", "07:00:00"), publishedMass("m2", "09:00:00")])
  await openPage()
  const notice = await screen.findByRole("alertdialog")
  expect(within(notice).getByText(/Existem 2 missas publicadas em dezembro/)).toBeInTheDocument()
  expect(within(notice).getByText(/voltarão a rascunho/)).toBeInTheDocument()
  expect(within(notice).getByText(/deixam de ver/)).toBeInTheDocument()
  expect(within(notice).getByText(/lembretes/)).toBeInTheDocument()

  await userEvent.click(within(notice).getByRole("button", { name: "Incluir no planejamento" }))
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
  // regra nova: missa publicada fica sempre somente leitura, mesmo depois de "incluir"
  expect(screen.getAllByText("publicada")).toHaveLength(2)
  expect(screen.queryByText("volta a rascunho ao salvar")).not.toBeInTheDocument()
  within(screen.getByRole("list", { name: "Missas do mês" })).getAllByRole("button").forEach((b) => expect(b).toBeDisabled())
})

test("keeping published masses leaves them read-only with a 'publicada' mark", async () => {
  asAdmin()
  setup([publishedMass("m1", "07:00:00"), publishedMass("m2", "09:00:00")])
  await openPage()
  const notice = await screen.findByRole("alertdialog")
  await userEvent.click(within(notice).getByRole("button", { name: "Manter somente leitura" }))
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
  expect(screen.getAllByText("publicada")).toHaveLength(2)
  // linhas somente leitura não abrem edição
  const rows = within(screen.getByRole("list", { name: "Missas do mês" })).getAllByRole("button")
  rows.forEach((b) => expect(b).toBeDisabled())
})

test("a failed month read shows an error with 'Tentar novamente' instead of an empty, plannable month", async () => {
  asAdmin()
  setup([publishedMass("m1", "07:00:00")])
  const execute = jest.fn().mockRejectedValueOnce(new Error("timeout")).mockResolvedValue([publishedMass("m1", "07:00:00")])
  ;(makeListSchedulesForMonth as jest.Mock).mockReturnValue({ execute })
  jest.spyOn(console, "error").mockImplementation(() => {})
  await openPage()

  expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível carregar este mês.")
  expect(screen.queryByText(/Nenhuma missa neste mês/)).not.toBeInTheDocument()
  expect(screen.queryByRole("list", { name: "Missas do mês" })).not.toBeInTheDocument()
  expect(screen.getByRole("button", { name: /Criar Missas Padrões no mês/ })).toBeDisabled()

  await userEvent.click(screen.getByRole("button", { name: "Tentar novamente" }))
  expect(await screen.findByRole("alertdialog")).toBeInTheDocument()
  expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  // O aviso é um diálogo modal: a página fica fora da árvore de acessibilidade enquanto ele está aberto.
  expect(screen.getByRole("button", { name: /Criar Missas Padrões no mês/, hidden: true })).toBeEnabled()
  expect(execute).toHaveBeenCalledTimes(2)
  ;(console.error as jest.Mock).mockRestore()
})

test("the lamp on an empty month asks to create the masses first and keeps the notebook view", async () => {
  const { toast } = jest.requireMock("sonner") as { toast: Record<string, jest.Mock> }
  asAdmin()
  setup()
  await openPage()
  await screen.findByText("0 missas · 0 vagas · 2 leitores aptos")
  await userEvent.click(screen.getByRole("button", { name: "Sugerir escala" }))
  expect(toast.info).toHaveBeenCalledWith("Crie as missas do mês primeiro")
  expect(screen.queryByRole("list", { name: "Vagas sugeridas" })).not.toBeInTheDocument()
  expect(screen.getByText(/Nenhuma missa neste mês/)).toBeInTheDocument()
})

test("after the lamp the page shows one line per role with the summary; 'Sugerir de novo' keeps a manual lock", async () => {
  asAdmin()
  setup()
  await openPage()
  await screen.findByText("0 missas · 0 vagas · 2 leitores aptos")
  await userEvent.click(screen.getByRole("button", { name: /Criar Missas Padrões no mês/ }))
  await userEvent.click(screen.getByRole("button", { name: "Sugerir escala" }))

  const list = screen.getByRole("list", { name: "Vagas sugeridas" })
  expect(within(list).getAllByRole("listitem")).toHaveLength(82)
  expect(screen.queryByRole("list", { name: "Missas do mês" })).not.toBeInTheDocument()
  expect(screen.queryByRole("button", { name: "Sugerir escala" })).not.toBeInTheDocument()
  // 2 leitores: as missas de domingo (4 funções) ficam com 2 vagas vazias cada
  expect(screen.getByRole("status")).toHaveTextContent(/\d+ de 82 vagas preenchidas · \d+ fora da preferência · \d+ sem leitor/)

  // 🔒 na 1ª vaga (terça 01/12, C): "Sugerir de novo" mantém o leitor travado
  const firstLine = () => within(screen.getByRole("list", { name: "Vagas sugeridas" })).getAllByRole("listitem")[0]
  const name = within(firstLine()).getByRole("button", { name: /^Leitor [ab]/ }).textContent
  await userEvent.click(within(firstLine()).getByRole("button", { name: "Travar leitor" }))
  expect(within(firstLine()).getByRole("button", { name: "Destravar leitor" })).toHaveAttribute("aria-pressed", "true")
  await userEvent.click(screen.getByRole("button", { name: /Sugerir de novo/ }))
  expect(within(firstLine()).getByRole("button", { name: "Destravar leitor" })).toHaveAttribute("aria-pressed", "true")
  expect(within(firstLine()).getByRole("button", { name: /^Leitor [ab]/ })).toHaveTextContent(name as string)
  expect(screen.getByRole("button", { name: "Salvar como rascunho" })).toBeEnabled()
})

// ---------------------------------------------------------------------------
// Task 11: Detalhar, Prévia e Salvar como rascunho
// ---------------------------------------------------------------------------

const sonner = () => (jest.requireMock("sonner") as { toast: Record<string, jest.Mock> }).toast

async function suggestDefaults() {
  await openPage()
  await screen.findByText("0 missas · 0 vagas · 2 leitores aptos")
  await userEvent.click(screen.getByRole("button", { name: /Criar Missas Padrões no mês/ }))
  await userEvent.click(screen.getByRole("button", { name: "Sugerir escala" }))
}

test("'Prévia' opens WhatsApp with the encoded preview text", async () => {
  asAdmin()
  setup()
  const open = jest.spyOn(window, "open").mockImplementation(() => null)
  await suggestDefaults()
  await userEvent.click(screen.getByRole("button", { name: "Prévia pelo WhatsApp" }))
  expect(open).toHaveBeenCalledTimes(1)
  const [url, target, features] = open.mock.calls[0]
  expect(target).toBe("_blank")
  expect(features).toBe("noopener,noreferrer")
  expect(String(url).startsWith("https://wa.me/?text=")).toBe(true)
  const text = decodeURIComponent(String(url).slice("https://wa.me/?text=".length))
  expect(text).toContain("*PRÉVIA – Escala de Dezembro/2026 (não publicada)*")
  expect(text).toContain("⚠️ = fora da preferência do leitor")
  expect(String(url)).not.toContain(" ")
  open.mockRestore()
})

test("'Detalhar' opens the month balance and the back button returns to the suggestions", async () => {
  asAdmin()
  setup()
  await suggestDefaults()
  await userEvent.click(screen.getByRole("button", { name: "Detalhar" }))
  const detail = screen.getByRole("dialog")
  expect(within(detail).getByRole("heading", { name: "Equilíbrio do mês" })).toBeInTheDocument()
  expect(within(detail).getByText("Dezembro 2026 · 82 vagas para 2 leitores")).toBeInTheDocument()
  expect(within(within(detail).getByRole("list", { name: "Equilíbrio por leitor" })).getAllByRole("listitem")).toHaveLength(2)
  await userEvent.click(within(detail).getByRole("button", { name: "Voltar às sugestões" }))
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  expect(screen.getByRole("list", { name: "Vagas sugeridas" })).toBeInTheDocument()
})

test("'Salvar como rascunho' without published masses saves the batch once, no confirmation, and reloads the month", async () => {
  asAdmin()
  setup()
  await suggestDefaults()
  await userEvent.click(screen.getByRole("button", { name: "Salvar como rascunho" }))
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
  await waitFor(() => expect(saveBatch).toHaveBeenCalledTimes(1))
  const [entries, removed] = saveBatch.mock.calls[0]
  expect(entries).toHaveLength(25)
  expect(removed).toEqual([])
  expect(updateStatus).not.toHaveBeenCalled()
  expect(sonner().success).toHaveBeenCalledWith("Rascunho salvo.")
  expect(conclude).toHaveBeenCalledWith("plan-1", "sessao-teste")
  await waitFor(() => expect(makeListSchedulesForMonth).toHaveBeenCalledTimes(3)) // abertura + leitura do salvar + recarga
  expect(await screen.findByText("0 missas · 0 vagas · 2 leitores aptos")).toBeInTheDocument()
})

test("a schedule conflict shows its message and keeps the suggestion and the edits on screen", async () => {
  asAdmin()
  setup()
  jest.spyOn(console, "error").mockImplementation(() => {})
  await suggestDefaults()
  const before = within(screen.getByRole("list", { name: "Vagas sugeridas" })).getAllByRole("listitem").map((li) => li.textContent)
  saveBatch.mockRejectedValueOnce({ message: "schedule_conflict" })

  await userEvent.click(screen.getByRole("button", { name: "Salvar como rascunho" }))
  await waitFor(() => expect(sonner().error).toHaveBeenCalledWith("A escala foi alterada. Atualize a página e tente novamente."))
  const after = within(screen.getByRole("list", { name: "Vagas sugeridas" })).getAllByRole("listitem").map((li) => li.textContent)
  expect(after).toEqual(before)
  expect(screen.getByRole("button", { name: "Salvar como rascunho" })).toBeEnabled()
  expect(makeListSchedulesForMonth).toHaveBeenCalledTimes(2) // abertura + leitura do salvar; sem recarga
  expect(conclude).not.toHaveBeenCalled()
  ;(console.error as jest.Mock).mockRestore()
})

/** Rascunho real que o plano (criado do zero) não conhece, numa data coberta pelas missas padrão. */
const strayDraft = (): Mass => ({
  id: "r1",
  date: "2026-12-06",
  time: "17:30:00",
  isPublished: false,
  monthReference: "2026-12",
  scheduleRevision: 8,
  slots: [],
})

function setupWithStrayDraft() {
  setup()
  const execute = jest.fn().mockResolvedValueOnce([]).mockResolvedValue([strayDraft()])
  ;(makeListSchedulesForMonth as jest.Mock).mockReturnValue({ execute })
}

test("saving over a real draft asks first, naming the month, count and dates, and writes nothing until confirmed", async () => {
  asAdmin()
  setupWithStrayDraft()
  await suggestDefaults()
  await userEvent.click(screen.getByRole("button", { name: "Salvar como rascunho" }))
  const dialog = await screen.findByRole("alertdialog")
  expect(within(dialog).getByText("Substituir o rascunho existente?")).toBeInTheDocument()
  expect(
    within(dialog).getByText(
      "Já existe uma escala em rascunho em Dezembro (1 missa: 06/12). Salvar vai substituir essas missas pelas deste planejamento. Missas publicadas não serão tocadas.",
    ),
  ).toBeInTheDocument()
  expect(saveBatch).not.toHaveBeenCalled()

  await userEvent.click(within(dialog).getByRole("button", { name: "Substituir e salvar" }))
  await waitFor(() => expect(saveBatch).toHaveBeenCalledTimes(1))
  const [entries, removed] = saveBatch.mock.calls[0]
  expect(entries).toHaveLength(25)
  expect(removed).toEqual([{ id: "r1", expectedRevision: 8 }])
  expect(updateStatus).not.toHaveBeenCalled()
  await waitFor(() => expect(conclude).toHaveBeenCalledTimes(1))
})

test("cancelling the replacement confirmation writes nothing and keeps the suggestion", async () => {
  asAdmin()
  setupWithStrayDraft()
  await suggestDefaults()
  await userEvent.click(screen.getByRole("button", { name: "Salvar como rascunho" }))
  const dialog = await screen.findByRole("alertdialog")
  await userEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }))
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
  expect(saveBatch).not.toHaveBeenCalled()
  expect(conclude).not.toHaveBeenCalled()
  expect(screen.getByRole("list", { name: "Vagas sugeridas" })).toBeInTheDocument()
})

test("changing month while the real masses are being read is ignored", async () => {
  asAdmin()
  setup()
  await suggestDefaults()
  let release: (m: Mass[]) => void = () => {}
  const execute = jest.fn().mockReturnValueOnce(new Promise<Mass[]>((r) => (release = r))).mockResolvedValue([])
  ;(makeListSchedulesForMonth as jest.Mock).mockReturnValue({ execute })
  await userEvent.click(screen.getByRole("button", { name: "Salvar como rascunho" }))
  await waitFor(() => expect(execute).toHaveBeenCalledTimes(1))
  await userEvent.click(screen.getByRole("button", { name: "Próximo mês", hidden: true }))
  expect(screen.getByText("Dezembro 2026")).toBeInTheDocument()
  await act(async () => release([]))
  await waitFor(() => expect(saveBatch).toHaveBeenCalledTimes(1))
  expect(saveBatch.mock.calls[0][0]).toHaveLength(25)
})

test("changing month while the replacement dialog is open is ignored and the dialog stays", async () => {
  asAdmin()
  setupWithStrayDraft()
  await suggestDefaults()
  await userEvent.click(screen.getByRole("button", { name: "Salvar como rascunho" }))
  const dialog = await screen.findByRole("alertdialog")
  await userEvent.click(screen.getByRole("button", { name: "Próximo mês", hidden: true }))
  expect(screen.getByRole("alertdialog")).toBe(dialog)
  expect(screen.getByText("Dezembro 2026")).toBeInTheDocument()
  expect(saveBatch).not.toHaveBeenCalled()
})

test("changing month never asks to discard: the plan is saved as you go", async () => {
  asAdmin()
  setup()
  await openPage()
  await screen.findByText("0 missas · 0 vagas · 2 leitores aptos")
  await userEvent.click(screen.getByRole("button", { name: /Criar Missas Padrões no mês/ }))
  await userEvent.click(screen.getByRole("button", { name: "Próximo mês" }))
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
  expect(screen.getByText("Janeiro 2027")).toBeInTheDocument()
  const event = new Event("beforeunload", { cancelable: true })
  window.dispatchEvent(event)
  expect(event.defaultPrevented).toBe(false)
  expect(saveBatch).not.toHaveBeenCalled()
})

test("while saving, the planning is inert and edits are ignored (no edit is lost to the reload)", async () => {
  asAdmin()
  setup()
  let release: () => void = () => {}
  saveBatch.mockReturnValue(new Promise<void>((resolve) => { release = resolve }))
  await suggestDefaults()

  const lines = () => within(screen.getByRole("list", { name: "Vagas sugeridas" })).getAllByRole("listitem")
  const lockButtonName = () => within(lines()[0]).getAllByRole("button").map((b) => b.getAttribute("aria-label") ?? "")
  expect(lockButtonName()).toContain("Travar leitor")

  await userEvent.click(screen.getByRole("button", { name: "Salvar como rascunho" }))
  await waitFor(() => expect(saveBatch).toHaveBeenCalledTimes(1))
  const main = screen.getByRole("main", { hidden: true })
  expect(main).toHaveAttribute("inert")
  expect(main).toHaveAttribute("aria-busy", "true")

  // Mesmo que um clique chegue ao botão, o plano não muda.
  const before = lines().map((li) => li.textContent)
  const lock = within(lines()[0]).getByRole("button", { name: "Travar leitor", hidden: true })
  act(() => lock.click())
  act(() => within(screen.getByRole("list", { name: "Vagas sugeridas" })).getAllByRole("button", { name: "Travar leitor", hidden: true })[1].click())
  expect(within(lines()[0]).getByRole("button", { name: "Travar leitor", hidden: true })).toHaveAttribute("aria-pressed", "false")
  expect(lines().map((li) => li.textContent)).toEqual(before)

  await act(async () => release())
  await waitFor(() => expect(sonner().success).toHaveBeenCalledWith("Rascunho salvo."))
  await waitFor(() => expect(screen.getByRole("main")).not.toHaveAttribute("inert"))
})
