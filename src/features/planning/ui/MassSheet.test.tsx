import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MassSheet } from "./MassSheet"
import type { PlanMass } from "../lib/types"
import { otherMassTimes } from "../lib/massConflicts"

const month = new Date(2026, 11, 1) // dezembro/2026: domingos 6, 13, 20, 27

function setup(props: Partial<React.ComponentProps<typeof MassSheet>> = {}) {
  const onSave = jest.fn()
  const onClose = jest.fn()
  render(<MassSheet month={month} existing={[]} onSave={onSave} onClose={onClose} {...props} />)
  return { onSave, onClose }
}
const pickDate = (d: string) => fireEvent.change(screen.getByLabelText("Dia"), { target: { value: d } })
const role = (name: string) => screen.getByRole("checkbox", { name })
const checked = () => screen.getAllByRole("checkbox").filter((c) => (c as HTMLInputElement).checked && /^(C|1L|2L|L|P) /.test(c.getAttribute("aria-label") ?? ""))

test("sunday pre-marks C, 1L, 2L, P", () => {
  setup()
  pickDate("2026-12-06")
  expect(role("C - Comentarista")).toBeChecked()
  expect(role("1L - 1ª Leitura")).toBeChecked()
  expect(role("2L - 2ª Leitura")).toBeChecked()
  expect(role("P - Preces")).toBeChecked()
  expect(role("L - Leitura única")).not.toBeChecked()
})

test("tuesday and friday pre-mark C and L", () => {
  setup()
  pickDate("2026-12-08")
  expect(role("C - Comentarista")).toBeChecked()
  expect(role("L - Leitura única")).toBeChecked()
  expect(role("1L - 1ª Leitura")).not.toBeChecked()
  pickDate("2026-12-11")
  expect(role("L - Leitura única")).toBeChecked()
  expect(role("P - Preces")).not.toBeChecked()
})

test("marking L unmarks 1L/2L and vice versa", async () => {
  setup()
  pickDate("2026-12-06")
  await userEvent.click(role("L - Leitura única"))
  expect(role("L - Leitura única")).toBeChecked()
  expect(role("1L - 1ª Leitura")).not.toBeChecked()
  expect(role("2L - 2ª Leitura")).not.toBeChecked()
  await userEvent.click(role("2L - 2ª Leitura"))
  expect(role("L - Leitura única")).not.toBeChecked()
  expect(role("2L - 2ª Leitura")).toBeChecked()
  expect(checked().length).toBe(3) // C, 2L, P
})

test("time shortcuts and Outro (roller)", async () => {
  const { onSave } = setup()
  pickDate("2026-12-08")
  await userEvent.click(screen.getByRole("button", { name: "11:00" }))
  await userEvent.click(screen.getByRole("button", { name: "Salvar missa" }))
  expect(onSave.mock.calls[0][0][0]).toMatchObject({ date: "2026-12-08", time: "11:00", key: "2026-12-08_11:00" })
  await userEvent.click(screen.getByRole("button", { name: "Outro" }))
  await userEvent.click(screen.getByRole("button", { name: "Aumentar hora" }))
  expect(screen.getByText("12")).toBeInTheDocument()
})

test("repeat on all sundays creates one mass per sunday", async () => {
  const { onSave } = setup()
  pickDate("2026-12-06")
  await userEvent.click(screen.getByRole("button", { name: "09:00" }))
  await userEvent.click(screen.getByRole("checkbox", { name: "Repetir em todos os domingos do mês" }))
  await userEvent.click(screen.getByRole("button", { name: "Salvar 4 missas" }))
  const saved: PlanMass[] = onSave.mock.calls[0][0]
  expect(saved.map((m) => m.date)).toEqual(["2026-12-06", "2026-12-13", "2026-12-20", "2026-12-27"])
  expect(saved.every((m) => m.time === "09:00" && m.slots.map((s) => s.role).join() === "C,1L,2L,P")).toBe(true)
})

test("repeated date and time shows error and does not save", async () => {
  const { onSave } = setup({ existing: [{ date: "2026-12-13", time: "09:00" }] })
  pickDate("2026-12-06")
  await userEvent.click(screen.getByRole("button", { name: "09:00" }))
  await userEvent.click(screen.getByRole("checkbox", { name: "Repetir em todos os domingos do mês" }))
  expect(screen.getByRole("alert")).toHaveTextContent("13/12")
  await userEvent.click(screen.getByRole("button", { name: /Salvar/ }))
  expect(onSave).not.toHaveBeenCalled()
})

test("editing keeps filled readers for remaining roles and drops unchecked ones", async () => {
  const mass: PlanMass = {
    key: "m1", id: "m1", date: "2026-12-06", time: "09:00", description: "", wasPublished: false, readOnly: false,
    slots: [
      { id: "s1", role: "C", profileId: "p1", locked: true },
      { id: "s2", role: "1L", profileId: "p2", locked: false },
      { id: "s3", role: "2L", profileId: "p3", locked: false },
      { role: "P", profileId: "", locked: false },
    ],
  }
  const onRemove = jest.fn()
  const { onSave } = setup({ mass, onRemove })
  await userEvent.click(role("2L - 2ª Leitura"))
  await userEvent.click(role("P - Preces"))
  await userEvent.click(screen.getByRole("button", { name: "Salvar missa" }))
  const [saved] = onSave.mock.calls[0][0] as PlanMass[]
  expect(saved.key).toBe("m1")
  expect(saved.slots).toEqual([
    { id: "s1", role: "C", profileId: "p1", locked: true },
    { id: "s2", role: "1L", profileId: "p2", locked: false },
  ])
  await userEvent.click(screen.getByRole("button", { name: "Remover missa" }))
  expect(onRemove).toHaveBeenCalled()
})

