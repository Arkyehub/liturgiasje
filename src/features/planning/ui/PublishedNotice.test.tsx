import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"

import { LegacyPublishedNotice, PublishedNotice } from "./PublishedNotice"

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

function setupLegacy(count = 2) {
  const onInclude = jest.fn()
  const onKeep = jest.fn()
  function Harness() {
    const [open, setOpen] = useState(false)
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          Abrir
        </button>
        {open && (
          <LegacyPublishedNotice
            count={count}
            monthName="dezembro"
            onInclude={onInclude}
            onKeep={() => {
              onKeep()
              setOpen(false)
            }}
          />
        )}
      </>
    )
  }
  render(<Harness />)
  return { onInclude, onKeep }
}

describe("LegacyPublishedNotice (removido na Task 7b)", () => {
  it("move o foco para a opção segura e expõe nome e descrição", async () => {
    setupLegacy()
    await userEvent.click(screen.getByRole("button", { name: "Abrir" }))
    const dialog = await screen.findByRole("alertdialog", { name: "Missas publicadas" })
    expect(dialog).toHaveAccessibleDescription(/lembretes automáticos param/)
    await waitFor(() => expect(screen.getByRole("button", { name: "Manter somente leitura" })).toHaveFocus())
  })

  it("Escape escolhe a opção segura, nunca incluir", async () => {
    const { onInclude, onKeep } = setupLegacy()
    await userEvent.click(screen.getByRole("button", { name: "Abrir" }))
    await screen.findByRole("alertdialog")
    await userEvent.keyboard("{Escape}")
    expect(onKeep).toHaveBeenCalledTimes(1)
    expect(onInclude).not.toHaveBeenCalled()
  })

  it("os botões chamam seus callbacks e o singular usa o texto do singular", async () => {
    const { onInclude, onKeep } = setupLegacy(1)
    await userEvent.click(screen.getByRole("button", { name: "Abrir" }))
    expect(await screen.findByText(/Existe 1 missa publicada em dezembro/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Incluir no planejamento" }))
    expect(onInclude).toHaveBeenCalledTimes(1)
    expect(onKeep).not.toHaveBeenCalled()
  })
})
