import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { toast } from "sonner"
import { SuggestionList } from "./SuggestionList"
import { summarizePlan } from "../lib/suggestSchedule"
import type { PlanMass, PlanReader, ReaderStats } from "../lib/types"

jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warning: jest.fn() } }))

const reader = (id: string, fullName: string, dayPreferences: Record<string, string[]> = {}): PlanReader => ({
  id,
  fullName,
  createdAt: "2025-01-01",
  dayPreferences,
})

const READERS = [
  reader("ana", "Ana Ribeiro", { "6": ["07:00", "11:00"], "2": ["19:00"] }),
  reader("bia", "Bia Souza"),
  reader("caio", "Caio Lima"),
  reader("duda", "Duda Prado"),
]
const NAMES: Record<string, string> = {
  ana: "Ana Ribeiro",
  bia: "Bia Souza",
  caio: "Caio Lima",
  duda: "Duda Prado",
  zeca: "Zeca Arquivado",
}
const STATS: Record<string, ReaderStats> = {
  ana: { readerId: "ana", monthlyAverage: 2.3333, scheduled: 7, takeovers: 0, passed: 0, roleShare: { C: 0.2, R: 0.7, P: 0.1 } },
}
// Bia não pode em 06/12
const UNAVAILABLE = { "2026-12-06": ["bia"], "2026-12-24": ["ana"], "2026-12-25": ["ana"] }

const MASSES: PlanMass[] = [
  {
    key: "tue",
    date: "2026-12-01",
    time: "19:00",
    description: "",
    wasPublished: false,
    readOnly: false,
    slots: [
      { role: "C", profileId: "ana", locked: true },
      { role: "L", profileId: "bia", locked: false, warning: "outside-preference" },
    ],
  },
  {
    key: "sun7",
    date: "2026-12-06",
    time: "07:00",
    description: "",
    wasPublished: false,
    readOnly: false,
    slots: [
      { role: "C", profileId: "caio", locked: false },
      { role: "1L", profileId: "", locked: false },
      { role: "2L", profileId: "zeca", locked: true },
      { role: "P", profileId: "ana", locked: false },
    ],
  },
  {
    key: "sun9",
    date: "2026-12-06",
    time: "09:00",
    description: "",
    wasPublished: false,
    readOnly: false,
    slots: [{ role: "C", profileId: "duda", locked: false }],
  },
]

function setup(props: Partial<React.ComponentProps<typeof SuggestionList>> = {}) {
  const handlers = {
    onSetReader: jest.fn(),
    onToggleLock: jest.fn(),
    onSuggestAgain: jest.fn(),
  }
  const masses = props.masses ?? MASSES
  render(
    <SuggestionList
      masses={masses}
      readers={READERS}
      readerNames={NAMES}
      stats={STATS}
      unavailable={UNAVAILABLE}
      summary={summarizePlan(masses)}
      monthName="dezembro"
      {...handlers}
      {...props}
    />,
  )
  const rows = () => within(screen.getByRole("list", { name: "Vagas sugeridas" })).getAllByRole("listitem")
  return { ...handlers, rows }
}

beforeEach(() => jest.clearAllMocks())

test("one line per role: code + reader name; date only on the day's first line, time only on the mass's first line", () => {
  const { rows } = setup()
  const lines = rows()
  expect(lines).toHaveLength(7)
  expect(lines[0]).toHaveTextContent("01")
  expect(lines[0]).toHaveTextContent("TER")
  expect(lines[0]).toHaveTextContent("19:00")
  expect(within(lines[0]).getByText("C")).toBeInTheDocument()
  expect(within(lines[0]).getByText("Ana Ribeiro")).toBeInTheDocument()
  expect(within(lines[1]).getByText("L")).toBeInTheDocument()
  expect(lines[1]).not.toHaveTextContent("19:00")
  expect(lines[1]).not.toHaveTextContent("TER")
  // domingo: 06/DOM só na 1ª linha; 09:00 é a 1ª linha da 2ª missa, sem data
  expect(lines[2]).toHaveTextContent("06")
  expect(lines[2]).toHaveTextContent("DOM")
  expect(lines[2]).toHaveTextContent("07:00")
  expect(lines[3]).not.toHaveTextContent("DOM")
  expect(lines[3]).not.toHaveTextContent("07:00")
  expect(lines[6]).toHaveTextContent("09:00")
  expect(lines[6]).not.toHaveTextContent("DOM")
})

