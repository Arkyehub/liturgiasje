import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ProfileImageEditor } from "./ProfileImageEditor"
import { useAuth } from "@/shared/hooks/useAuth"
import { makeUploadAvatar, makeUpdateProfile } from "@/main/factories/usecases/profiles"
import { imageUrlToAvatarBlob } from "@/shared/lib/imageUtils"

jest.mock("@/shared/hooks/useAuth", () => ({ useAuth: jest.fn() }))
jest.mock("@/main/factories/usecases/profiles", () => ({ makeUploadAvatar: jest.fn(), makeUpdateProfile: jest.fn() }))
jest.mock("@/shared/lib/imageUtils", () => ({ imageUrlToAvatarBlob: jest.fn(), getCroppedImg: jest.fn() }))
jest.mock("./ImageCropperModal", () => ({ ImageCropperModal: () => null }))
jest.mock("sonner", () => ({ toast: { error: jest.fn(), success: jest.fn() } }))
jest.mock("lucide-react", () => new Proxy({ __esModule: true }, { get: (t, p) => (p in t ? (t as any)[p] : () => <i />) }))

const GOOGLE = "https://lh3.googleusercontent.com/a/abc=s96-c"
const blob = new Blob(["x"], { type: "image/webp" })

describe("ProfileImageEditor — foto do Google", () => {
  let upload: jest.Mock, update: jest.Mock, refresh: jest.Mock
  const setAuth = (profile: any) =>
    (useAuth as jest.Mock).mockReturnValue({ user: { id: "u1", user_metadata: { avatar_url: GOOGLE } }, profile, refreshProfile: refresh })

  beforeEach(() => {
    jest.clearAllMocks()
    upload = jest.fn().mockResolvedValue("https://storage/avatars/p1/avatar.webp")
    update = jest.fn().mockResolvedValue({})
    refresh = jest.fn().mockResolvedValue(undefined)
    ;(makeUploadAvatar as jest.Mock).mockReturnValue({ execute: upload })
    ;(makeUpdateProfile as jest.Mock).mockReturnValue({ execute: update })
  })

  it("importa sozinho na primeira visita enviando o arquivo compactado, não a URL", async () => {
    ;(imageUrlToAvatarBlob as jest.Mock).mockResolvedValue(blob)
    setAuth({ id: "p1", avatarUrl: null, authUserId: "u1" })
    render(<ProfileImageEditor />)
    await waitFor(() => expect(upload).toHaveBeenCalledWith("p1", blob))
    expect(imageUrlToAvatarBlob).toHaveBeenCalledWith(GOOGLE)
    expect(update).not.toHaveBeenCalled()
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })

  it("se o download falhar, guarda a URL como plano B", async () => {
    ;(imageUrlToAvatarBlob as jest.Mock).mockRejectedValue(new Error("CORS"))
    jest.spyOn(console, "warn").mockImplementation(() => {})
    setAuth({ id: "p1", avatarUrl: null, authUserId: "u1" })
    render(<ProfileImageEditor />)
    await waitFor(() => expect(update).toHaveBeenCalledWith("p1", { avatarUrl: GOOGLE }))
    expect(upload).not.toHaveBeenCalled()
  })

  it("não sobrescreve quando o perfil já tem foto", async () => {
    setAuth({ id: "p1", avatarUrl: "https://storage/minha.webp", authUserId: "u1" })
    render(<ProfileImageEditor />)
    await new Promise(r => setTimeout(r, 30))
    expect(imageUrlToAvatarBlob).not.toHaveBeenCalled()
    expect(upload).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })

  it("o botão manual 'Usar foto do Google' também envia o arquivo compactado", async () => {
    ;(imageUrlToAvatarBlob as jest.Mock).mockResolvedValue(blob)
    setAuth({ id: "p1", avatarUrl: "https://storage/outra.webp", authUserId: "u1" })
    render(<ProfileImageEditor />)
    await userEvent.click(await screen.findByText(/Usar foto do Google/i))
    await waitFor(() => expect(upload).toHaveBeenCalledWith("p1", blob))
  })
})
