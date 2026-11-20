import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import AdminMembersPage from "./page"
import {
  makeListProfiles,
  makeListArchivedProfiles,
  makeUnarchiveProfile,
} from "@/main/factories/usecases/profiles"
import { Profile } from "@/domain/models/Profile"

jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }) }))
jest.mock("@/shared/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "admin-auth" }, profile: { id: "admin", role: "admin" }, loading: false }),
}))
jest.mock("@/main/factories/usecases/profiles", () => ({
  makeListProfiles: jest.fn(),
  makeListArchivedProfiles: jest.fn(),
  makeUnarchiveProfile: jest.fn(),
  makeArchiveProfile: jest.fn(),
  makeCreateProfile: jest.fn(),
  makeUpdateProfile: jest.fn(),
}))
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }))
jest.mock("@/shared/ui/UserAvatar", () => ({ UserAvatar: ({ name }: { name: string }) => <span>{name[0]}</span> }))
jest.mock("@/features/members/ui/MemberForm", () => ({ MemberForm: () => null }))
jest.mock("@/shared/ui/sheet", () => ({
  Sheet: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SheetContent: () => null,
  SheetHeader: () => null,
  SheetTitle: () => null,
}))
// Drawer simplificado: renderiza o conteúdo só quando está aberto
jest.mock("@/shared/ui/drawer", () => ({
  Drawer: ({ open, children }: { open?: boolean; children: React.ReactNode }) => (open ? <div role="dialog">{children}</div> : null),
  DrawerContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DrawerHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DrawerFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DrawerTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DrawerDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DrawerClose: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))
jest.mock("lucide-react", () => new Proxy({ __esModule: true }, { get: (t, p) => (p in t ? (t as Record<string | symbol, unknown>)[p] : () => <i />) }))

const member = (id: string, fullName: string, extra: Partial<Profile> = {}): Profile => ({
  id, fullName, role: "reader", authUserId: `auth-${id}`, createdAt: "2026-01-01", updatedAt: "2026-01-01", archivedAt: null, ...extra,
})
const ana = member("p-ana", "Ana Ativa")
const leitorTeste = member("p-lt", "Leitor Teste", { archivedAt: "2026-07-01T00:00:00Z" })

test("a reactivated member leaves the inactive list and shows up in the active list right away", async () => {
  const unarchive = jest.fn().mockResolvedValue(undefined)
  const listActive = jest.fn()
    .mockResolvedValueOnce([ana]) // carga inicial: ele ainda está inativo
    .mockResolvedValue([ana, { ...leitorTeste, archivedAt: null }]) // depois da reativação
  ;(makeListProfiles as jest.Mock).mockReturnValue({ execute: listActive })
  ;(makeListArchivedProfiles as jest.Mock).mockReturnValue({ execute: jest.fn().mockResolvedValue([leitorTeste]) })
  ;(makeUnarchiveProfile as jest.Mock).mockReturnValue({ execute: unarchive })

  render(<AdminMembersPage />)
  expect(await screen.findByText("Ana Ativa")).toBeInTheDocument()
  expect(screen.queryByText("Leitor Teste")).not.toBeInTheDocument()

  await userEvent.click(screen.getByRole("button", { name: "Inativos" }))
  expect(await screen.findByText("Leitor Teste")).toBeInTheDocument()

  await userEvent.click(screen.getByTitle("Reativar membro"))
  await userEvent.click(await screen.findByRole("button", { name: "Sim, reativar" }))

  await waitFor(() => expect(unarchive).toHaveBeenCalledWith("p-lt"))
  // some da lista de inativos...
  await waitFor(() => expect(screen.queryByText("Leitor Teste")).not.toBeInTheDocument())

  // ...e aparece em Ativos, sem recarregar a página
  await userEvent.click(screen.getByRole("button", { name: "Ativos" }))
  expect(await screen.findByText("Leitor Teste")).toBeInTheDocument()
  expect(within(screen.getByText("Leitor Teste").closest("div.bg-white") as HTMLElement).queryByTitle("Reativar membro")).not.toBeInTheDocument()
  expect(listActive.mock.calls.length).toBeGreaterThanOrEqual(2)
})
