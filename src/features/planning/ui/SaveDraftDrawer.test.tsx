import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { SaveDraftDrawer } from "./SaveDraftDrawer"

// Gaveta simplificada: o vaul precisa de APIs do navegador que o jsdom não tem.
jest.mock("@/shared/ui/drawer", () => ({
  Drawer: ({ open, children }: { open?: boolean; children: React.ReactNode }) => (open ? <div role="dialog">{children}</div> : null),
  DrawerContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DrawerHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DrawerFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DrawerTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DrawerDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
}))

function setup(replacementCount = 0, replacementDates = "") {
  const onConfirm = jest.fn()
  const onCancel = jest.fn()
  render(
    <SaveDraftDrawer monthLabel="Dezembro" replacementCount={replacementCount} replacementDates={replacementDates} onConfirm={onConfirm} onCancel={onCancel} />,
  )
  return { onConfirm, onCancel }
}

it("sem rascunhos a substituir: pergunta se quer salvar como rascunho", async () => {
  const { onConfirm, onCancel } = setup()
  expect(screen.getByText("Salvar como rascunho?")).toBeInTheDocument()
  expect(screen.getByText(/A escala de Dezembro será gravada como rascunho, sem publicar\./)).toBeInTheDocument()
  await userEvent.click(screen.getByRole("button", { name: "Cancelar" }))
  expect(onCancel).toHaveBeenCalledTimes(1)
  expect(onConfirm).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole("button", { name: "Salvar como rascunho" }))
  expect(onConfirm).toHaveBeenCalledTimes(1)
})

it("com rascunhos a substituir: o aviso das datas vem na mesma gaveta", async () => {
  const { onConfirm } = setup(2, "06/12, 13/12")
  expect(screen.getByText("Substituir o rascunho existente?")).toBeInTheDocument()
  expect(
    screen.getByText(
      "Já existe uma escala em rascunho em Dezembro (2 missas: 06/12, 13/12). Salvar vai substituir essas missas pelas deste planejamento. Missas publicadas não serão tocadas.",
    ),
  ).toBeInTheDocument()
  await userEvent.click(screen.getByRole("button", { name: "Substituir e salvar" }))
  expect(onConfirm).toHaveBeenCalledTimes(1)
})
