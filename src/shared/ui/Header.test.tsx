import { render, screen } from "@testing-library/react"
import type { ReactNode, ReactElement } from "react"
import { Header } from "./Header"

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => <a href={href} {...rest}>{children}</a>,
}))
// Menu simplificado: o conteúdo fica sempre renderizado
jest.mock("@/shared/ui/dropdown-menu", () => {
  const Pass = ({ children }: { children?: ReactNode }) => <div>{children}</div>
  return {
    DropdownMenu: Pass,
    DropdownMenuContent: Pass,
    DropdownMenuGroup: Pass,
    DropdownMenuLabel: Pass,
    DropdownMenuSeparator: () => <hr />,
    DropdownMenuTrigger: Pass,
    DropdownMenuItem: ({ render, children }: { render?: ReactElement; children?: ReactNode }) => <div>{render ?? children}</div>,
  }
})
jest.mock("lucide-react", () => new Proxy({ __esModule: true }, { get: (t, p) => (p in t ? (t as Record<string | symbol, unknown>)[p] : () => <i />) }))

test("the admin menu links to the schedule planning page after the users analysis", () => {
  render(<Header user={{ fullName: "Admin", role: "admin" }} />)
  const link = screen.getByRole("link", { name: /Planejamento de Escala/ })
  expect(link).toHaveAttribute("href", "/admin/planejamento")
  const analysis = screen.getByRole("link", { name: /Análise de Usuários/ })
  expect(analysis.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
})

test("a reader does not see the planning link", () => {
  render(<Header user={{ fullName: "Leitor", role: "reader" }} />)
  expect(screen.queryByRole("link", { name: /Planejamento de Escala/ })).not.toBeInTheDocument()
})
