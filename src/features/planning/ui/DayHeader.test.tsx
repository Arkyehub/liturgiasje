import { render, screen } from "@testing-library/react"
import { DayHeader, weekdayName } from "./DayHeader"

test("weekdayName gives the full name without '-feira'", () => {
  // 6 a 12 de dezembro de 2026: domingo a sábado
  expect(["06", "07", "08", "09", "10", "11", "12"].map((d) => weekdayName(`2026-12-${d}`))).toEqual([
    "Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado",
  ])
})

test("the day band is a single line: day number and weekday name", () => {
  const { container } = render(<DayHeader date="2026-12-08" />)
  expect(container.querySelector("[data-day-header='2026-12-08']")).toHaveTextContent("08Terça")
  expect(screen.getByText("08")).toBeInTheDocument()
  expect(screen.getByText("Terça")).toBeInTheDocument()
})
