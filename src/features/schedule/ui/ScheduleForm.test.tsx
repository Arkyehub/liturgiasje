import { useState } from "react"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { ScheduleForm } from "./ScheduleForm"
import { makeCheckMassExists, makeGetProfilesUsage, makeListOccupiedDatesForMonth, makeListSchedulesForMonth } from "@/main/factories/usecases/schedule"
import { makeListProfiles, makeListUnavailableByDate } from "@/main/factories/usecases/profiles"
import userEvent from "@testing-library/user-event"
import { toast } from "sonner"

// Mocks
jest.mock("@/main/factories/usecases/schedule", () => ({
  makeCheckMassExists: jest.fn(),
  makeSaveScheduleBatch: jest.fn(() => ({ execute: jest.fn().mockResolvedValue(undefined) })),
  makeCreateMassWithSlots: jest.fn(),
  makeUpdateMass: jest.fn(),
  makeDeleteMass: jest.fn(),
  makeGetProfilesUsage: jest.fn(),
  makeListOccupiedDatesForMonth: jest.fn(),
  makeListSchedulesForMonth: jest.fn()
}))

jest.mock("@/main/factories/usecases/profiles", () => ({
  makeListProfiles: jest.fn(),
  makeListUnavailableByDate: jest.fn()
}))

jest.mock("sonner", () => ({
  toast: {
    error: jest.fn(),
    success: jest.fn(),
    warning: jest.fn(),
    message: jest.fn()
  }
}))

jest.mock("@/shared/ui/TimeRoller", () => ({
  TimeRoller: ({ value, onChange }: any) => (
    <input aria-label="Horário" value={value} onChange={(e) => onChange(e.target.value)} />
  )
}))

// Mock de ícones para evitar erros de renderização
jest.mock("lucide-react", () => new Proxy({ __esModule: true }, {
  get: (target, prop) => (prop in target ? (target as any)[prop] : () => <div />)
}))

beforeAll(() => {
  // cmdk/popover depend on browser APIs missing from jsdom
  ;(global as any).ResizeObserver ||= class { observe() {} unobserve() {} disconnect() {} }
  Element.prototype.scrollIntoView ||= () => {}
})

