import { within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

/** Leva um TimeRoller (dentro de `group`) até "HH:mm" clicando nos botões de hora e de minutos (passos de 10). */
export async function rollTo(group: HTMLElement, target: string) {
  const read = () => {
    const [h, m] = (group.textContent ?? "").match(/\d{2}/g) ?? ["07", "00"]
    return [Number(h), Number(m)] as const
  }
  const [th, tm] = target.split(":").map(Number)
  const [h0, m0] = read()
  const hourSteps = (th - h0 + 24) % 24
  const up = hourSteps <= 12
  for (let i = 0; i < (up ? hourSteps : 24 - hourSteps); i++) {
    await userEvent.click(within(group).getByRole("button", { name: up ? "Aumentar hora" : "Diminuir hora" }))
  }
  const minSteps = (((tm - m0) / 10) % 6 + 6) % 6
  const minUp = minSteps <= 3
  for (let i = 0; i < (minUp ? minSteps : 6 - minSteps); i++) {
    await userEvent.click(within(group).getByRole("button", { name: minUp ? "Aumentar minutos" : "Diminuir minutos" }))
  }
}
