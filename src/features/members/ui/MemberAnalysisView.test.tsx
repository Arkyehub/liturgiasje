import { render, screen, within } from "@testing-library/react"
import { MemberAnalysisView } from "./MemberAnalysisView"
import { Profile } from "@/domain/models/Profile"
import { MemberReading } from "@/domain/models/Schedule"

jest.mock("@/shared/ui/UserAvatar", () => ({ UserAvatar: ({ name }: { name: string }) => <div data-testid="avatar">{name}</div> }))
jest.mock("@/shared/ui/calendar", () => ({
  Calendar: ({ modifiers }: { modifiers: { unavailable: Date[] } }) => <div data-testid="calendar">{modifiers.unavailable.length} marcadas</div>,
}))

const profile: Profile = {
  id: "p1",
  fullName: "Ana Teste",
  role: "reader",
  authUserId: "u1",
  email: "ana@exemplo.test",
  whatsapp: "(11) 98765-4321",
  birthDate: "1991-03-14",
  preferences: { day_preferences: { 6: ["19:00", "09:00"] } },
  claimedAt: "2026-04-12T14:20:00Z",
  lastSeenAt: "2026-11-08T10:30:00Z",
  createdAt: "2026-04-10T12:00:00Z",
  updatedAt: "2026-04-10T12:00:00Z",
}

const reading = (id: string, date: string, role = "1L", extra: Partial<MemberReading> = {}): MemberReading => ({
  slotId: id, massId: `m-${id}`, date, time: "09:00", role, specialDescription: null, isConfirmed: true, isSwapTakeover: false, ...extra,
})

const TODAY = "2026-11-09"

test("shows the profile data the member filled in", () => {
  render(<MemberAnalysisView profile={profile} readings={[]} unavailableDates={[]} today={TODAY} />)
  expect(screen.getByText("Ana Teste", { selector: "h2" })).toBeInTheDocument()
  expect(screen.getByText("(11) 98765-4321")).toHaveAttribute("href", "https://wa.me/5511987654321")
  expect(screen.getByText("ana@exemplo.test")).toBeInTheDocument()
  expect(screen.getByText(/14 de março de 1991/)).toBeInTheDocument()
  expect(screen.getByText(/35 anos/)).toBeInTheDocument()
  // a chave 6 é Domingo no app, e os horários aparecem ordenados
  const prefs = screen.getByText("Domingo").parentElement as HTMLElement
  expect(within(prefs).getAllByText(/\d\d:\d\d/).map((n) => n.textContent)).toEqual(["09:00", "19:00"])
  expect(screen.getByText(/08\/11\/2026 às/)).toBeInTheDocument()
})

test("separates past readings from upcoming ones and summarises them", () => {
  const readings = [
    reading("a", "2026-11-01", "1L"),
    reading("b", "2026-10-04", "1L", { isSwapTakeover: true }),
    reading("c", "2026-09-06", "P"),
    reading("d", "2026-11-15", "2L"),
  ]
  render(<MemberAnalysisView profile={profile} readings={readings} unavailableDates={[]} today={TODAY} />)

  expect(screen.getByText("3 leituras")).toBeInTheDocument()
  expect(screen.getByText("Próximas escalas", { selector: "span" })).toBeInTheDocument()
  expect(screen.getByText("Novembro de 2026")).toBeInTheDocument()
  expect(screen.getByText("Outubro de 2026")).toBeInTheDocument()
  expect(screen.getByText("Troca")).toBeInTheDocument()
  expect(screen.getByText("2x")).toBeInTheDocument() // 1ª Leitura é a função mais frequente
  expect(screen.getByText("Última em 01/11/2026")).toBeInTheDocument()
})

test("limits the history and reveals more on demand", () => {
  const readings = Array.from({ length: 12 }, (_, i) => reading(`r${i}`, `2026-0${(i % 9) + 1}-1${i % 9}`))
  render(<MemberAnalysisView profile={profile} readings={readings} unavailableDates={[]} today={TODAY} />)
  expect(screen.getByRole("button", { name: /Mostrar mais \(2\)/ })).toBeInTheDocument()
})

test("lists unavailable dates and ignores duplicates", () => {
  render(<MemberAnalysisView profile={profile} readings={[]} unavailableDates={["2026-11-22", "2026-11-22", "2026-10-05", "2026-12-06"]} today={TODAY} />)
  expect(screen.getByTestId("calendar")).toHaveTextContent("3 marcadas")
  expect(screen.getByText("3 datas")).toBeInTheDocument()
  expect(screen.getByText(/22\/11/)).toBeInTheDocument()
  expect(screen.queryByText(/05\/10/)).not.toBeInTheDocument() // passada: só aparece no calendário
})

test("flags archived and pending members and handles missing data", () => {
  render(
    <MemberAnalysisView
      profile={{ ...profile, authUserId: null, archivedAt: "2026-10-20T10:00:00Z", whatsapp: undefined, birthDate: undefined, email: null, preferences: {}, claimedAt: undefined, lastSeenAt: undefined }}
      readings={[]}
      unavailableDates={[]}
      today={TODAY}
    />
  )
  expect(screen.getByText("Inativo")).toBeInTheDocument()
  expect(screen.getByText(/Membro inativado em 20\/10\/2026/)).toBeInTheDocument()
  expect(screen.getByText("Não informado")).toBeInTheDocument()
  expect(screen.getByText("Não informada")).toBeInTheDocument()
  expect(screen.getByText("Não informados")).toBeInTheDocument()
  expect(screen.getByText("Ainda não")).toBeInTheDocument()
  expect(screen.getByText("Sem acessos")).toBeInTheDocument()
  expect(screen.getByText("Este membro ainda não realizou leituras.")).toBeInTheDocument()
  expect(screen.getByText("Nenhuma indisponibilidade futura registrada.")).toBeInTheDocument()
})