const base = (key: string, date: string, time: string): PlanMass => ({
  key, date, time, description: "", wasPublished: false, readOnly: false, slots: [{ role: "C", profileId: "", locked: false }],
})

test("editing a mass keeping its own time does not conflict with itself, but another mass at the same date+time does", async () => {
  const mine = base("m1", "2026-12-08", "19:00")
  const other = base("m2", "2026-12-09", "19:00")
  const plan = [mine, other]
  const { onSave } = setup({ mass: mine, existing: otherMassTimes(plan, "m1") })
  expect(screen.queryByRole("alert")).toBeNull()
  await userEvent.click(screen.getByRole("button", { name: "Salvar missa" }))
  expect(onSave).toHaveBeenCalledTimes(1)
})

test("editing onto another mass's date+time shows the conflict and blocks saving", async () => {
  const mine = base("m1", "2026-12-08", "19:00")
  const other = base("m2", "2026-12-09", "19:00")
  const { onSave } = setup({ mass: mine, existing: otherMassTimes([mine, other], "m1") })
  pickDate("2026-12-09")
  expect(screen.getByRole("alert")).toHaveTextContent("09/12")
  expect(screen.getByRole("button", { name: "Salvar missa" })).toBeDisabled()
  expect(onSave).not.toHaveBeenCalled()
})

test("save is blocked with zero roles", async () => {
  const { onSave } = setup()
  pickDate("2026-12-08")
  await userEvent.click(role("C - Comentarista"))
  await userEvent.click(role("L - Leitura única"))
  expect(screen.getByRole("button", { name: "Salvar missa" })).toBeDisabled()
  await userEvent.click(screen.getByRole("button", { name: "Salvar missa" }))
  expect(onSave).not.toHaveBeenCalled()
})

test("Repetir is disabled on non-Sundays and enabled on Sundays", () => {
  setup()
  pickDate("2026-12-08")
  expect(screen.getByRole("checkbox", { name: "Repetir em todos os domingos do mês" })).toBeDisabled()
  pickDate("2026-12-06")
  expect(screen.getByRole("checkbox", { name: "Repetir em todos os domingos do mês" })).toBeEnabled()
})

test("a 5-Sunday month (nov/2026) generates 5 masses", async () => {
  const { onSave } = setup({ month: new Date(2026, 10, 1) })
  pickDate("2026-11-01")
  await userEvent.click(screen.getByRole("checkbox", { name: "Repetir em todos os domingos do mês" }))
  await userEvent.click(screen.getByRole("button", { name: "Salvar 5 missas" }))
  expect((onSave.mock.calls[0][0] as PlanMass[]).map((m) => m.date)).toEqual(["2026-11-01", "2026-11-08", "2026-11-15", "2026-11-22", "2026-11-29"])
})

test("editing date and time sends the new values", async () => {
  const mine = base("m1", "2026-12-08", "19:00")
  const { onSave } = setup({ mass: mine })
  pickDate("2026-12-15")
  await userEvent.click(screen.getByRole("button", { name: "07:00" }))
  await userEvent.click(screen.getByRole("button", { name: "Salvar missa" }))
  expect(onSave.mock.calls[0][0][0]).toMatchObject({ key: "m1", date: "2026-12-15", time: "07:00" })
})

test("a custom time from Outro reaches onSave", async () => {
  const { onSave } = setup()
  pickDate("2026-12-08")
  await userEvent.click(screen.getByRole("button", { name: "Outro" }))
  await userEvent.click(screen.getByRole("button", { name: "Aumentar hora" })) // 19 -> 20
  await userEvent.click(screen.getByRole("button", { name: "Aumentar minutos" })) // 00 -> 10
  await userEvent.click(screen.getByRole("button", { name: "Salvar missa" }))
  expect(onSave.mock.calls[0][0][0]).toMatchObject({ time: "20:10", key: "2026-12-08_20:10" })
})

test("a date typed outside the month shows an error and cannot be saved", async () => {
  const { onSave } = setup()
  pickDate("2026-11-30")
  expect(screen.getByRole("alert")).toHaveTextContent("A data precisa estar neste mês (01/12 a 31/12).")
  expect(screen.getByLabelText("Dia")).toBeInvalid()
  expect(screen.getByRole("button", { name: "Salvar missa" })).toBeDisabled()
  await userEvent.click(screen.getByRole("button", { name: "Salvar missa" }))
  expect(onSave).not.toHaveBeenCalled()

  pickDate("2027-01-01")
  expect(screen.getByRole("button", { name: "Salvar missa" })).toBeDisabled()

  pickDate("2026-12-31")
  expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Salvar missa" })).toBeEnabled()
  await userEvent.click(screen.getByRole("button", { name: "Salvar missa" }))
  expect(onSave.mock.calls[0][0][0]).toMatchObject({ date: "2026-12-31" })
})