describe("ScheduleForm Validation", () => {
  const mockCurrentMonth = new Date(2026, 3, 1) // Abril 2026
  
  beforeEach(() => {
    jest.clearAllMocks()
    
    // Mocks padrão para carregamento inicial
    ;(makeListProfiles as jest.Mock).mockReturnValue({ execute: jest.fn().mockResolvedValue([]) })
    ;(makeGetProfilesUsage as jest.Mock).mockReturnValue({ execute: jest.fn().mockResolvedValue({}) })
    ;(makeListUnavailableByDate as jest.Mock).mockReturnValue({ execute: jest.fn().mockResolvedValue([]) })
    ;(makeCheckMassExists as jest.Mock).mockReturnValue({ execute: jest.fn().mockResolvedValue([]) })
    ;(makeListOccupiedDatesForMonth as jest.Mock).mockReturnValue({ execute: jest.fn().mockResolvedValue([]) })
    ;(makeListSchedulesForMonth as jest.Mock).mockReturnValue({ execute: jest.fn().mockResolvedValue([]) })
  })

  it("should prevent saving if two sessions have the same time in the same form", async () => {
    render(<ScheduleForm currentMonth={mockCurrentMonth} onSuccess={jest.fn()} onClose={jest.fn()} />)

    // Definir data
    const dayBtn = screen.getByText("30")
    fireEvent.click(dayBtn)

    // O formulário cria a primeira sessão automaticamente ao setar a data
    // Adicionar segunda sessão
    const addSessionBtn = screen.getByText(/Adicionar outro Horário/i)
    fireEvent.click(addSessionBtn)

    // Definir o mesmo horário para ambas
    const timeInputs = screen.getAllByLabelText(/Horário/i)
    fireEvent.change(timeInputs[0], { target: { value: "07:00" } })
    fireEvent.change(timeInputs[1], { target: { value: "07:00" } })

    // Horário repetido: avisa no card e trava o salvamento
    expect((await screen.findAllByText(/Já existe uma missa às 07:00 neste dia/))).toHaveLength(2)
    expect(screen.getByRole("button", { name: /Salvar (Rascunho|alterações)/i })).toBeDisabled()
    expect(screen.getAllByRole("button", { name: /Concluir missa/i })[0]).toBeDisabled()

    // Corrigindo um dos horários, libera
    fireEvent.change(timeInputs[1], { target: { value: "09:00" } })
    await waitFor(() => expect(screen.queryByText(/Já existe uma missa às/)).not.toBeInTheDocument())
  })

  it("should prevent saving if time already exists in database", async () => {
    // Simular que já existe uma missa às 19:00 no banco
    ;(makeCheckMassExists as jest.Mock).mockReturnValue({ 
      execute: jest.fn().mockResolvedValue([{ id: 'db-1', time: '19:00:00' }]) 
    })

    render(<ScheduleForm currentMonth={mockCurrentMonth} onSuccess={jest.fn()} onClose={jest.fn()} />)

    // Definir data
    const dayBtn = screen.getByText("30")
    fireEvent.click(dayBtn)

    // Aguardar o carregamento assíncrono (useEffect disparado pela data)
    await waitFor(() => expect(makeCheckMassExists).toHaveBeenCalled())

    // Definir horário conflitante (19:00)
    const timeInput = screen.getByLabelText(/Horário/i)
    fireEvent.change(timeInput, { target: { value: "19:00" } })

    expect(await screen.findByText(/Já existe uma missa às 19:00 neste dia/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Salvar (Rascunho|alterações)/i })).toBeDisabled()
  })

  it("should fetch usage counts for the initial month", async () => {
    const mockGetUsage = jest.fn().mockResolvedValue({ 'profile-1': 2 })
    ;(makeGetProfilesUsage as jest.Mock).mockReturnValue({ execute: mockGetUsage })

    render(<ScheduleForm currentMonth={mockCurrentMonth} onSuccess={jest.fn()} onClose={jest.fn()} />)

    // Primeiro carregamento (Abril) - baseado no mockCurrentMonth (2026-04-01)
    await waitFor(() => expect(mockGetUsage).toHaveBeenCalledWith("2026-04"))
  })

  it("should not allow selecting a reader who is unavailable on the date", async () => {
    const profiles = [
      { id: "p-ok", fullName: "Disponivel Teste", role: "reader", createdAt: "", updatedAt: "" },
      { id: "p-un", fullName: "Indisponivel Teste", role: "reader", createdAt: "", updatedAt: "" }
    ]
    ;(makeListProfiles as jest.Mock).mockReturnValue({ execute: jest.fn().mockResolvedValue(profiles) })
    ;(makeListUnavailableByDate as jest.Mock).mockReturnValue({ execute: jest.fn().mockResolvedValue(["p-un"]) })

    render(<ScheduleForm currentMonth={mockCurrentMonth} onSuccess={jest.fn()} onClose={jest.fn()} />)
    fireEvent.click(screen.getByText("30"))
    await waitFor(() => expect(makeListUnavailableByDate).toHaveBeenCalled())

    await userEvent.click(await screen.findByRole("button", { name: /^Leitor$/ }))
    await userEvent.click(await screen.findByText("Escolher leitor"))
    const blocked = await screen.findByText("Indisponivel Teste")
    expect(blocked.closest("[cmdk-item]")).toHaveAttribute("data-disabled", "true")

    await userEvent.click(blocked)
    expect(screen.getByText("Escolher leitor")).toBeInTheDocument()

    await userEvent.click(await screen.findByText(/^Disponivel Teste/))
    await waitFor(() => expect(screen.queryByText("Escolher leitor")).not.toBeInTheDocument())
    expect(screen.getByText("Disponivel Teste", { selector: "span.truncate" })).toBeInTheDocument()
  })

  it.each([
    ["28", "2", "terça"],
    ["24", "5", "sexta"],
  ])("lista em 'Preferem este horário' quem marcou %s (%s) 19h na %s", async (day, key) => {
    const other = key === "2" ? "5" : "2"
    const mk = (id: string, name: string, dp: Record<string, string[]>) => ({ id, fullName: name, role: "reader", createdAt: "", updatedAt: "", preferences: { day_preferences: dp } })
    const profiles = [
      mk("p-pref", "Quer Este Dia", { [key]: ["19:00"] }),
      mk("p-other", "Quer Outro Dia", { [other]: ["19:00"] }),
      mk("p-none", "Sem Preferencia", {}),
    ]
    ;(makeListProfiles as jest.Mock).mockReturnValue({ execute: jest.fn().mockResolvedValue(profiles) })
    render(<ScheduleForm currentMonth={mockCurrentMonth} onSuccess={jest.fn()} onClose={jest.fn()} />)
    fireEvent.click(screen.getByText(day))
    fireEvent.change(screen.getAllByLabelText(/Horário/i)[0], { target: { value: "19:00" } })
    await userEvent.click(await screen.findByRole("button", { name: /^Leitor$/ }))
    await userEvent.click(await screen.findByText("Escolher leitor"))

    const heading = await screen.findByText(/Preferem este horário/)
    const group = heading.closest("[cmdk-group]") as HTMLElement
    expect(group).toHaveTextContent("Quer Este Dia")
    expect(group).not.toHaveTextContent("Quer Outro Dia")
    expect(group).not.toHaveTextContent("Sem Preferencia")
  })

  it("esconde o calendário ao escolher o dia, mostra o dia com lápis, e o lápis reabre", async () => {
    const onDateChange = jest.fn()
    render(<ScheduleForm currentMonth={mockCurrentMonth} onSuccess={jest.fn()} onClose={jest.fn()} onDateChange={onDateChange} />)
    expect(screen.getByText("DOM")).toBeInTheDocument()
    fireEvent.click(screen.getByText("30"))
    expect(screen.queryByText("DOM")).not.toBeInTheDocument()
    expect(screen.getByText(/Quinta, 30 de abril/i)).toBeInTheDocument()
    await waitFor(() => expect(onDateChange).toHaveBeenLastCalledWith("2026-04-30"))

    await userEvent.click(screen.getByRole("button", { name: "Alterar data" }))
    expect(screen.getByText("DOM")).toBeInTheDocument()
    fireEvent.click(screen.getByText("29"))
    expect(screen.queryByText("DOM")).not.toBeInTheDocument()
    expect(screen.getByText(/Quarta, 29 de abril/i)).toBeInTheDocument()
    await waitFor(() => expect(onDateChange).toHaveBeenLastCalledWith("2026-04-29"))
  })

  it("navega entre meses no calendário e recarrega os dias ocupados", async () => {
    const occupied = jest.fn().mockResolvedValue([])
    ;(makeListOccupiedDatesForMonth as jest.Mock).mockReturnValue({ execute: occupied })
    render(<ScheduleForm currentMonth={mockCurrentMonth} onSuccess={jest.fn()} onClose={jest.fn()} />)
    await waitFor(() => expect(occupied).toHaveBeenCalledWith("2026-04"))
    await userEvent.click(screen.getByRole("button", { name: "Próximo mês" }))
    await waitFor(() => expect(occupied).toHaveBeenCalledWith("2026-05"))
    expect(screen.getByText(/maio 2026/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Mês anterior" }))
    expect(screen.getByText(/abril 2026/i)).toBeInTheDocument()
  })

  it("atalhos de horário mudam o horário da missa", async () => {
    render(<ScheduleForm currentMonth={mockCurrentMonth} onSuccess={jest.fn()} onClose={jest.fn()} />)
    fireEvent.click(screen.getByText("30"))
    await userEvent.click(await screen.findByRole("button", { name: "19:00" }))
    expect((screen.getAllByLabelText(/Horário/i)[0] as HTMLInputElement).value).toBe("19:00")
  })

  it("ao tocar numa função a lista de leitores abre, com os menos escalados primeiro", async () => {
    const mk = (id: string, name: string) => ({ id, fullName: name, role: "reader", createdAt: "", updatedAt: "" })
    ;(makeListProfiles as jest.Mock).mockReturnValue({ execute: jest.fn().mockResolvedValue([mk("a", "Ana"), mk("b", "Bruno"), mk("c", "Carla")]) })
    ;(makeGetProfilesUsage as jest.Mock).mockReturnValue({ execute: jest.fn().mockResolvedValue({ a: 3, b: 0, c: 1 }) })
    render(<ScheduleForm currentMonth={mockCurrentMonth} onSuccess={jest.fn()} onClose={jest.fn()} />)
    fireEvent.click(screen.getByText("30"))
    await userEvent.click(await screen.findByRole("button", { name: /^Leitor$/ }))
    const dialog = await screen.findByRole("dialog", { name: /Escolher/ })
    await screen.findByText(/Bruno/)
    const names = Array.from(dialog.querySelectorAll("[cmdk-item]")).map(el => el.textContent || "")
    expect(names[0]).toMatch(/Bruno/)
    expect(names[1]).toMatch(/Carla/)
    expect(names[2]).toMatch(/Ana/)
  })

  it("Concluir missa fica bloqueado com função sem leitor", async () => {
    render(<ScheduleForm currentMonth={mockCurrentMonth} onSuccess={jest.fn()} onClose={jest.fn()} />)
    fireEvent.click(screen.getByText("30"))
    await userEvent.click(await screen.findByRole("button", { name: /^Leitor$/ }))
    await userEvent.click(await screen.findByRole("button", { name: /Fechar seleção de leitor/ }))
    expect(screen.getByRole("button", { name: /Concluir missa/ })).toBeDisabled()
  })

  it("avisa quando há alterações não salvas e permite desfazer a exclusão de uma missa", async () => {
    const onDirtyChange = jest.fn()
    render(<ScheduleForm currentMonth={mockCurrentMonth} onSuccess={jest.fn()} onClose={jest.fn()} onDirtyChange={onDirtyChange} />)
    fireEvent.click(screen.getByText("30"))
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(false))
    await userEvent.type(await screen.findByLabelText(/Descrição da missa/), "Missa da Catequese")
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(true))

    fireEvent.click(screen.getByText(/Adicionar outro Horário/i))
    await userEvent.click((await screen.findAllByRole("button", { name: "Excluir esta missa" }))[1])
    expect(toast.message).toHaveBeenCalledWith(expect.stringMatching(/excluída/), expect.objectContaining({ action: expect.objectContaining({ label: "Desfazer" }) }))
    const { action } = (toast.message as jest.Mock).mock.calls.at(-1)[1]
    expect(screen.getAllByLabelText(/Horário/i)).toHaveLength(1)
    action.onClick()
    await waitFor(() => expect(screen.getAllByLabelText(/Horário/i)).toHaveLength(2))
  })

  it("should collapse a mass into a summary and expand it again", async () => {
    render(<ScheduleForm currentMonth={mockCurrentMonth} onSuccess={jest.fn()} onClose={jest.fn()} />)
    fireEvent.click(screen.getByText("30"))

    await userEvent.type(await screen.findByLabelText(/Descrição da missa/), "Missa da Catequese")
    fireEvent.click(await screen.findByRole("button", { name: /Concluir missa/i }))
    expect(screen.queryByRole("button", { name: /Concluir missa/i })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: /Editar missa das 07:00/i }))
    expect(await screen.findByRole("button", { name: /Concluir missa/i })).toBeInTheDocument()
  })

  it("should offer to edit the existing day instead of creating a duplicate", async () => {
    ;(makeCheckMassExists as jest.Mock).mockReturnValue({
      execute: jest.fn().mockResolvedValue([{ id: "db-1", time: "19:00:00" }])
    })
    const onEditExisting = jest.fn()

    render(<ScheduleForm currentMonth={mockCurrentMonth} onSuccess={jest.fn()} onClose={jest.fn()} onEditExisting={onEditExisting} />)
    fireEvent.click(screen.getByText("30"))

    fireEvent.click(await screen.findByRole("button", { name: /Editar a escala do dia 30/i }))
    expect(onEditExisting).toHaveBeenCalledWith("2026-04-30")
    expect(screen.queryByText(/Adicionar outro Horário/i)).not.toBeInTheDocument()
  })

  it("should block a reader who is already scheduled on the same day", async () => {
    const profiles = [{ id: "p-ok", fullName: "Disponivel Teste", role: "reader", createdAt: "", updatedAt: "" }]
    ;(makeListProfiles as jest.Mock).mockReturnValue({ execute: jest.fn().mockResolvedValue(profiles) })

    render(<ScheduleForm currentMonth={mockCurrentMonth} onSuccess={jest.fn()} onClose={jest.fn()} />)
    fireEvent.click(screen.getByText("30"))

    await userEvent.click(await screen.findByRole("button", { name: /^Leitor$/ }))
    await userEvent.click(await screen.findByRole("button", { name: /^Leitor$/ }))

    await userEvent.click((await screen.findAllByText("Escolher leitor"))[0])
    await userEvent.click(await screen.findByText(/^Disponivel Teste/))

    await userEvent.click((await screen.findAllByText("Escolher leitor"))[0])
    const items = (await screen.findAllByText("Disponivel Teste")).map(el => el.closest("[cmdk-item]")).filter(Boolean)
    expect(items).toHaveLength(1)
    expect(items[0]).toHaveAttribute("data-disabled", "true")
    expect(screen.getByText("Já escalado")).toBeInTheDocument()
  })

  it("should suggest a free time for a new mass instead of repeating one", async () => {
    render(<ScheduleForm currentMonth={mockCurrentMonth} onSuccess={jest.fn()} onClose={jest.fn()} />)
    fireEvent.click(screen.getByText("30"))
    fireEvent.click(await screen.findByText(/Adicionar outro Horário/i))

    const timeInputs = screen.getAllByLabelText(/Horário/i) as HTMLInputElement[]
    expect(timeInputs.map(i => i.value)).toEqual(["07:00", "09:00"])
  })

  it("missa sem funções só salva com descrição; função declarada exige leitor", async () => {
    const profiles = [{ id: "p-ok", fullName: "Disponivel Teste", role: "reader", createdAt: "", updatedAt: "" }]
    ;(makeListProfiles as jest.Mock).mockReturnValue({ execute: jest.fn().mockResolvedValue(profiles) })

    render(<ScheduleForm currentMonth={mockCurrentMonth} onSuccess={jest.fn()} onClose={jest.fn()} />)
    fireEvent.click(screen.getByText("30"))

    // Missa sem funções e sem descrição: não dá para concluir a missa (aviso único, no card)
    expect(await screen.findByText(/precisa de descrição para ser concluída/)).toBeInTheDocument()
    expect(screen.getAllByText(/precisa de (uma )?descrição/)).toHaveLength(1)
    expect(screen.getByRole("button", { name: /Concluir missa/ })).toBeDisabled()
    expect(screen.getByRole("button", { name: /Salvar (Rascunho|alterações)/i })).toBeDisabled()

    // Com descrição, conclui e salva sem nenhuma função
    await userEvent.type(screen.getByLabelText(/Descrição da missa/), "Missa da Catequese")
    expect(screen.queryByText(/precisa de descrição para ser concluída/)).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Concluir missa/ })).toBeEnabled()
    await userEvent.click(screen.getByRole("button", { name: /Concluir missa/ }))
    await waitFor(() => expect(screen.getByRole("button", { name: /Salvar (Rascunho|alterações)/i })).toBeEnabled())
    await userEvent.click(screen.getByRole("button", { name: /Editar missa das/ }))

    // Declarou uma função: a lista de leitores já abre; sem leitor, a missa não conclui
    await userEvent.click(await screen.findByRole("button", { name: /^Leitor$/ }))
    expect(await screen.findByRole("dialog", { name: /Escolher/ })).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: /Fechar seleção de leitor/ }))
    expect(await screen.findByText(/Escolha o leitor da função que está vazia/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Concluir missa/ })).toBeDisabled()
    expect(screen.getByRole("button", { name: /Salvar Rascunho/i })).toBeDisabled()

    // Com leitor escolhido, conclui e libera
    await userEvent.click(await screen.findByText("Escolher leitor"))
    await userEvent.click(await screen.findByText(/^Disponivel Teste/))
    expect(screen.getByRole("button", { name: /Concluir missa/ })).toBeEnabled()
    expect(screen.getByRole("button", { name: /Salvar Rascunho/i })).toBeDisabled() // ainda aberta
    await userEvent.click(screen.getByRole("button", { name: /Concluir missa/ }))
    await waitFor(() => expect(screen.getByRole("button", { name: /Salvar Rascunho/i })).toBeEnabled())
  })

  describe("revalidação ao trocar de dia", () => {
    const profiles = [{ id: "p1", fullName: "Leitor Um", role: "reader", createdAt: "", updatedAt: "" }]

    beforeEach(() => {
      ;(makeListProfiles as jest.Mock).mockReturnValue({ execute: jest.fn().mockResolvedValue(profiles) })
    })

    it("remove da função o leitor que está indisponível no novo dia e impede salvar", async () => {
      ;(makeListUnavailableByDate as jest.Mock).mockReturnValue({
        execute: jest.fn((d: string) => Promise.resolve(d === "2026-04-30" ? ["p1"] : []))
      })
      render(<ScheduleForm currentMonth={mockCurrentMonth} onSuccess={jest.fn()} onClose={jest.fn()} />)

      fireEvent.click(screen.getByText("29"))
      await userEvent.click(await screen.findByRole("button", { name: /^Leitor$/ }))
      await userEvent.click(await screen.findByText("Escolher leitor"))
      await userEvent.click(await screen.findByText(/^Leitor Um/))
      await userEvent.click(screen.getByRole("button", { name: /Concluir missa/ }))
      await waitFor(() => expect(screen.getByRole("button", { name: /Salvar (Rascunho|alterações)/i })).toBeEnabled())

      fireEvent.click(screen.getByRole("button", { name: "Alterar data" }))
      fireEvent.click(screen.getByText("30"))

      await waitFor(() => expect(screen.getByRole("button", { name: /Salvar (Rascunho|alterações)/i })).toBeDisabled())
      expect(screen.getAllByText(/1 função sem leitor/).length).toBeGreaterThan(0)
      expect(toast.warning).toHaveBeenCalledWith(expect.stringMatching(/Leitor Um/))
    })

    it("ignora resposta atrasada de um dia anterior", async () => {
      let resolveA: (v: string[]) => void = () => {}
      ;(makeListUnavailableByDate as jest.Mock).mockReturnValue({
        execute: jest.fn((d: string) => d === "2026-04-29"
          ? new Promise<string[]>(r => { resolveA = r })
          : Promise.resolve([]))
      })
      render(<ScheduleForm currentMonth={mockCurrentMonth} onSuccess={jest.fn()} onClose={jest.fn()} />)

      fireEvent.click(screen.getByText("29"))
      fireEvent.click(screen.getByRole("button", { name: "Alterar data" }))
      fireEvent.click(screen.getByText("30"))
      await waitFor(() => expect(makeListUnavailableByDate).toHaveBeenCalledTimes(2))
      resolveA(["p1"]) // resposta do dia 29 chega depois da do dia 30
      await new Promise(r => setTimeout(r, 30))

      await userEvent.click(await screen.findByRole("button", { name: /^Leitor$/ }))
      await userEvent.click(await screen.findByText("Escolher leitor"))
      expect(screen.queryByText(/Não podem neste dia/)).not.toBeInTheDocument()
    })

    it("recarrega os dias ocupados quando o mês muda", async () => {
      const occupied = jest.fn().mockResolvedValue([])
      ;(makeListOccupiedDatesForMonth as jest.Mock).mockReturnValue({ execute: occupied })
      const { rerender } = render(<ScheduleForm currentMonth={mockCurrentMonth} onSuccess={jest.fn()} onClose={jest.fn()} />)
      await waitFor(() => expect(occupied).toHaveBeenCalledWith("2026-04"))
      rerender(<ScheduleForm currentMonth={new Date(2026, 4, 1)} onSuccess={jest.fn()} onClose={jest.fn()} />)
      await waitFor(() => expect(occupied).toHaveBeenCalledWith("2026-05"))
    })
  })

  describe("de criar para editar o dia existente (como no page.tsx)", () => {
    const existing = [{ id: "db-1", time: "07:00:00" }]
    const editData = (d: string) => [{
      id: "db-1", date: d, time: "07:00:00", scheduleRevision: 1,
      slots: [{ id: "s1", role: "C", profileId: "p1", readerName: "Leitor Teste" }]
    }]

    function Host({ onClose = jest.fn() }: { onClose?: () => void }) {
      const [init, setInit] = useState<any>(null)
      return (
        <ScheduleForm
          currentMonth={mockCurrentMonth}
          initialData={init}
          onEditExisting={(d) => setInit(editData(d))}
          onSuccess={jest.fn()}
          onClose={onClose}
        />
      )
    }

    beforeEach(() => {
      ;(makeCheckMassExists as jest.Mock).mockReturnValue({ execute: jest.fn().mockResolvedValue(existing) })
    })

    it("ao clicar em Editar no dia que já tem escala, abre a edição das missas do dia", async () => {
      render(<Host />)
      fireEvent.click(screen.getByText("30"))
      fireEvent.click(await screen.findByRole("button", { name: /Editar a escala do dia 30/i }))

      expect(await screen.findByRole("button", { name: /Editar missa das 07:00/i })).toBeInTheDocument()
      expect(screen.queryByRole("alert")).not.toBeInTheDocument()
      expect(screen.queryByText(/Horário repetido/)).not.toBeInTheDocument()
      expect(screen.getByRole("button", { name: /Salvar (Rascunho|alterações)/i })).toBeEnabled()
    })

    it("em edição o dia fica travado: trocar de data não move a missa nem cria conflito falso", async () => {
      render(<Host />)
      fireEvent.click(screen.getByText("30"))
      fireEvent.click(await screen.findByRole("button", { name: /Editar a escala do dia 30/i }))
      await screen.findByRole("button", { name: /Editar missa das 07:00/i })

      // Em edição o calendário fica recolhido e sem lápis: não há como trocar o dia.
      expect(screen.queryByRole("button", { name: /^27 de abril/i })).not.toBeInTheDocument()
      expect(screen.queryByRole("button", { name: "Alterar data" })).not.toBeInTheDocument()
      expect(screen.getByText(/Quinta, 30 de abril/i)).toBeInTheDocument()
      expect(screen.queryByText(/Horário repetido/)).not.toBeInTheDocument()
      expect(screen.getByRole("button", { name: /Salvar (Rascunho|alterações)/i })).toBeEnabled()
    })
  })
})
