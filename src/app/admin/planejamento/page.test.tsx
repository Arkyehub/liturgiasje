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
import { makeConcludePlan, makeListPlans } from "@/main/factories/usecases/plans"
import { makeListProfiles, makeListUnavailableForRange } from "@/main/factories/usecases/profiles"
import type { Mass } from "@/domain/models/Schedule"
import type { Profile } from "@/domain/models/Profile"
import type { PlanListItem } from "@/domain/models/SchedulePlan"
import { resetSync, setSync, planDoc, syncReopen, syncRetrySave, syncMarkConcluded } from "@/features/planning/hooks/planSyncTestDouble"
import { serializePlanState } from "@/features/planning/lib/planState"
import { massToPlan } from "@/features/planning/hooks/usePlanning"

const push = jest.fn()
jest.mock("next/navigation", () => ({ useRouter: () => ({ push, back: jest.fn() }) }))
jest.mock("@/shared/hooks/useAuth", () => ({ useAuth: jest.fn() }))
jest.mock("@/main/factories/usecases/schedule", () => ({
  makeListSchedulesForMonth: jest.fn(),
  makeListSlotHistory: jest.fn(),
  makeSaveScheduleBatch: jest.fn(),
  makeUpdateMassesStatus: jest.fn(),
}))
jest.mock("@/main/factories/usecases/plans", () => ({
  makeConcludePlan: jest.fn(),
  makeListPlans: jest.fn(),
  makeCopyPlan: jest.fn(),
  makeDiscardPlan: jest.fn(),
  makeReopenPlan: jest.fn(),
}))
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
let listPlans: jest.Mock

const listItem = (extra: Partial<PlanListItem> = {}): PlanListItem => ({
  id: "o1", monthReference: "2026-12", ownerProfileId: "owner-2", ownerName: "Maria Teste", isMine: false, status: "em_andamento",
  createdAt: "2026-11-20T12:00:00Z", updatedAt: "2026-11-26T09:00:00Z", expiresAt: "2026-12-26T09:00:00Z",
  copiedFromName: null, concludedAt: null, hasContent: true, ...extra,
})

function setup(masses: Mass[] = [], plans: PlanListItem[] = []) {
  listPlans = jest.fn().mockResolvedValue(plans)
  ;(makeListPlans as jest.Mock).mockReturnValue({ execute: listPlans })
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

const monthRegion = (name: RegExp) => screen.findByRole("region", { name })

// A página abre na lista de planejamentos: o teste cria o seu (por padrão o do mês atual, dezembro de 2026) antes de qualquer leitura.
async function openPage(optionName: RegExp = /^Dezembro 2026/) {
  const view = render(<PlanejamentoPage />)
  await userEvent.click(within(await monthRegion(optionName)).getByRole("button", { name: /Criar meu planejamento/ }))
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
  expect(listPlans).not.toHaveBeenCalled()
})

test("on entry only the plan chooser shows and no real masses or profiles are read", async () => {
  asAdmin()
  setup([publishedMass("m1", "07:00:00")])
  render(<PlanejamentoPage />)
  expect(await screen.findByRole("heading", { name: "Qual mês você vai planejar?" })).toBeInTheDocument()
  expect(listPlans).toHaveBeenCalledWith(["2026-12", "2027-01", "2027-02"])
  expect(makeListSchedulesForMonth).not.toHaveBeenCalled()
  expect(makeListProfiles).not.toHaveBeenCalled()
  expect(makeListSlotHistory).not.toHaveBeenCalled()
  expect(makeListUnavailableForRange).not.toHaveBeenCalled()
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
  expect(screen.queryByRole("button", { name: "Trocar planejamento" })).not.toBeInTheDocument()
  expect(screen.queryByRole("button", { name: "Sugerir escala" })).not.toBeInTheDocument()
  expect(screen.queryByRole("list", { name: "Missas do mês" })).not.toBeInTheDocument()
  expect(screen.queryByText("SOMENTE LEITURA")).not.toBeInTheDocument()
  expect(push).not.toHaveBeenCalled()
})

test("the chooser offers the current month, the next one marked 'Sugerido' and the one after", async () => {
  asAdmin()
  setup()
  render(<PlanejamentoPage />)
  const current = await monthRegion(/^Dezembro 2026/)
  const next = screen.getByRole("region", { name: /^Janeiro 2027/ })
  const after = screen.getByRole("region", { name: /^Fevereiro 2027/ })
  expect(within(next).getByText("Sugerido")).toBeInTheDocument()
  expect(within(current).queryByText("Sugerido")).not.toBeInTheDocument()
  expect(within(after).queryByText("Sugerido")).not.toBeInTheDocument()
})

