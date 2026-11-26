import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { PlanError, type PlanListItem } from "@/domain/models/SchedulePlan"

import { PlanChooser } from "./PlanChooser"

const mockList = jest.fn()
const mockCopy = jest.fn()
const mockDiscard = jest.fn()
const mockReopen = jest.fn()
jest.mock("@/main/factories/usecases/plans", () => ({
  makeListPlans: () => ({ execute: (...a: unknown[]) => mockList(...a) }),
  makeCopyPlan: () => ({ execute: (...a: unknown[]) => mockCopy(...a) }),
  makeDiscardPlan: () => ({ execute: (...a: unknown[]) => mockDiscard(...a) }),
  makeReopenPlan: () => ({ execute: (...a: unknown[]) => mockReopen(...a) })
}))

const NOW = new Date("2026-11-26T12:00:00Z")
const CURRENT = new Date(2026, 10, 1)

function plan(over: Partial<PlanListItem>): PlanListItem {
  return {
    id: "p1",
    monthReference: "2026-12",
    ownerProfileId: "u1",
    ownerName: "Eu Mesmo",
    isMine: true,
    status: "em_andamento",
    createdAt: "2026-11-20T12:00:00Z",
    updatedAt: "2026-11-26T09:00:00Z",
    expiresAt: "2026-12-26T09:00:00Z",
    copiedFromName: null,
    concludedAt: null,
    openElsewhere: false,
    ...over
  }
}

function setup(plans: PlanListItem[] = []) {
  mockList.mockResolvedValue(plans)
  const onOpenMine = jest.fn()
  const onViewOther = jest.fn()
  render(<PlanChooser current={CURRENT} session="sess-1" onOpenMine={onOpenMine} onViewOther={onViewOther} />)
  return { onOpenMine, onViewOther }
}

function section(name: RegExp) {
  return screen.getByRole("region", { name })
}

beforeEach(() => {
  jest.useFakeTimers({ advanceTimers: true })
  jest.setSystemTime(NOW)
  jest.clearAllMocks()
  mockCopy.mockResolvedValue({})
  mockDiscard.mockResolvedValue(undefined)
  mockReopen.mockResolvedValue({})
})
afterEach(() => jest.useRealTimers())

it("lista uma vez os 3 meses e marca o seguinte como Sugerido; sem plano mostra Criar meu planejamento", async () => {
  const { onOpenMine } = setup()
  expect(screen.getByRole("status", { name: "Carregando planejamentos" })).toBeInTheDocument()
  await screen.findByText("Novembro 2026")
  expect(mockList).toHaveBeenCalledTimes(1)
  expect(mockList).toHaveBeenCalledWith(["2026-11", "2026-12", "2027-01"])
  expect(within(section(/Dezembro 2026/)).getByText("Sugerido")).toBeInTheDocument()
  expect(screen.getAllByText("Sugerido")).toHaveLength(1)
  const buttons = screen.getAllByRole("button", { name: /Criar meu planejamento/ })
  expect(buttons).toHaveLength(3)
  await userEvent.click(within(section(/Dezembro 2026/)).getByRole("button", { name: /Criar meu planejamento/ }))
  expect(onOpenMine).toHaveBeenCalledWith(new Date(2026, 11, 1))
})

it("meu planejamento mostra tempos, aviso de outro aparelho e Abrir", async () => {
  const { onOpenMine } = setup([plan({ openElsewhere: true })])
  const dez = await screen.findByRole("region", { name: /Dezembro 2026/ })
  expect(dez).toHaveTextContent("Meu planejamento · editado há 3 horas · expira em 30 dias")
  expect(dez).toHaveTextContent("Aberto em outro aparelho")
  expect(within(dez).queryByRole("button", { name: /Criar meu planejamento/ })).not.toBeInTheDocument()
  await userEvent.click(within(dez).getByRole("button", { name: /Abrir/ }))
  expect(onOpenMine).toHaveBeenCalledWith(new Date(2026, 11, 1))
})

it("expira hoje quando faltam menos de um dia e arredonda para cima", async () => {
  setup([
    plan({ id: "a", monthReference: "2026-11", expiresAt: "2026-11-26T13:00:00Z" }),
    plan({ id: "b", monthReference: "2026-12", expiresAt: "2026-11-26T11:00:00Z" }),
    plan({ id: "c", monthReference: "2027-01", expiresAt: "2026-11-28T13:00:00Z" })
  ])
  expect(await screen.findByRole("region", { name: /Novembro 2026/ })).toHaveTextContent("expira em 1 dia")
  expect(screen.getByRole("region", { name: /Dezembro 2026/ })).toHaveTextContent("expira hoje")
  expect(screen.getByRole("region", { name: /Janeiro 2027/ })).toHaveTextContent("expira em 3 dias")
})

it("plano de outra pessoa: Ver chama onViewOther e mostra 'copiado de'", async () => {
  const other = plan({ id: "o1", isMine: false, ownerName: "Maria", copiedFromName: "João", updatedAt: "2026-11-25T12:00:00Z" })
  const { onViewOther } = setup([other])
  const dez = await screen.findByRole("region", { name: /Dezembro 2026/ })
  expect(dez).toHaveTextContent("Maria · editado há 1 dia · expira em 30 dias")
  expect(dez).toHaveTextContent("copiado de João")
  await userEvent.click(within(dez).getByRole("button", { name: /Ver/ }))
  expect(onViewOther).toHaveBeenCalledWith(other)
  expect(within(dez).queryByRole("button", { name: /Descartar/ })).not.toBeInTheDocument()
})

