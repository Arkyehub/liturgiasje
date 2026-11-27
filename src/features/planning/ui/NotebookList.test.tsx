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
  expect(rows[1]).toHaveClass("bg-orange-50")
  expect(rows[1]).toHaveTextContent("RASC")
  expect(rows[1]).toHaveTextContent("Em rascunho")
  expect(screen.getByRole("button", { name: "Missa de 08/12 às 20:00 (já em rascunho)" })).toBeInTheDocument()
  expect(rows[2]).not.toHaveAttribute("data-existing-draft")
  expect(rows[2]).toHaveClass("bg-green-50")
  expect(rows[2]).toHaveTextContent("PUBL")
  expect(rows[2]).toHaveTextContent("Publicada")
})

test("the date opens each day in a single band; the time is on the left with the tag below it", () => {
  const { container } = render(
    <NotebookList
      masses={[
        mass("a", { time: "07:00", id: "m1", slots: [{ role: "C", profileId: "p1", locked: true }] }),
        mass("b", { time: "09:00", wasPublished: true, readOnly: true }),
        mass("c", { date: "2026-12-13", time: "19:00" }),
      ]}
      onSelectMass={jest.fn()}
    />,
  )
  const headers = Array.from(container.querySelectorAll("[data-day-header]"))
  expect(headers.map((h) => h.textContent)).toEqual(["08Terça", "13Domingo"])
  const rows = screen.getAllByRole("listitem")
  expect(rows).toHaveLength(3) // as faixas não contam como itens da lista
  const draftRow = screen.getByRole("button", { name: /às 07:00/ })
  expect(draftRow).toHaveTextContent("07:00")
  expect(draftRow).toHaveTextContent("RASC")
  expect(screen.getByRole("button", { name: /às 09:00/ })).toHaveTextContent("PUBL")
  expect(screen.getByRole("button", { name: /às 19:00/ })).not.toHaveTextContent(/RASC|PUBL/)
})
