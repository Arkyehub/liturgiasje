import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { AnnouncementCard } from "./AnnouncementCard"

jest.mock("lucide-react", () => new Proxy({ __esModule: true }, { get: (t, p) => (p in t ? (t as any)[p] : () => <i />) }))

const base = { id: "a1", title: "Ensaio do coral", content: "Sábado às 16h no salão", type: "Aviso" as const, isLoggedIn: true, isPublished: true }
// painel fechado = conteúdo fora do DOM
const content = () => screen.queryByText("Sábado às 16h no salão")

describe("AnnouncementCard — aviso não lido", () => {
  it("vem aberto, não deixa fechar e mostra Confirmar Leitura", async () => {
    render(<AnnouncementCard {...base} isRead={false} />)
    expect(content()).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Confirmar leitura/ })).toBeVisible()

    await userEvent.click(screen.getByText("Ensaio do coral"))
    expect(content()).toBeInTheDocument()
  })

  it("depois de lido, recolhe e o leitor pode abrir e fechar à vontade", async () => {
    const { rerender } = render(<AnnouncementCard {...base} isRead={false} />)
    rerender(<AnnouncementCard {...base} isRead={true} />)
    expect(content()).not.toBeInTheDocument()

    await userEvent.click(screen.getByText("Ensaio do coral"))
    expect(content()).toBeInTheDocument()
    await userEvent.click(screen.getByText("Ensaio do coral"))
    expect(content()).not.toBeInTheDocument()
  })

  it("já lido vem recolhido", () => {
    render(<AnnouncementCard {...base} isRead={true} />)
    expect(content()).not.toBeInTheDocument()
  })

  it("rascunho do admin e troca não são forçados a ficar abertos", () => {
    const { unmount } = render(<AnnouncementCard {...base} isRead={false} isPublished={false} isAdmin />)
    expect(content()).not.toBeInTheDocument()
    unmount()
    render(<AnnouncementCard {...base} type="Troca" isRead={false} />)
    expect(content()).not.toBeInTheDocument()
  })

  it("sem login continua recolhido e sem como abrir", async () => {
    render(<AnnouncementCard {...base} isLoggedIn={false} isRead={false} />)
    expect(content()).not.toBeInTheDocument()
    await userEvent.click(screen.getByText("Ensaio do coral"))
    expect(content()).not.toBeInTheDocument()
  })
})

describe("AnnouncementCard — visual novo do mural", () => {
  it("Confirmar leitura chama onRead; NOVO só aparece para não lido", async () => {
    const onRead = jest.fn()
    const { rerender } = render(<AnnouncementCard {...base} isRead={false} onRead={onRead} />)
    expect(screen.getByText("NOVO")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: /Confirmar leitura/ }))
    expect(onRead).toHaveBeenCalledWith("a1")
    rerender(<AnnouncementCard {...base} isRead={true} onRead={onRead} />)
    expect(screen.queryByText("NOVO")).not.toBeInTheDocument()
  })

  it("admin tem WhatsApp, Editar e Excluir sempre visíveis, mesmo recolhido", async () => {
    const onEdit = jest.fn()
    const onDelete = jest.fn()
    render(<AnnouncementCard {...base} isRead isAdmin onEdit={onEdit} onDelete={onDelete} />)
    expect(content()).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: /Editar/ }))
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: "a1" }))
    await userEvent.click(screen.getByRole("button", { name: /Excluir/ }))
    expect(onDelete).toHaveBeenCalledWith("a1")
  })

  it("áudio e documento aparecem no card aberto", () => {
    render(<AnnouncementCard {...base} isRead={false} audioUrls={["https://x/a.mp3"]} pdfUrls={["https://x/1-Programacao.pdf"]} />)
    expect(screen.getByRole("button", { name: /Ouvir áudio 1/ })).toBeInTheDocument()
    expect(screen.getByText("Programacao.pdf")).toBeInTheDocument()
  })

  it("Troca continua no card antigo (Aceitar Troca)", () => {
    render(<AnnouncementCard {...base} type="Troca" isRead={false} relatedScheduleSlotId="s1" authorId="u2" currentUserId="u1" />)
    expect(screen.queryByText("NOVO")).toBeInTheDocument() // card antigo também marca NOVO
    expect(screen.queryByRole("button", { name: /Confirmar leitura/i })).not.toBeInTheDocument()
  })
})

describe("AnnouncementCard — rascunho com anel laranja", () => {
  const ringOf = () => document.querySelector("article")!

  it("rascunho do admin tem anel laranja, lido ou não", () => {
    const { rerender } = render(<AnnouncementCard {...base} isRead={false} isPublished={false} isAdmin />)
    expect(ringOf()).toHaveClass("border-orange-500", "ring-orange-100")
    rerender(<AnnouncementCard {...base} isRead={true} isPublished={false} isAdmin />)
    expect(ringOf()).toHaveClass("border-orange-500", "ring-orange-100")
  })

  it("publicado não tem anel laranja", () => {
    render(<AnnouncementCard {...base} isRead={true} isAdmin />)
    expect(ringOf()).not.toHaveClass("border-orange-500")
  })
})

describe("AnnouncementCard — barra compacta do admin", () => {
  const viewers = [
    { name: "Mariana Costa", at: "2026-11-22T12:00:00Z" },
    { name: "Felipe Soares", at: "2026-11-21T20:00:00Z" },
  ]

  it("sem validade mostra ∞ e com validade mostra só a data", () => {
    const { rerender } = render(<AnnouncementCard {...base} isAdmin isRead viewers={viewers} />)
    expect(screen.getByRole("button", { name: "Sem validade" })).toHaveTextContent("∞")
    rerender(<AnnouncementCard {...base} isAdmin isRead viewers={viewers} expiresAt="2026-11-30T12:00:00" />)
    const btn = screen.getByRole("button", { name: "Validade: 30/11" })
    expect(btn).toHaveTextContent("30/11")
    expect(btn).not.toHaveTextContent(/sai em/i)
    expect(screen.queryByText(/No ar|Fora do ar/)).not.toBeInTheDocument()
  })

  it("janela de quem viu: só nomes, com N de T e sem data/hora", async () => {
    render(<AnnouncementCard {...base} isAdmin isRead viewers={viewers} totalReaders={14} />)
    await userEvent.click(screen.getByRole("button", { name: "2 viram" }))
    expect(await screen.findByText("Visualizado por")).toBeInTheDocument()
    expect(screen.getByText("2 de 14")).toBeInTheDocument()
    expect(screen.getByText("Mariana Costa")).toBeInTheDocument()
    expect(screen.getByText("Felipe Soares")).toBeInTheDocument()
    expect(screen.queryByText(/\d{2}\/\d{2}/)).not.toBeInTheDocument()
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "2")
  })

  it("sem total conhecido mostra só a contagem, sem barra", async () => {
    render(<AnnouncementCard {...base} isAdmin isRead viewers={viewers} />)
    await userEvent.click(screen.getByRole("button", { name: "2 viram" }))
    expect(await screen.findByText("Visualizado por")).toBeInTheDocument()
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument()
  })

  it("rascunho não tem botão de visualizações", () => {
    render(<AnnouncementCard {...base} isAdmin isPublished={false} viewers={[]} />)
    expect(screen.queryByRole("button", { name: /viu|viram/ })).not.toBeInTheDocument()
    expect(screen.getByText("RASCUNHO")).toBeInTheDocument()
  })
})
