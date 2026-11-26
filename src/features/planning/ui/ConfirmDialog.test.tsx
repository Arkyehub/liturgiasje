import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"

import { ConfirmDialog } from "./ConfirmDialog"

function setup() {
  const onConfirm = jest.fn()
  const onCancel = jest.fn()
  function Harness() {
    const [open, setOpen] = useState(false)
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          Abrir
        </button>
        {open && (
          <ConfirmDialog
            title="Salvar como rascunho?"
            message="Missas publicadas voltarão a rascunho."
            confirmLabel="Salvar"
            cancelLabel="Cancelar"
            onConfirm={onConfirm}
            onCancel={() => {
              onCancel()
              setOpen(false)
            }}
          />
        )}
      </>
    )
  }
  render(<Harness />)
  return { onConfirm, onCancel }
}

it("move o foco para a ação segura (Cancelar) ao abrir", async () => {
  setup()
  await userEvent.click(screen.getByRole("button", { name: "Abrir" }))
  const dialog = await screen.findByRole("alertdialog", { name: "Salvar como rascunho?" })
  expect(dialog).toHaveAccessibleDescription("Missas publicadas voltarão a rascunho.")
  expect(screen.getByRole("button", { name: "Cancelar" })).toHaveFocus()
})

it("mantém o foco preso no diálogo ao tabular", async () => {
  setup()
  await userEvent.click(screen.getByRole("button", { name: "Abrir" }))
  await screen.findByRole("alertdialog")
  const opener = screen.getByRole("button", { name: "Abrir", hidden: true })
  // A página fica fora da árvore de acessibilidade (inerte) enquanto o diálogo está aberto.
  expect(screen.queryByRole("button", { name: "Abrir" })).not.toBeInTheDocument()
  // Do foco inicial até o fim do diálogo, o Tab passa só pelos botões e pelas sentinelas do primitivo,
  // nunca pela página. (O salto da última sentinela de volta ao início depende de eventos de foco reais
  // do navegador e não é reproduzido pelo jsdom, por isso o laço para antes.)
  for (let i = 0; i < 4; i++) {
    await userEvent.tab()
    expect(document.activeElement).not.toBe(opener)
  }
})

it("Escape cancela e não confirma; o foco volta ao botão que abriu", async () => {
  const { onConfirm, onCancel } = setup()
  await userEvent.click(screen.getByRole("button", { name: "Abrir" }))
  await screen.findByRole("alertdialog")
  await userEvent.keyboard("{Escape}")
  expect(onCancel).toHaveBeenCalledTimes(1)
  expect(onConfirm).not.toHaveBeenCalled()
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Abrir" })).toHaveFocus()
})

it("os botões chamam seus callbacks", async () => {
  const { onConfirm, onCancel } = setup()
  await userEvent.click(screen.getByRole("button", { name: "Abrir" }))
  await userEvent.click(await screen.findByRole("button", { name: "Salvar" }))
  expect(onConfirm).toHaveBeenCalledTimes(1)
  expect(onCancel).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole("button", { name: "Cancelar" }))
  expect(onCancel).toHaveBeenCalledTimes(1)
})