test("creating my plan for the next month reads with that month's ranges and then shows the informative published notice", async () => {
  asAdmin()
  const listMonth = jest.fn().mockResolvedValue([{ ...publishedMass("m1", "07:00:00"), date: "2027-01-03", monthReference: "2027-01" }])
  const listHistory = jest.fn().mockResolvedValue([])
  const listUnavailable = jest.fn().mockResolvedValue({})
  setup()
  ;(makeListSchedulesForMonth as jest.Mock).mockReturnValue({ execute: listMonth })
  ;(makeListSlotHistory as jest.Mock).mockReturnValue({ execute: listHistory })
  ;(makeListUnavailableForRange as jest.Mock).mockReturnValue({ execute: listUnavailable })
  render(<PlanejamentoPage />)
  await userEvent.click(within(await monthRegion(/^Janeiro 2027/)).getByRole("button", { name: /Criar meu planejamento/ }))

  const notice = await screen.findByRole("alertdialog")
  expect(within(notice).getByText(/Já existe 1 missa publicada em janeiro \(03\/01\)/)).toBeInTheDocument()
  expect(listMonth).toHaveBeenCalledTimes(1)
  expect(listMonth).toHaveBeenCalledWith(new Date(2027, 0, 1), true)
  expect(listHistory).toHaveBeenCalledWith("2026-01-01", "2026-12-31")
  expect(listUnavailable).toHaveBeenCalledWith("2027-01-01", "2027-01-31")
  expect(screen.getByText("Janeiro 2027")).toBeInTheDocument()
  expect(screen.queryByText("Qual mês você vai planejar?")).not.toBeInTheDocument()
})

