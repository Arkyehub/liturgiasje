import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { ScheduleForm } from "./ScheduleForm"
import { makeCheckMassExists, makeCreateMassWithSlots, makeGetMembersUsage } from "@/main/factories/usecases/schedule"
import { makeListMembers } from "@/main/factories/usecases/members"
import { makeListUnavailableByDate } from "@/main/factories/usecases/user"
import { toast } from "sonner"

// Mocks
jest.mock("@/main/factories/usecases/schedule", () => ({
  makeCheckMassExists: jest.fn(),
  makeCreateMassWithSlots: jest.fn(),
  makeUpdateMass: jest.fn(),
  makeDeleteMass: jest.fn(),
  makeGetMembersUsage: jest.fn()
}))

jest.mock("@/main/factories/usecases/members", () => ({
  makeListMembers: jest.fn()
}))

jest.mock("@/main/factories/usecases/user", () => ({
  makeListUnavailableByDate: jest.fn()
}))

jest.mock("sonner", () => ({
  toast: {
    error: jest.fn(),
    success: jest.fn(),
    warning: jest.fn()
  }
}))

// Mock de ícones para evitar erros de renderização
jest.mock("lucide-react", () => ({
  Plus: () => <div />,
  Search: () => <div />,
  Trash2: () => <div />,
  Calendar: () => <div />,
  Clock: () => <div />,
  Type: () => <div />,
  CheckCircle2: () => <div />,
  User: () => <div />,
  AlertCircle: () => <div />
}))

describe("ScheduleForm Validation", () => {
  const mockCurrentMonth = new Date(2026, 3, 1) // Abril 2026
  
  beforeEach(() => {
    jest.clearAllMocks()
    
    // Mocks padrão para carregamento inicial
    ;(makeListMembers as jest.Mock).mockReturnValue({ execute: jest.fn().mockResolvedValue([]) })
    ;(makeGetMembersUsage as jest.Mock).mockReturnValue({ execute: jest.fn().mockResolvedValue({}) })
    ;(makeListUnavailableByDate as jest.Mock).mockReturnValue({ execute: jest.fn().mockResolvedValue([]) })
    ;(makeCheckMassExists as jest.Mock).mockReturnValue({ execute: jest.fn().mockResolvedValue([]) })
  })

  it("should prevent saving if two sessions have the same time in the same form", async () => {
    render(<ScheduleForm currentMonth={mockCurrentMonth} onSuccess={jest.fn()} onClose={jest.fn()} />)

    // Definir uma data
    const dateInput = screen.getByLabelText(/Data da Escala/i)
    fireEvent.change(dateInput, { target: { value: "2026-04-30" } })

    // O formulário cria a primeira sessão automaticamente ao setar a data
    // Adicionar segunda sessão
    const addSessionBtn = screen.getByText(/Adicionar outro Horário/i)
    fireEvent.click(addSessionBtn)

    // Definir o mesmo horário para ambas
    const timeInputs = screen.getAllByLabelText(/Horário/i)
    fireEvent.change(timeInputs[0], { target: { value: "07:00" } })
    fireEvent.change(timeInputs[1], { target: { value: "07:00" } })

    // Tentar salvar
    const saveBtn = screen.getByText(/Salvar Escala do Dia/i)
    fireEvent.click(saveBtn)

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Existem missas com o mesmo horário neste formulário.")
    })
  })

  it("should prevent saving if time already exists in database", async () => {
    // Simular que já existe uma missa às 19:00 no banco
    ;(makeCheckMassExists as jest.Mock).mockReturnValue({ 
      execute: jest.fn().mockResolvedValue([{ id: 'db-1', time: '19:00:00' }]) 
    })

    render(<ScheduleForm currentMonth={mockCurrentMonth} onSuccess={jest.fn()} onClose={jest.fn()} />)

    // Definir data
    const dateInput = screen.getByLabelText(/Data da Escala/i)
    fireEvent.change(dateInput, { target: { value: "2026-04-30" } })

    // Aguardar o carregamento assíncrono (useEffect disparado pela data)
    await waitFor(() => expect(makeCheckMassExists).toHaveBeenCalled())

    // Definir horário conflitante (19:00)
    const timeInput = screen.getByLabelText(/Horário/i)
    fireEvent.change(timeInput, { target: { value: "19:00" } })

    // Tentar salvar
    const saveBtn = screen.getByText(/Salvar Escala do Dia/i)
    fireEvent.click(saveBtn)

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Já existe uma missa cadastrada para o horário 19:00 neste dia.")
    })
  })

  it("should re-fetch usage counts when date month changes", async () => {
    const mockGetUsage = jest.fn().mockResolvedValue({ 'member-1': 2 })
    ;(makeGetMembersUsage as jest.Mock).mockReturnValue({ execute: mockGetUsage })

    render(<ScheduleForm currentMonth={mockCurrentMonth} onSuccess={jest.fn()} onClose={jest.fn()} />)

    // Primeiro carregamento (Abril) - baseado no mockCurrentMonth (2026-04-01)
    await waitFor(() => expect(mockGetUsage).toHaveBeenCalledWith("2026-04"))

    // Mudar para Junho
    const dateInput = screen.getByLabelText(/Data da Escala/i)
    fireEvent.change(dateInput, { target: { value: "2026-06-15" } })

    // Deve chamar novamente com Junho
    await waitFor(() => expect(mockGetUsage).toHaveBeenCalledWith("2026-06"))
  })
})
