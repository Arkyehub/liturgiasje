import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MassPreferencesField } from "./MassPreferencesField"
import { hasAnyMassPreference, toggleDayPreference } from "../lib/massPreferences"

jest.mock("lucide-react", () => new Proxy({ __esModule: true }, { get: (t, p) => (p in t ? (t as any)[p] : () => <i />) }))

describe("MassPreferencesField", () => {
  it("mostra Domingo, Terça e Sexta com os horários certos", () => {
    render(<MassPreferencesField value={{}} onToggle={() => {}} />)
    expect(screen.getByRole("button", { name: "Domingo 07:00" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Domingo 19:00" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Terça-feira 19:00" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Sexta-feira 19:00" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Terça-feira 07:00" })).not.toBeInTheDocument()
  })

  it("marca vários dias e chama onToggle com a chave do dia (Domingo = 6)", async () => {
    const onToggle = jest.fn()
    render(<MassPreferencesField value={{ "6": ["09:00"], "2": ["19:00"] }} onToggle={onToggle} />)
    expect(screen.getByRole("button", { name: "Domingo 09:00" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("button", { name: "Terça-feira 19:00" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("button", { name: "Sexta-feira 19:00" })).toHaveAttribute("aria-pressed", "false")
    await userEvent.click(screen.getByRole("button", { name: "Sexta-feira 19:00" }))
    expect(onToggle).toHaveBeenCalledWith("5", "19:00")
  })
})

describe("massPreferences", () => {
  it("toggle mantém os outros dias e remove o dia sem horários", () => {
    let p = toggleDayPreference({}, "6", "11:00")
    p = toggleDayPreference(p, "2", "19:00")
    p = toggleDayPreference(p, "6", "07:00")
    expect(p).toEqual({ "6": ["07:00", "11:00"], "2": ["19:00"] })
    p = toggleDayPreference(p, "2", "19:00")
    expect(p).toEqual({ "6": ["07:00", "11:00"] })
  })

  it("perfil completo com qualquer dia marcado", () => {
    expect(hasAnyMassPreference({})).toBe(false)
    expect(hasAnyMassPreference({ "6": [] })).toBe(false)
    expect(hasAnyMassPreference({ "5": ["19:00"] })).toBe(true)
    expect(hasAnyMassPreference(undefined)).toBe(false)
  })
})
