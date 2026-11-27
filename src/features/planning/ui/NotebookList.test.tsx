import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { NotebookList } from "./NotebookList"
import type { PlanMass } from "../lib/types"

const mass = (key: string, extra: Partial<PlanMass> = {}): PlanMass => ({
  key,
  date: "2026-12-08",
  time: "19:00",
  description: "",
  wasPublished: false,
  readOnly: false,
  slots: [{ role: "C", profileId: "", locked: false }, { role: "L", profileId: "", locked: false }],
  ...extra,
})

test("tapping an editable row reports its key; a read-only row cannot be tapped", async () => {
  const onSelect = jest.fn()
  render(
    <NotebookList
      masses={[mass("a", { description: "Imaculada Conceição" }), mass("b", { time: "20:00", wasPublished: true, readOnly: true })]}
      onSelectMass={onSelect}
    />,
  )
  expect(screen.getByText("Imaculada Conceição")).toBeInTheDocument()
  await userEvent.click(screen.getByRole("button", { name: "Missa de 08/12 às 19:00" }))
  expect(onSelect).toHaveBeenCalledWith("a")
  const readOnly = screen.getByRole("button", { name: /Missa de 08\/12 às 20:00/ })
  expect(readOnly).toBeDisabled()
  await userEvent.click(readOnly)
  expect(onSelect).toHaveBeenCalledTimes(1)
})

test("without onSelectMass (read-only plan) every row is disabled", () => {
  render(<NotebookList masses={[mass("a"), mass("b", { time: "20:00" })]} />)
  screen.getAllByRole("button").forEach((b) => expect(b).toBeDisabled())
})

test("a mass that already exists as a draft in the system is orange and tagged; a new or published one is not", () => {
  render(
    <NotebookList
      masses={[
        mass("new"),
        mass("draft", { id: "m1", time: "20:00", slots: [{ role: "C", profileId: "p1", locked: true }] }),
        mass("pub", { id: "m2", time: "21:00", wasPublished: true, readOnly: true }),
      ]}
      onSelectMass={jest.fn()}
    />,
  )
  const rows = screen.getAllByRole("listitem")
  expect(rows[0]).not.toHaveAttribute("data-existing-draft")
  expect(rows[1]).toHaveAttribute("data-existing-draft", "true")
  expect(rows[1]).toHaveClass("bg-orange-100")
  expect(rows[1]).toHaveTextContent("rascunho")
  expect(screen.getByRole("button", { name: "Missa de 08/12 às 20:00 (já em rascunho)" })).toBeInTheDocument()
  expect(rows[2]).not.toHaveAttribute("data-existing-draft")
  expect(rows[2]).toHaveTextContent("publicada")
})
