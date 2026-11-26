import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"

import { PublishedNotice } from "./PublishedNotice"

function setupNew(count = 2, dates = ["05/12", "12/12"]) {
  const onAcknowledge = jest.fn()
  function Harness() {
    const [open, setOpen] = useState(false)
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          Abrir
        </button>
        {open && (
          <PublishedNotice
            count={count}
            monthName="dezembro"
            dates={dates}
            onAcknowledge={() => {
              onAcknowledge()
              setOpen(false)
            }}
          />
        )}
      </>
    )
  }
  render(<Harness />)
  return { onAcknowledge }
}

describe("PublishedNotice (informativo)", () => {
  it("mostra o texto exato no plural com as datas e um único botão Entendi em foco", async () => {
    setupNew()
    await userEvent.click(screen.getByRole("button", { name: "Abrir" }))
    const dialog = await screen.findByRole("alertdialog")
    expect(dialog).toHaveTextContent(
      "Já existem 2 missas publicadas em dezembro (05/12, 12/12). Elas não podem ser alteradas no planejamento. Para mexer nelas, transforme-as em rascunho na tela de Escala."
    )
    const entendi = screen.getByRole("button", { name: "Entendi" })
    await waitFor(() => expect(entendi).toHaveFocus())
    expect(within(dialog).getAllByRole("button").filter((b) => b.tagName === "BUTTON")).toHaveLength(1)
  })

  it("usa o singular para 1 missa", async () => {
    setupNew(1, ["05/12"])
    await userEvent.click(screen.getByRole("button", { name: "Abrir" }))
    expect(await screen.findByRole("alertdialog")).toHaveTextContent(
      "Já existe 1 missa publicada em dezembro (05/12). Ela não pode ser alterada no planejamento. Para mexer nela, transforme-a em rascunho na tela de Escala."
    )
  })

  it("Entendi chama onAcknowledge", async () => {
    const { onAcknowledge } = setupNew()
    await userEvent.click(screen.getByRole("button", { name: "Abrir" }))
    await userEvent.click(await screen.findByRole("button", { name: "Entendi" }))
    expect(onAcknowledge).toHaveBeenCalledTimes(1)
  })

  it("Escape também reconhece e o foco volta a quem abriu", async () => {
    const { onAcknowledge } = setupNew()
    await userEvent.click(screen.getByRole("button", { name: "Abrir" }))
    await screen.findByRole("alertdialog")
    await userEvent.keyboard("{Escape}")
    expect(onAcknowledge).toHaveBeenCalledTimes(1)
    expect(screen.getByRole("button", { name: "Abrir" })).toHaveFocus()
  })

  it("clicar fora não fecha", async () => {
    const { onAcknowledge } = setupNew()
    await userEvent.click(screen.getByRole("button", { name: "Abrir" }))
    await screen.findByRole("alertdialog")
    await userEvent.click(document.querySelector('[data-slot="dialog-overlay"]') as HTMLElement)
    expect(screen.getByRole("alertdialog")).toBeInTheDocument()
    expect(onAcknowledge).not.toHaveBeenCalled()
  })
})
