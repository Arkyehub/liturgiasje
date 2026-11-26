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