test("outside-preference shows ⚠️ labelled 'Fora da preferência'; an empty slot shows 'sem leitor · escolher'", () => {
  const { rows } = setup()
  const lines = rows()
  expect(within(lines[1]).getByRole("img", { name: "Fora da preferência" })).toBeInTheDocument()
  expect(within(lines[0]).queryByRole("img", { name: "Fora da preferência" })).not.toBeInTheDocument()
  expect(screen.getAllByRole("img", { name: "Fora da preferência" })).toHaveLength(1)
  expect(within(lines[3]).getByRole("button", { name: /sem leitor · escolher/ })).toBeInTheDocument()
  expect(within(lines[3]).queryByRole("button", { name: "Travar leitor" })).not.toBeInTheDocument()
})

test("the summary on top comes from summarizePlan", () => {
  setup()
  expect(screen.getByRole("status")).toHaveTextContent("6 de 7 vagas preenchidas · 1 fora da preferência · 1 sem leitor")
})

test("🔒 reflects the lock with aria-pressed and reports the slot", async () => {
  const { rows, onToggleLock } = setup()
  const lines = rows()
  const locked = within(lines[0]).getByRole("button", { name: "Destravar leitor" })
  expect(locked).toHaveAttribute("aria-pressed", "true")
  const unlocked = within(lines[1]).getByRole("button", { name: "Travar leitor" })
  expect(unlocked).toHaveAttribute("aria-pressed", "false")
  await userEvent.click(unlocked)
  expect(onToggleLock).toHaveBeenCalledWith("tue", 1)
  await userEvent.click(locked)
  expect(onToggleLock).toHaveBeenLastCalledWith("tue", 0)
})

test("filters: Todas, Com aviso (N) and Travadas (N)", async () => {
  const { rows } = setup()
  expect(screen.getByRole("button", { name: "Todas" })).toHaveAttribute("aria-pressed", "true")
  await userEvent.click(screen.getByRole("button", { name: "Com aviso (2)" }))
  expect(screen.getByRole("button", { name: "Com aviso (2)" })).toHaveAttribute("aria-pressed", "true")
  let lines = rows()
  expect(lines).toHaveLength(2)
  expect(lines[0]).toHaveTextContent("Bia Souza")
  // a 1ª linha visível de cada dia/missa recebe a data e o horário
  expect(lines[0]).toHaveTextContent("TER")
  expect(lines[0]).toHaveTextContent("19:00")
  expect(lines[1]).toHaveTextContent("sem leitor")
  expect(lines[1]).toHaveTextContent("DOM")

  await userEvent.click(screen.getByRole("button", { name: "Travadas (2)" }))
  lines = rows()
  expect(lines.map((l) => l.textContent)).toEqual([expect.stringContaining("Ana Ribeiro"), expect.stringContaining("Zeca Arquivado")])

  await userEvent.click(screen.getByRole("button", { name: "Todas" }))
  expect(rows()).toHaveLength(7)
})

test("'Sugerir de novo' re-runs the lamp; save/detail/preview follow their props", async () => {
  const { onSuggestAgain } = setup()
  await userEvent.click(screen.getByRole("button", { name: /Sugerir de novo/ }))
  expect(onSuggestAgain).toHaveBeenCalledTimes(1)
  expect(screen.getByRole("button", { name: "Salvar como rascunho" })).toBeDisabled()
  expect(screen.getByRole("button", { name: "Detalhar" })).toBeDisabled()
  expect(screen.getByRole("button", { name: /Prévia/ })).toBeDisabled()
})

