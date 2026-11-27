import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { SettingsSheet } from "./SettingsSheet"
import { DEFAULT_LAMP_RULES, type LampRules, type StandardMass } from "@/domain/models/PlannerSettings"

jest.mock("lucide-react", () => new Proxy({ __esModule: true }, { get: (t, p) => (p in t ? (t as Record<string | symbol, unknown>)[p] : () => <i />) }))

function setup(props: Partial<React.ComponentProps<typeof SettingsSheet>> = {}) {
  const onSave = jest.fn().mockResolvedValue(true)
  const onClose = jest.fn()
  const onRetry = jest.fn()
  render(
    <SettingsSheet
      status="ready"
      standardMasses={[]}
      lampRules={DEFAULT_LAMP_RULES}
      error={null}
      onSave={onSave}
      onClose={onClose}
      onRetry={onRetry}
      {...props}
    />,
  )
  return { onSave, onClose, onRetry }
}

const addTime = (day: string) => userEvent.click(screen.getByRole("button", { name: `Adicionar horário na ${day.toLowerCase()}` }))
const setTime = async (label: string, value: string) => {
  const input = screen.getByLabelText(label) as HTMLInputElement
  await userEvent.clear(input)
  await userEvent.type(input, value)
}
const saveButton = () => screen.getByRole("button", { name: /^Salvar|Salvando/ })

test("nenhuma missa vem pronta: cada dia começa vazio e as seis regras vêm marcadas", async () => {
  setup()
  await screen.findByText("Configurações do planejamento")
  expect(screen.getAllByText("Nenhuma missa neste dia.")).toHaveLength(7)
  const rules = [
    "Equilibrar a carga entre os leitores",
    "Respeitar preferências de dia e horário",
    "Combinar o leitor com a função que ele mais faz",
    "Evitar o mesmo leitor duas vezes no mesmo dia",
    "Evitar fins de semana seguidos",
    "Dar mais vagas a quem serviu menos nos meses anteriores",
  ]
  rules.forEach((r) => expect(screen.getByRole("checkbox", { name: r })).toBeChecked())
  expect(screen.getByText(/Sempre valem: indisponibilidade na data, um leitor por missa e vagas travadas/)).toBeInTheDocument()
  expect(saveButton()).toBeDisabled() // nada mudou
})

test("adiciona um horário com funções e salva: devolve missas ordenadas e fecha o painel", async () => {
  const { onSave, onClose } = setup()
  await addTime("Domingo")
  await setTime("Horário 1 de Domingo", "09:00")
  await userEvent.click(screen.getByLabelText("Função P - horário 1 de Domingo"))
  await userEvent.click(screen.getByLabelText("Função C - horário 1 de Domingo"))
  await addTime("Terça")
  await setTime("Horário 1 de Terça", "19:00")
  await userEvent.click(screen.getByLabelText("Função L - horário 1 de Terça"))
  await userEvent.click(screen.getByLabelText("Função C - horário 1 de Terça"))
  await userEvent.click(saveButton())
  await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
  const [masses, rules] = onSave.mock.calls[0] as [StandardMass[], LampRules]
  expect(masses).toEqual([
    { weekday: 0, time: "09:00", roles: ["C", "P"] },
    { weekday: 2, time: "19:00", roles: ["C", "L"] },
  ])
  expect(rules).toEqual(DEFAULT_LAMP_RULES)
  await waitFor(() => expect(onClose).toHaveBeenCalled())
})

test("Leitura única (L) não convive com 1ª e 2ª leituras", async () => {
  setup()
  await addTime("Domingo")
  const role = (r: string) => screen.getByLabelText(`Função ${r} - horário 1 de Domingo`)
  await userEvent.click(role("1L"))
  await userEvent.click(role("2L"))
  expect(role("1L")).toBeChecked()
  await userEvent.click(role("L"))
  expect(role("L")).toBeChecked()
  expect(role("1L")).not.toBeChecked()
  expect(role("2L")).not.toBeChecked()
  await userEvent.click(role("2L"))
  expect(role("2L")).toBeChecked()
  expect(role("L")).not.toBeChecked()
})

test("horário vazio, sem função ou repetido no mesmo dia bloqueia o Salvar com a mensagem", async () => {
  setup()
  await addTime("Sexta")
  expect(screen.getByRole("alert")).toHaveTextContent("Informe um horário válido.")
  expect(saveButton()).toBeDisabled()
  await setTime("Horário 1 de Sexta", "19:00")
  expect(screen.getByRole("alert")).toHaveTextContent("Marque ao menos uma função.")
  await userEvent.click(screen.getByLabelText("Função C - horário 1 de Sexta"))
  expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  expect(saveButton()).toBeEnabled()
  await addTime("Sexta")
  await setTime("Horário 2 de Sexta", "19:00")
  await userEvent.click(screen.getByLabelText("Função L - horário 2 de Sexta"))
  expect(screen.getAllByRole("alert").some((a) => a.textContent === "Já existe este horário neste dia.")).toBe(true)
  expect(saveButton()).toBeDisabled()
})

