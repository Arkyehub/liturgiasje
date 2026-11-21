import { render, screen, waitFor, fireEvent } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { addMonths } from "date-fns"
import { AnnouncementForm } from "./AnnouncementForm"
import { useAnnouncementStore } from "../store/useAnnouncementStore"
import { storageService } from "@/shared/api/storage"

jest.mock("@/shared/api/storage", () => ({
  storageService: {
    uploadFile: jest.fn(),
    extractPathFromUrl: jest.fn((u: string) => `path/${u.split("/").pop()}`),
    removeFiles: jest.fn().mockResolvedValue(undefined),
  },
}))
jest.mock("sonner", () => ({ toast: { error: jest.fn(), success: jest.fn(), warning: jest.fn() } }))
jest.mock("lucide-react", () => new Proxy({ __esModule: true }, { get: (t, p) => (p in t ? (t as any)[p] : () => <i />) }))

const publishBtn = () => screen.getByRole("button", { name: /Publicar aviso|Salvar e publicar/ })
const draftBtn = () => screen.getByRole("button", { name: /Salvar rascunho/ })

describe("AnnouncementForm (novo visual)", () => {
  let onSave: jest.Mock, onClose: jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()
    localStorage.clear()
    useAnnouncementStore.getState().clearDraft()
    onSave = jest.fn().mockResolvedValue(undefined)
    onClose = jest.fn()
  })

  const setup = (initialData?: any) => render(<AnnouncementForm initialData={initialData} onSave={onSave} onClose={onClose} />)

  it("começa sem poder publicar e explica o motivo; libera com título + mensagem", async () => {
    setup()
    expect(await screen.findByText(/Escreva um título e uma mensagem/)).toBeInTheDocument()
    expect(publishBtn()).toBeDisabled()
    expect(draftBtn()).toBeDisabled()

    await userEvent.type(screen.getByLabelText("Título"), "Ensaio do coral")
    expect(screen.getByText(/Escreva a mensagem ou anexe algo/)).toBeInTheDocument()
    expect(publishBtn()).toBeDisabled()

    await userEvent.type(screen.getByLabelText("Mensagem"), "Sábado às 16h")
    expect(publishBtn()).toBeEnabled()
    expect(draftBtn()).toBeEnabled()
    expect(screen.getByText(/Vai para o mural/)).toBeInTheDocument()
  })

  it("Publicar envia isPublished=true e Salvar rascunho envia false", async () => {
    setup()
    await userEvent.type(await screen.findByLabelText("Título"), "  Aviso  ")
    await userEvent.type(screen.getByLabelText("Mensagem"), "Texto")

    await userEvent.click(publishBtn())
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ title: "Aviso", content: "Texto", isPublished: true, expiresAt: null })))

    // o envio limpa o rascunho do store; preenche de novo pela tela
    await userEvent.type(screen.getByLabelText("Título"), "Aviso 2")
    await userEvent.type(screen.getByLabelText("Mensagem"), "Texto 2")
    await userEvent.click(draftBtn())
    await waitFor(() => expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ isPublished: false })))
  })

  it("validade ligada exige uma data; com a data escolhida libera e envia expiresAt", async () => {
    setup()
    await userEvent.type(await screen.findByLabelText("Título"), "Aviso")
    await userEvent.type(screen.getByLabelText("Mensagem"), "Texto")

    await userEvent.click(screen.getByRole("switch"))
    expect(screen.getByText(/Escolha a data de validade ou desligue a opção/)).toBeInTheDocument()
    expect(publishBtn()).toBeDisabled()

    await userEvent.click(screen.getByRole("button", { name: "Próximo mês" }))
    await userEvent.click(screen.getByRole("button", { name: /^15 de/ }))
    expect(publishBtn()).toBeEnabled()

    await userEvent.click(publishBtn())
    await waitFor(() => expect(onSave).toHaveBeenCalled())
    const sent: Date = onSave.mock.calls[0][0].expiresAt
    expect(sent).toBeInstanceOf(Date)
    expect(sent.getDate()).toBe(15)
    expect(sent.getMonth()).toBe(addMonths(new Date(), 1).getMonth())
  })

  it("dias passados do calendário de validade ficam desativados", async () => {
    setup()
    await userEvent.click(await screen.findByRole("switch"))
    expect(screen.getByRole("button", { name: "Mês anterior" })).toBeDisabled()
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1)
    if (yesterday.getMonth() === new Date().getMonth()) {
      expect(screen.getByRole("button", { name: new RegExp(`^${yesterday.getDate()} de`) })).toBeDisabled()
    }
  })

  it("anexa imagem, mostra a contagem e remove apagando o arquivo novo do storage", async () => {
    ;(storageService.uploadFile as jest.Mock).mockResolvedValue("https://x/announcements/images/1-foto.png")
    const { container } = setup()
    await screen.findByLabelText("Título")
    const input = container.querySelector('input[type="file"][accept="image/*"]') as HTMLInputElement
    await userEvent.upload(input, new File(["x"], "foto.png", { type: "image/png" }))

    expect(await screen.findByAltText("Anexo")).toBeInTheDocument()
    expect(screen.getByText("1 de 3", { selector: "span" })).toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: "Remover imagem" }))
    await waitFor(() => expect(storageService.removeFiles).toHaveBeenCalledWith(["path/1-foto.png"]))
    expect(screen.queryByAltText("Anexo")).not.toBeInTheDocument()
  })

  it("um anexo basta no lugar da mensagem", async () => {
    ;(storageService.uploadFile as jest.Mock).mockResolvedValue("https://x/announcements/pdfs/1-programacao.pdf")
    const { container } = setup()
    await userEvent.type(await screen.findByLabelText("Título"), "Programação")
    const input = container.querySelector('input[type="file"][accept*=".pdf"]') as HTMLInputElement
    await userEvent.upload(input, new File(["x"], "programacao.pdf", { type: "application/pdf" }))
    expect(await screen.findByRole("button", { name: "Remover PDF" })).toBeInTheDocument()
    expect(publishBtn()).toBeEnabled()
    expect(screen.getByText(/1 documento/)).toBeInTheDocument()
  })

  it("gravação de áudio: mostra o estado Gravando e para pelo botão Parar", async () => {
    const stop = jest.fn()
    class FakeRecorder { mimeType = "audio/webm"; ondataavailable: any; onstop: any; start = jest.fn(); stop = stop; constructor() {} }
    ;(global as any).MediaRecorder = FakeRecorder
    ;(navigator as any).mediaDevices = { getUserMedia: jest.fn().mockResolvedValue({ getTracks: () => [] }) }
    setup()
    await userEvent.click(await screen.findByRole("button", { name: "Gravar áudio" }))
    expect(await screen.findByText("Gravando…")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Parar gravação" }))
    expect(stop).toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByText("Gravando…")).not.toBeInTheDocument())
  })

  it("edição: mostra o status e o botão Salvar e publicar", async () => {
    setup({ id: "a1", title: "Missa de Natal", content: "Horários", isPublished: false })
    expect(await screen.findByText("Rascunho")).toBeInTheDocument()
    expect(publishBtn()).toHaveTextContent("Salvar e publicar")
    expect(screen.getByLabelText("Título")).toHaveValue("Missa de Natal")
    expect(screen.getByText(/Fica como rascunho até você publicar/)).toBeInTheDocument()
  })

  it("Cancelar apaga os arquivos novos e fecha", async () => {
    ;(storageService.uploadFile as jest.Mock).mockResolvedValue("https://x/announcements/images/2-nova.png")
    const { container } = setup()
    await screen.findByLabelText("Título")
    const input = container.querySelector('input[type="file"][accept="image/*"]') as HTMLInputElement
    await userEvent.upload(input, new File(["x"], "nova.png", { type: "image/png" }))
    await screen.findByAltText("Anexo")
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }))
    expect(storageService.removeFiles).toHaveBeenCalledWith(["path/2-nova.png"])
    expect(onClose).toHaveBeenCalled()
  })
})