test("save/detail/preview are enabled and called when provided", async () => {
  const onSave = jest.fn()
  const onDetail = jest.fn()
  const onPreview = jest.fn()
  setup({ onSave, onDetail, onPreview })
  await userEvent.click(screen.getByRole("button", { name: "Salvar como rascunho" }))
  await userEvent.click(screen.getByRole("button", { name: "Detalhar" }))
  await userEvent.click(screen.getByRole("button", { name: /Prévia/ }))
  expect(onSave).toHaveBeenCalledTimes(1)
  expect(onDetail).toHaveBeenCalledTimes(1)
  expect(onPreview).toHaveBeenCalledTimes(1)
})

test("the picker lists only eligible readers, flags unavailable and same-mass ones, and choosing reports the slot", async () => {
  const { rows, onSetReader } = setup()
  await userEvent.click(within(rows()[3]).getByRole("button", { name: /sem leitor · escolher/ }))
  const picker = await screen.findByRole("dialog", { name: /Escolher leitor/ })
  const options = within(picker).getAllByRole("button", { name: /Ribeiro|Souza|Lima|Prado|Arquivado/ })
  // como no ScheduleForm: livres primeiro; bloqueados por último; menos escalados no mês antes, depois nome
  expect(options.map((o) => o.textContent)).toEqual([
    expect.stringContaining("Duda Prado"),
    expect.stringContaining("Bia Souza"),
    expect.stringContaining("Caio Lima"),
    expect.stringContaining("Ana Ribeiro"),
  ])
  expect(within(picker).getByText("Não podem nesta missa")).toBeInTheDocument()
  expect(within(picker).queryByText("Zeca Arquivado")).not.toBeInTheDocument()

  const bia = within(picker).getByRole("button", { name: /Bia Souza/ })
  expect(bia).toHaveAttribute("aria-disabled", "true")
  expect(bia).toHaveTextContent("Indisponível")
  await userEvent.click(bia)
  expect(onSetReader).not.toHaveBeenCalled()
  expect(toast.warning).toHaveBeenCalledWith(expect.stringMatching(/Bia Souza informou que não poderá/), expect.anything())

  const ana = within(picker).getByRole("button", { name: /Ana Ribeiro/ })
  expect(ana).toHaveAttribute("aria-disabled", "true")
  expect(ana).toHaveTextContent("Já nesta missa")
  await userEvent.click(ana)
  expect(onSetReader).not.toHaveBeenCalled()

  await userEvent.click(within(picker).getByRole("button", { name: /Duda Prado/ }))
  expect(onSetReader).toHaveBeenCalledWith("sun7", 1, "duda")
  expect(screen.queryByRole("dialog", { name: /Escolher leitor/ })).not.toBeInTheDocument()
})

test("tapping a filled name opens the picker for that slot", async () => {
  const { rows, onSetReader } = setup()
  await userEvent.click(within(rows()[1]).getByRole("button", { name: /Bia Souza/ }))
  const picker = await screen.findByRole("dialog", { name: /Escolher leitor/ })
  expect(picker).toHaveTextContent("L · 01/12 às 19:00")
  await userEvent.click(within(picker).getByRole("button", { name: /Caio Lima/ }))
  expect(onSetReader).toHaveBeenCalledWith("tue", 1, "caio")
})

test("an existing slot of an archived reader keeps its name, locked, but the reader is never offered", async () => {
  const { rows } = setup()
  const line = rows()[4]
  expect(within(line).getByText("Zeca Arquivado")).toBeInTheDocument()
  expect(within(line).getByRole("button", { name: "Destravar leitor" })).toHaveAttribute("aria-pressed", "true")
  await userEvent.click(within(line).getByRole("button", { name: /Zeca Arquivado/ }))
  const picker = await screen.findByRole("dialog", { name: /Escolher leitor/ })
  expect(within(picker).queryByText("Zeca Arquivado")).not.toBeInTheDocument()
})

test("a read-only mass cannot be changed from the list", () => {
  const readOnly: PlanMass[] = [{ ...MASSES[0], readOnly: true, wasPublished: true }]
  const { rows } = setup({ masses: readOnly })
  const [first, second] = rows()
  expect(within(first).getByRole("button", { name: /Ana Ribeiro/ })).toBeDisabled()
  expect(within(first).getByRole("button", { name: "Destravar leitor" })).toBeDisabled()
  expect(within(second).getByRole("button", { name: "Travar leitor" })).toBeDisabled()
})

