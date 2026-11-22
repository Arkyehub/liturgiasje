import { render, screen, fireEvent } from "@testing-library/react"
import { BirthdayNoticeCard } from "./BirthdayNoticeCard"

jest.mock("lucide-react", () => new Proxy({ __esModule: true } as Record<string | symbol, unknown>, { get: (t, p) => (p in t ? t[p] : () => <i />) }))

const base = { id: "birthday-a-2026", fullName: "Ana Souza", isOwn: false, onConfirm: jest.fn() }

describe("BirthdayNoticeCard", () => {
  it("não lido: NOVO e confirma leitura", () => {
    const onConfirm = jest.fn()
    render(<BirthdayNoticeCard {...base} isRead={false} onConfirm={onConfirm} />)
    expect(screen.getByText("Aniversário de Ana")).toBeTruthy()
    expect(screen.getByText("NOVO")).toBeTruthy()
    fireEvent.click(screen.getByText("Confirmar leitura"))
    expect(onConfirm).toHaveBeenCalledWith("birthday-a-2026")
  })

  it("próprio aniversário mostra felicitação", () => {
    render(<BirthdayNoticeCard {...base} isOwn isRead={false} />)
    expect(screen.getByText("Feliz aniversário, Ana!")).toBeTruthy()
    expect(screen.getByText("Hoje é o seu dia!")).toBeTruthy()
  })

  it("lido: VISTO colapsado, sem botão", () => {
    render(<BirthdayNoticeCard {...base} isRead />)
    expect(screen.getByText("VISTO")).toBeTruthy()
    expect(screen.queryByText("Confirmar leitura")).toBeNull()
  })
})