it("Duplicar sem plano meu copia sem sobrescrever e abre o meu", async () => {
  const { onOpenMine } = setup([plan({ id: "o1", isMine: false, ownerName: "Maria" })])
  const dez = await screen.findByRole("region", { name: /Dezembro 2026/ })
  await userEvent.click(within(dez).getByRole("button", { name: /Duplicar para mim/ }))
  expect(mockCopy).toHaveBeenCalledWith("o1", "sess-1", false)
  await waitFor(() => expect(onOpenMine).toHaveBeenCalledWith(new Date(2026, 11, 1)))
})

it("Duplicar com plano meu pede confirmação e só então sobrescreve", async () => {
  const { onOpenMine } = setup([plan({ id: "mine" }), plan({ id: "o1", isMine: false, ownerName: "Maria" })])
  const dez = await screen.findByRole("region", { name: /Dezembro 2026/ })
  await userEvent.click(within(dez).getByRole("button", { name: /Duplicar para mim/ }))
  const dialog = await screen.findByRole("alertdialog")
  expect(dialog).toHaveTextContent("Isso substitui o seu planejamento de dezembro")
  expect(mockCopy).not.toHaveBeenCalled()
  await userEvent.click(within(dialog).getByRole("button", { name: "Substituir" }))
  expect(mockCopy).toHaveBeenCalledWith("o1", "sess-1", true)
  await waitFor(() => expect(onOpenMine).toHaveBeenCalledWith(new Date(2026, 11, 1)))
})

it("cancelar a confirmação de duplicar não copia", async () => {
  setup([plan({ id: "mine" }), plan({ id: "o1", isMine: false })])
  const dez = await screen.findByRole("region", { name: /Dezembro 2026/ })
  await userEvent.click(within(dez).getByRole("button", { name: /Duplicar para mim/ }))
  await userEvent.click(await screen.findByRole("button", { name: "Cancelar" }))
  expect(mockCopy).not.toHaveBeenCalled()
})

it("plan_in_use na cópia mostra a mensagem e não abre", async () => {
  mockCopy.mockRejectedValue(new PlanError("plan_in_use"))
  const { onOpenMine } = setup([plan({ id: "o1", isMine: false })])
  const dez = await screen.findByRole("region", { name: /Dezembro 2026/ })
  await userEvent.click(within(dez).getByRole("button", { name: /Duplicar para mim/ }))
  expect(await screen.findByRole("alert")).toHaveTextContent("Este planejamento está em uso em outra sessão.")
  expect(onOpenMine).not.toHaveBeenCalled()
})

it("Descartar confirma, chama DiscardPlan e recarrega a lista", async () => {
  setup([plan({ id: "mine" })])
  const dez = await screen.findByRole("region", { name: /Dezembro 2026/ })
  await userEvent.click(within(dez).getByRole("button", { name: /Descartar/ }))
  const dialog = await screen.findByRole("alertdialog")
  expect(mockDiscard).not.toHaveBeenCalled()
  mockList.mockResolvedValue([])
  await userEvent.click(within(dialog).getByRole("button", { name: "Descartar" }))
  expect(mockDiscard).toHaveBeenCalledWith("mine")
  await waitFor(() => expect(mockList).toHaveBeenCalledTimes(2))
  expect(await within(screen.getByRole("region", { name: /Dezembro 2026/ })).findByRole("button", { name: /Criar meu planejamento/ })).toBeInTheDocument()
})

it("concluído mostra quem/quando e Reabrir chama ReopenPlan e abre", async () => {
  const { onOpenMine } = setup([plan({ id: "mine", status: "concluido", concludedAt: "2026-11-24T12:00:00Z" })])
  const dez = await screen.findByRole("region", { name: /Dezembro 2026/ })
  expect(dez).toHaveTextContent("Concluído por Eu Mesmo em 24/11")
  await userEvent.click(within(dez).getByRole("button", { name: /Reabrir/ }))
  expect(mockReopen).toHaveBeenCalledWith("mine", "sess-1")
  await waitFor(() => expect(onOpenMine).toHaveBeenCalledWith(new Date(2026, 11, 1)))
})

it("unavailable mostra só a mensagem, sem botões", async () => {
  mockList.mockRejectedValue(new PlanError("unavailable"))
  render(<PlanChooser current={CURRENT} session="s" onOpenMine={jest.fn()} onViewOther={jest.fn()} />)
  expect(await screen.findByText("Planejamento compartilhado indisponível neste ambiente.")).toBeInTheDocument()
  expect(screen.queryByRole("button")).not.toBeInTheDocument()
})

it("outro erro mostra a mensagem e Tentar novamente recarrega", async () => {
  mockList.mockRejectedValueOnce(new PlanError("unknown"))
  mockList.mockResolvedValue([])
  render(<PlanChooser current={CURRENT} session="s" onOpenMine={jest.fn()} onViewOther={jest.fn()} />)
  expect(await screen.findByText("Não foi possível concluir a operação do planejamento. Tente novamente.")).toBeInTheDocument()
  await userEvent.click(screen.getByRole("button", { name: "Tentar novamente" }))
  expect(await screen.findByText("Novembro 2026")).toBeInTheDocument()
  expect(mockList).toHaveBeenCalledTimes(2)
})