test("'Trocar planejamento' goes back to the chooser without month arrows in the header", async () => {
  asAdmin()
  setup()
  await openPage(/^Janeiro 2027/)
  await screen.findByText("0 missas · 0 vagas · 2 leitores aptos")
  expect(screen.queryByRole("button", { name: "Mês anterior" })).not.toBeInTheDocument()
  expect(screen.queryByRole("button", { name: "Próximo mês" })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole("button", { name: "Trocar planejamento" }))
  expect(await screen.findByRole("heading", { name: "Qual mês você vai planejar?" })).toBeInTheDocument()
  expect(screen.queryByText("0 missas · 0 vagas · 2 leitores aptos")).not.toBeInTheDocument()
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

test("with 2 published masses the informative notice lists the dates once; they stay read-only and there is no include/keep option", async () => {
  asAdmin()
  setup([publishedMass("m1", "07:00:00"), publishedMass("m2", "09:00:00")])
  await openPage()
  const notice = await screen.findByRole("alertdialog")
  expect(
    within(notice).getByText(
      "Já existem 2 missas publicadas em dezembro (06/12). Elas não podem ser alteradas no planejamento. Para mexer nelas, transforme-as em rascunho na tela de Escala.",
    ),
  ).toBeInTheDocument()
  expect(within(notice).queryByRole("button", { name: "Incluir no planejamento" })).not.toBeInTheDocument()
  expect(within(notice).queryByRole("button", { name: "Manter somente leitura" })).not.toBeInTheDocument()

  await userEvent.click(within(notice).getByRole("button", { name: "Entendi" }))
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
  expect(screen.getAllByText("publicada")).toHaveLength(2)
  expect(screen.queryByText("volta a rascunho ao salvar")).not.toBeInTheDocument()
  within(screen.getByRole("list", { name: "Missas do mês" })).getAllByRole("button").forEach((b) => expect(b).toBeDisabled())
})

test("the published notice shows once per plan: not again after acknowledging, but again when another plan is opened", async () => {
  asAdmin()
  setup([publishedMass("m1", "07:00:00")])
  await openPage()
  await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Entendi" }))
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
  // volta ao mesmo planejamento: o reconhecimento é por abertura
  await userEvent.click(screen.getByRole("button", { name: "Trocar planejamento" }))
  await userEvent.click(within(await monthRegion(/^Dezembro 2026/)).getByRole("button", { name: /Criar meu planejamento/ }))
  expect(await screen.findByRole("alertdialog")).toBeInTheDocument()
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
  const view = await openPage()
  await screen.findByText("0 missas · 0 vagas · 2 leitores aptos")
  await userEvent.click(screen.getByRole("button", { name: /Criar Missas Padrões no mês/ }))
  await userEvent.click(screen.getByRole("button", { name: "Sugerir escala" }))
  return view
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
  await waitFor(() => expect(makeListSchedulesForMonth).toHaveBeenCalledTimes(4)) // abertura + leitura do salvar + releitura antes de gravar + recarga
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
  expect(makeListSchedulesForMonth).toHaveBeenCalledTimes(3) // abertura + leitura do salvar + releitura antes de gravar; sem recarga
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

test("'Trocar planejamento' while the real masses are being read is ignored", async () => {
  asAdmin()
  setup()
  await suggestDefaults()
  let release: (m: Mass[]) => void = () => {}
  const execute = jest.fn().mockReturnValueOnce(new Promise<Mass[]>((r) => (release = r))).mockResolvedValue([])
  ;(makeListSchedulesForMonth as jest.Mock).mockReturnValue({ execute })
  await userEvent.click(screen.getByRole("button", { name: "Salvar como rascunho" }))
  await waitFor(() => expect(execute).toHaveBeenCalledTimes(1))
  expect(screen.getByRole("button", { name: "Trocar planejamento", hidden: true })).toBeDisabled()
  await userEvent.click(screen.getByRole("button", { name: "Trocar planejamento", hidden: true }))
  expect(screen.getByText("Dezembro 2026")).toBeInTheDocument()
  expect(screen.queryByRole("heading", { name: "Qual mês você vai planejar?" })).not.toBeInTheDocument()
  await act(async () => release([]))
  await waitFor(() => expect(saveBatch).toHaveBeenCalledTimes(1))
  expect(saveBatch.mock.calls[0][0]).toHaveLength(25)
})

test("'Trocar planejamento' while the replacement dialog is open is ignored and the dialog stays", async () => {
  asAdmin()
  setupWithStrayDraft()
  await suggestDefaults()
  await userEvent.click(screen.getByRole("button", { name: "Salvar como rascunho" }))
  const dialog = await screen.findByRole("alertdialog")
  expect(screen.getByRole("button", { name: "Trocar planejamento", hidden: true })).toBeDisabled()
  await userEvent.click(screen.getByRole("button", { name: "Trocar planejamento", hidden: true }))
  expect(screen.getByRole("alertdialog")).toBe(dialog)
  expect(screen.queryByRole("heading", { name: "Qual mês você vai planejar?" })).not.toBeInTheDocument()
  expect(screen.getByText("Dezembro 2026")).toBeInTheDocument()
  expect(saveBatch).not.toHaveBeenCalled()
})

test("the replacement dialog closes and resets when the plan leaves edit mode, writing nothing", async () => {
  asAdmin()
  setupWithStrayDraft()
  const view = await suggestDefaults()
  await userEvent.click(screen.getByRole("button", { name: "Salvar como rascunho" }))
  await screen.findByRole("alertdialog")
  setSync({ mode: "readonly" })
  view.rerender(<PlanejamentoPage />)
  await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument())
  expect(saveBatch).not.toHaveBeenCalled()
  // Voltando a editar, o aviso não reaparece sozinho.
  setSync({ mode: "edit" })
  view.rerender(<PlanejamentoPage />)
  await act(async () => {})
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
})

test("going back to the chooser never asks to discard: the plan is saved as you go", async () => {
  asAdmin()
  setup()
  await openPage()
  await screen.findByText("0 missas · 0 vagas · 2 leitores aptos")
  await userEvent.click(screen.getByRole("button", { name: /Criar Missas Padrões no mês/ }))
  await userEvent.click(screen.getByRole("button", { name: "Trocar planejamento" }))
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
  expect(await screen.findByRole("heading", { name: "Qual mês você vai planejar?" })).toBeInTheDocument()
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

// ---------------------------------------------------------------------------
// Task 7b: Somente Leitura, indicador de gravação, avisos e estados do servidor
// ---------------------------------------------------------------------------

const draftMass = (id: string, time: string): Mass => ({
  id, date: "2026-12-08", time, isPublished: false, monthReference: "2026-12", scheduleRevision: 3,
  slots: [
    { id: `s-${id}`, massId: id, role: "C", profileId: "a", isConfirmed: false, isSwapRequested: false, createdAt: "2026-11-01" },
    { id: `t-${id}`, massId: id, role: "L", profileId: "", isConfirmed: false, isSwapRequested: false, createdAt: "2026-11-01" },
  ],
})

async function openMine() {
  await openPage()
  await screen.findByText(/missas? · .* vagas?/)
}

async function viewOther() {
  setSync({ mode: "readonly", plan: planDoc({ id: "o1", isMine: false, ownerName: "Maria Teste", ownerProfileId: "owner-2", updatedAt: "2026-11-26T09:00:00Z" }) })
  render(<PlanejamentoPage />)
  await userEvent.click(within(await monthRegion(/^Dezembro 2026/)).getByRole("button", { name: "Ver" }))
  await screen.findByText("SOMENTE LEITURA")
}

test("viewing another coordinator's plan shows the read-only banner and disables every editing control", async () => {
  asAdmin()
  setup([draftMass("d1", "19:00:00")], [listItem()])
  await viewOther()
  expect(screen.getByText("Planejamento de Maria Teste", { exact: false })).toBeInTheDocument()
  expect(screen.getByText("Para editar, use Duplicar para mim.")).toBeInTheDocument()
  expect(screen.getByText("Dezembro 2026")).toBeInTheDocument()
  expect(screen.getByRole("button", { name: /Criar Missas Padrões no mês/ })).toBeDisabled()
  expect(screen.getByRole("button", { name: "Adicionar missa" })).toBeDisabled()
  expect(screen.getByRole("button", { name: "Sugerir escala" })).toBeDisabled()
  within(screen.getByRole("list", { name: "Missas do mês" })).getAllByRole("button").forEach((b) => expect(b).toBeDisabled())
  // sem indicador de gravação nem botão de reabrir/editar no modo de outro coordenador
  expect(screen.queryByRole("button", { name: "Editar" })).not.toBeInTheDocument()
  expect(screen.queryByRole("button", { name: "Reabrir" })).not.toBeInTheDocument()
  expect(screen.queryByText("Salvo")).not.toBeInTheDocument()
  expect(syncRetrySave).not.toHaveBeenCalled()
  // nada de gravação: a leitura de outro coordenador não escreve
  expect(saveBatch).not.toHaveBeenCalled()
})

test("a read-only plan after the lamp keeps viewing, Detalhar and Prévia, but locks pickers, locks, 'Sugerir de novo' and saving", async () => {
  asAdmin()
  setup([draftMass("d1", "19:00:00")], [listItem()])
  const open = jest.spyOn(window, "open").mockImplementation(() => null)
  const stored = serializePlanState([{ ...massToPlan(draftMass("d1", "19:00:00")) }], [], true)
  setSync({ mode: "readonly", plan: planDoc({ id: "o1", isMine: false, ownerName: "Maria Teste", state: stored }) })
  render(<PlanejamentoPage />)
  await userEvent.click(within(await monthRegion(/^Dezembro 2026/)).getByRole("button", { name: "Ver" }))
  const list = await screen.findByRole("list", { name: "Vagas sugeridas" })
  const lines = within(list).getAllByRole("listitem")
  expect(within(lines[0]).getByRole("button", { name: "Leitor a" })).toBeDisabled()
  expect(within(lines[0]).getByRole("button", { name: /Destravar leitor|Travar leitor/ })).toBeDisabled()
  expect(within(lines[1]).getByRole("button", { name: "sem leitor · escolher" })).toBeDisabled()
  expect(screen.getByRole("button", { name: /Sugerir de novo/ })).toBeDisabled()
  expect(screen.getByRole("button", { name: "Salvar como rascunho" })).toBeDisabled()
  expect(screen.queryByRole("button", { name: "Sugerir escala" })).not.toBeInTheDocument()

  await userEvent.click(screen.getByRole("button", { name: "Prévia pelo WhatsApp" }))
  expect(open).toHaveBeenCalledTimes(1)
  await userEvent.click(screen.getByRole("button", { name: "Detalhar" }))
  expect(screen.getByRole("dialog")).toBeInTheDocument()
  open.mockRestore()
})

test("'Trocar planejamento' from a read-only view returns to the chooser", async () => {
  asAdmin()
  setup([], [listItem()])
  await viewOther()
  await userEvent.click(screen.getByRole("button", { name: "Trocar planejamento" }))
  expect(await screen.findByRole("heading", { name: "Qual mês você vai planejar?" })).toBeInTheDocument()
  expect(screen.queryByText("SOMENTE LEITURA")).not.toBeInTheDocument()
})

test("'Trocar planejamento' waits while a save is in flight", async () => {
  asAdmin()
  setup()
  setSync({ status: "saving" })
  await openMine()
  const button = screen.getByRole("button", { name: "Trocar planejamento" })
  expect(button).toBeDisabled()
  await userEvent.click(button)
  expect(screen.queryByRole("heading", { name: "Qual mês você vai planejar?" })).not.toBeInTheDocument()
  expect(screen.getByText("Salvando…")).toBeInTheDocument()
})

test("'Trocar planejamento' stays disabled while the last save failed (leaving would drop the unsent change)", async () => {
  asAdmin()
  setup()
  setSync({ status: "failed" })
  await openMine()
  const button = screen.getByRole("button", { name: "Trocar planejamento" })
  expect(button).toBeDisabled()
  await userEvent.click(button)
  expect(screen.queryByRole("heading", { name: "Qual mês você vai planejar?" })).not.toBeInTheDocument()
  expect(screen.getByRole("button", { name: /tentar de novo/i })).toBeInTheDocument()
})

test("a change brought from another device of the same owner shows a toast and keeps editing enabled", async () => {
  asAdmin()
  setup([draftMass("d1", "19:00:00")])
  setSync({ mode: "edit", externalChange: { seq: 1, concluded: false, lost: 0 } })
  await openMine()
  await waitFor(() => expect(sonner().info).toHaveBeenCalledWith("Planejamento atualizado: alterado em outro aparelho."))
  expect(screen.queryByText("SOMENTE LEITURA")).not.toBeInTheDocument()
  expect(screen.getByRole("button", { name: /Criar Missas Padrões no mês/ })).toBeEnabled()
})

test("a write conflict warns how many local edits were not applied", async () => {
  asAdmin()
  setup([draftMass("d1", "19:00:00")])
  setSync({ mode: "edit", externalChange: { seq: 1, concluded: false, lost: 2 } })
  await openMine()
  await waitFor(() =>
    expect(sonner().warning).toHaveBeenCalledWith(
      "Planejamento alterado em outro aparelho. 2 edições suas não foram aplicadas: refaça se necessário.",
    ),
  )
  expect(screen.queryByText("SOMENTE LEITURA")).not.toBeInTheDocument()
})

test("a concluded plan shows 'Planejamento concluído' with Reabrir, read-only", async () => {
  asAdmin()
  setup([draftMass("d1", "19:00:00")])
  setSync({ mode: "concluded", plan: planDoc({ status: "concluido", concludedAt: "2026-11-25T10:00:00Z" }) })
  await openMine()
  expect(screen.getByText("SOMENTE LEITURA")).toBeInTheDocument()
  expect(screen.getByText("Planejamento concluído")).toBeInTheDocument()
  expect(screen.getByRole("button", { name: /Criar Missas Padrões no mês/ })).toBeDisabled()
  expect(screen.queryByText("Salvo")).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole("button", { name: "Reabrir" }))
  expect(syncReopen).toHaveBeenCalledTimes(1)
})

test("in edit mode there is no read-only banner", async () => {
  asAdmin()
  setup()
  await openMine()
  expect(screen.queryByText("SOMENTE LEITURA")).not.toBeInTheDocument()
  expect(screen.getByRole("button", { name: /Criar Missas Padrões no mês/ })).toBeEnabled()
})

test("unavailable shared planning shows the message and 'Voltar à lista'", async () => {
  asAdmin()
  setup()
  setSync({ mode: "unavailable", plan: null, error: "ignorado" })
  render(<PlanejamentoPage />)
  await userEvent.click(within(await monthRegion(/^Dezembro 2026/)).getByRole("button", { name: /Criar meu planejamento/ }))
  expect(await screen.findByText("Planejamento compartilhado indisponível neste ambiente.")).toBeInTheDocument()
  expect(screen.queryByRole("button", { name: /Criar Missas Padrões no mês/ })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole("button", { name: "Voltar à lista" }))
  expect(await screen.findByRole("heading", { name: "Qual mês você vai planejar?" })).toBeInTheDocument()
})

test("a sync error shows its message and 'Voltar à lista'", async () => {
  asAdmin()
  setup()
  setSync({ mode: "error", plan: null, error: "Não foi possível abrir o planejamento agora." })
  render(<PlanejamentoPage />)
  await userEvent.click(within(await monthRegion(/^Dezembro 2026/)).getByRole("button", { name: /Criar meu planejamento/ }))
  expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível abrir o planejamento agora.")
  await userEvent.click(screen.getByRole("button", { name: "Voltar à lista" }))
  expect(await screen.findByRole("heading", { name: "Qual mês você vai planejar?" })).toBeInTheDocument()
})

test.each([
  ["saving", "Salvando…"],
  ["saved", "Salvo"],
] as const)("the save indicator shows '%s' while editing", async (status, text) => {
  asAdmin()
  setup()
  setSync({ status })
  await openMine()
  expect(screen.getByText(text)).toBeInTheDocument()
})

test("a failed save shows 'Falhou — tentar de novo', which retries", async () => {
  asAdmin()
  setup()
  setSync({ status: "failed" })
  await openMine()
  await userEvent.click(screen.getByRole("button", { name: "Falhou — tentar de novo" }))
  expect(syncRetrySave).toHaveBeenCalledTimes(1)
})

test("the save indicator is not shown without editing", async () => {
  asAdmin()
  setup()
  setSync({ mode: "readonly", status: "saved" })
  await openMine()
  expect(screen.queryByText("Salvo")).not.toBeInTheDocument()
})

test("reconciliation notices show in edit mode, are dismissible one by one, and come back for a newly opened plan", async () => {
  asAdmin()
  setup([draftMass("d1", "19:00:00")])
  const gone = { ...massToPlan(draftMass("gone", "10:00:00")), date: "2026-12-13" }
  setSync({ plan: planDoc({ state: serializePlanState([massToPlan(draftMass("d1", "19:00:00")), gone], [], true) }) })
  await openMine()
  expect(screen.getByText("Missas removidas fora do planejamento: 13/12")).toBeInTheDocument()
  await userEvent.click(screen.getByRole("button", { name: "Dispensar aviso" }))
  expect(screen.queryByText(/Missas removidas fora do planejamento/)).not.toBeInTheDocument()
  // outro planejamento: o aviso volta
  await userEvent.click(screen.getByRole("button", { name: "Trocar planejamento" }))
  await userEvent.click(within(await monthRegion(/^Janeiro 2027/)).getByRole("button", { name: /Criar meu planejamento/ }))
  await screen.findByText(/missas? · .* vagas?/)
  expect(screen.getByText("Missas removidas fora do planejamento: 13/12")).toBeInTheDocument()
})

test("an unreadable stored plan shows the corrupted-state notice in edit mode", async () => {
  asAdmin()
  setup([draftMass("d1", "19:00:00")])
  setSync({ plan: planDoc({ state: "lixo" }) })
  await openMine()
  expect(screen.getByText("O planejamento guardado estava corrompido e foi ignorado.")).toBeInTheDocument()
})

test("notices are not shown when the plan is read-only", async () => {
  asAdmin()
  setup([draftMass("d1", "19:00:00")])
  setSync({ mode: "readonly", plan: planDoc({ state: "lixo" }) })
  await openMine()
  expect(screen.queryByText(/corrompido/)).not.toBeInTheDocument()
})

test("after 'Salvar como rascunho' the plan reopens as concluded with the Reabrir banner", async () => {
  asAdmin()
  setup()
  await suggestDefaults()
  expect(screen.queryByText("SOMENTE LEITURA")).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole("button", { name: "Salvar como rascunho" }))
  await waitFor(() => expect(conclude).toHaveBeenCalledTimes(1))
  // a sincronização é avisada de que o servidor concluiu (sem isso ela seguiria em "edit")
  await waitFor(() => expect(syncMarkConcluded).toHaveBeenCalledTimes(1))
  expect(syncMarkConcluded.mock.invocationCallOrder[0]).toBeGreaterThan(conclude.mock.invocationCallOrder[0])
  // a recarga reabre o plano; o servidor agora o devolve concluído
  setSync({ mode: "concluded", plan: planDoc({ status: "concluido", concludedAt: "2026-11-26T12:00:00Z" }) })
  await waitFor(() => expect(makeListSchedulesForMonth).toHaveBeenCalledTimes(4))
  expect(await screen.findByText("Planejamento concluído")).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Reabrir" })).toBeInTheDocument()
})