test("remove um horário existente e salva sem ele", async () => {
  const { onSave } = setup({ standardMasses: [{ weekday: 0, time: "09:00", roles: ["C"] }, { weekday: 0, time: "11:00", roles: ["C", "P"] }] })
  await userEvent.click(screen.getByRole("button", { name: "Remover horário 1 de Domingo" }))
  await userEvent.click(saveButton())
  await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
  expect(onSave.mock.calls[0][0]).toEqual([{ weekday: 0, time: "11:00", roles: ["C", "P"] }])
})

test("desmarcar uma regra (inclusive equilibrar a carga) e salvar; Restaurar regras padrão marca todas de novo", async () => {
  const { onSave } = setup()
  await userEvent.click(screen.getByRole("checkbox", { name: "Equilibrar a carga entre os leitores" }))
  await userEvent.click(screen.getByRole("checkbox", { name: "Evitar fins de semana seguidos" }))
  expect(saveButton()).toBeEnabled()
  await userEvent.click(saveButton())
  await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
  expect(onSave.mock.calls[0][1]).toEqual({ ...DEFAULT_LAMP_RULES, balance: false, weekends: false })
})

test("Restaurar regras padrão volta tudo a marcado e não apaga as missas padrão", async () => {
  setup({ standardMasses: [{ weekday: 0, time: "09:00", roles: ["C"] }], lampRules: { ...DEFAULT_LAMP_RULES, balance: false, history: false } })
  expect(screen.getByRole("checkbox", { name: "Equilibrar a carga entre os leitores" })).not.toBeChecked()
  await userEvent.click(screen.getByRole("button", { name: "Restaurar regras padrão" }))
  screen.getAllByRole("checkbox").filter((c) => /Equilibrar|Dar mais vagas/.test(c.getAttribute("aria-label") ?? c.parentElement?.textContent ?? "")).forEach((c) => expect(c).toBeChecked())
  expect(screen.getByLabelText("Horário 1 de Domingo")).toHaveValue("09:00")
})

test("Cancelar fecha sem salvar", async () => {
  const { onSave, onClose } = setup()
  await userEvent.click(screen.getByRole("checkbox", { name: "Equilibrar a carga entre os leitores" }))
  await userEvent.click(screen.getByRole("button", { name: "Cancelar" }))
  expect(onClose).toHaveBeenCalledTimes(1)
  expect(onSave).not.toHaveBeenCalled()
})

test("falha ao salvar mantém o painel aberto e mostra a mensagem", async () => {
  const onSave = jest.fn().mockResolvedValue(false)
  const { onClose } = setup({ onSave, error: "Há algo inválido nas configurações. Confira os horários e as funções." })
  await userEvent.click(screen.getByRole("checkbox", { name: "Equilibrar a carga entre os leitores" }))
  await userEvent.click(saveButton())
  await waitFor(() => expect(onSave).toHaveBeenCalled())
  expect(onClose).not.toHaveBeenCalled()
  expect(screen.getByRole("alert")).toHaveTextContent("Há algo inválido")
  await waitFor(() => expect(saveButton()).toBeEnabled())
})

test("carregando: só a mensagem e Fechar; sem formulário", () => {
  setup({ status: "loading" })
  expect(screen.getByText("Carregando suas configurações...")).toBeInTheDocument()
  expect(screen.queryByRole("button", { name: "Salvar" })).not.toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Fechar" })).toBeInTheDocument()
})

test("erro de leitura: mensagem e Tentar novamente; nada para salvar (não sobrescreve o que não foi lido)", async () => {
  const { onRetry } = setup({ status: "error", error: "Não foi possível concluir a operação. Tente novamente." })
  expect(screen.getByRole("alert")).toHaveTextContent("Tente novamente")
  expect(screen.queryByRole("button", { name: "Salvar" })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole("button", { name: "Tentar novamente" }))
  expect(onRetry).toHaveBeenCalledTimes(1)
})

test("indisponível neste ambiente: só o aviso e Fechar", () => {
  setup({ status: "unavailable" })
  expect(screen.getByRole("status")).toHaveTextContent("Configurações indisponíveis neste ambiente.")
  expect(screen.queryByRole("button", { name: "Salvar" })).not.toBeInTheDocument()
  within(document.body).getByRole("button", { name: "Fechar" })
})
