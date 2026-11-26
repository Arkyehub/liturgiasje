import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"

import { PublishedNotice } from "./PublishedNotice"

function setup(count = 2) {
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
          <PublishedNotice
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

it("move o foco para a opção segura (Manter somente leitura) e expõe nome e descrição", async () => {
  setup()
  await userEvent.click(screen.getByRole("button", { name: "Abrir" }))
  const dialog = await screen.findByRole("alertdialog", { name: "Missas publicadas" })
  expect(dialog).toHaveAccessibleDescription(/lembretes automáticos param/)
  expect(screen.getByRole("button", { name: "Manter somente leitura" })).toHaveFocus()
})

it("mantém o foco preso no diálogo e a página fica inerte", async () => {
  setup()
  await userEvent.click(screen.getByRole("button", { name: "Abrir" }))
  await screen.findByRole("alertdialog")
  const opener = screen.getByRole("button", { name: "Abrir", hidden: true })
  expect(screen.queryByRole("button", { name: "Abrir" })).not.toBeInTheDocument()
  // Shift+Tab a partir da opção segura percorre só o conteúdo do diálogo (o salto da sentinela de volta ao
  // fim depende de eventos de foco reais do navegador e não é reproduzido pelo jsdom).
  for (let i = 0; i < 2; i++) {
    await userEvent.tab({ shift: true })
    expect(document.activeElement).not.toBe(opener)
  }
})

it("Escape escolhe a opção segura, nunca incluir; o foco volta a quem abriu", async () => {
  const { onInclude, onKeep } = setup()
  await userEvent.click(screen.getByRole("button", { name: "Abrir" }))
  await screen.findByRole("alertdialog")
  await userEvent.keyboard("{Escape}")
  expect(onKeep).toHaveBeenCalledTimes(1)
  expect(onInclude).not.toHaveBeenCalled()
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Abrir" })).toHaveFocus()
})

it("clicar fora não fecha nem decide", async () => {
  const { onInclude, onKeep } = setup()
  await userEvent.click(screen.getByRole("button", { name: "Abrir" }))
  await screen.findByRole("alertdialog")
  await userEvent.click(document.body)
  const backdrop = document.querySelector('[data-slot="dialog-overlay"]') as HTMLElement
  await userEvent.click(backdrop)
  expect(screen.getByRole("alertdialog")).toBeInTheDocument()
  expect(onInclude).not.toHaveBeenCalled()
  expect(onKeep).not.toHaveBeenCalled()
})

it("os botões chamam seus callbacks e o singular usa o texto do singular", async () => {
  const { onInclude, onKeep } = setup(1)
  await userEvent.click(screen.getByRole("button", { name: "Abrir" }))
  expect(await screen.findByText(/Existe 1 missa publicada em dezembro/)).toBeInTheDocument()
  await userEvent.click(screen.getByRole("button", { name: "Incluir no planejamento" }))
  expect(onInclude).toHaveBeenCalledTimes(1)
  expect(onKeep).not.toHaveBeenCalled()
})
