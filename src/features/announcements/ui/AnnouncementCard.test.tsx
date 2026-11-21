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