test("👁 opens the reader card: month slots (current marked), count vs target, 3-month average, top role, preferences, unavailability", async () => {
  const { rows } = setup()
  await userEvent.click(within(rows()[5]).getByRole("button", { name: "Ver escalas do leitor no mês" }))
  const card = await screen.findByRole("dialog", { name: "Ana Ribeiro" })
  const items = within(within(card).getByRole("list", { name: "Escalas em dezembro" })).getAllByRole("listitem")
  expect(items).toHaveLength(2)
  expect(items[0]).toHaveTextContent("01/12")
  expect(items[0]).toHaveTextContent("Comentarista")
  expect(items[0]).not.toHaveTextContent("ESTA")
  expect(items[1]).toHaveTextContent("06/12")
  expect(items[1]).toHaveTextContent("Preces")
  expect(items[1]).toHaveTextContent("ESTA")
  // 7 vagas ÷ 4 leitores aptos = 1,75 ⇒ meta "1 a 2"
  expect(within(card).getByText("2 missas")).toBeInTheDocument()
  expect(within(card).getByText("1 a 2")).toBeInTheDocument()
  expect(within(card).getByText("2,3 por mês")).toBeInTheDocument()
  expect(card).toHaveTextContent("Mais faz: Leitura")
  expect(within(card).getByText("Dom 07:00")).toBeInTheDocument()
  expect(within(card).getByText("Dom 11:00")).toBeInTheDocument()
  expect(within(card).getByText("Ter 19:00")).toBeInTheDocument()
  expect(within(card).getByText("Indisponível: 24/12, 25/12")).toBeInTheDocument()

  await userEvent.click(within(card).getByRole("button", { name: "Fechar" }))
  expect(screen.queryByRole("dialog", { name: "Ana Ribeiro" })).not.toBeInTheDocument()
})

test("the reader card marks ⚠️ on slots outside preference and handles readers without history", async () => {
  const { rows } = setup()
  await userEvent.click(within(rows()[1]).getByRole("button", { name: "Ver escalas do leitor no mês" }))
  const card = await screen.findByRole("dialog", { name: "Bia Souza" })
  const [item] = within(within(card).getByRole("list", { name: "Escalas em dezembro" })).getAllByRole("listitem")
  expect(item).toHaveTextContent("ESTA")
  expect(within(item).getByRole("img", { name: "Fora da preferência" })).toBeInTheDocument()
  expect(within(card).getByText("1 missa")).toBeInTheDocument()
  expect(card).toHaveTextContent("Sem histórico de funções")
  expect(card).toHaveTextContent("Sem preferência marcada")
  expect(within(card).getByText("Indisponível: 06/12")).toBeInTheDocument()
})

test("the reader card shows 'Por quê' only on the ESTA row", async () => {
  const masses: PlanMass[] = [
    {
      ...MASSES[0],
      slots: [
        { role: "C", profileId: "ana", locked: false, reason: "Preferência neste horário · 2 leituras no mês (meta 1 a 2)" },
        { role: "L", profileId: "ana", locked: false, reason: "Escolhido à mão" },
      ],
    },
  ]
  const { rows } = setup({ masses })
  await userEvent.click(within(rows()[0]).getByRole("button", { name: "Ver escalas do leitor no mês" }))
  const card = await screen.findByRole("dialog", { name: "Ana Ribeiro" })
  const items = within(within(card).getByRole("list", { name: "Escalas em dezembro" })).getAllByRole("listitem")
  expect(items[0]).toHaveTextContent("ESTA")
  expect(items[0]).toHaveTextContent("Por quê: Preferência neste horário · 2 leituras no mês (meta 1 a 2)")
  expect(items[1]).not.toHaveTextContent("Por quê")
  expect(items[1]).not.toHaveTextContent("Escolhido à mão")
})
