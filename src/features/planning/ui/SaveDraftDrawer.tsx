"use client"

import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/shared/ui/drawer"

interface SaveDraftDrawerProps {
  /** Nome do mês com inicial maiúscula (ex.: "Dezembro"). */
  monthLabel: string
  /** Rascunhos existentes que serão substituídos (0 = nada a substituir). */
  replacementCount: number
  /** Datas dos rascunhos a substituir, já formatadas (ex.: "06/12, 13/12"). */
  replacementDates: string
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Gaveta de confirmação de "Salvar como rascunho" (evita toque errado). Sempre aparece; quando há rascunhos a
 * substituir, o aviso das datas vem na mesma gaveta, num único passo.
 */
export function SaveDraftDrawer({ monthLabel, replacementCount, replacementDates, onConfirm, onCancel }: SaveDraftDrawerProps) {
  const replacing = replacementCount > 0
  return (
    <Drawer open onOpenChange={(open) => !open && onCancel()}>
      <DrawerContent>
        <div className="mx-auto w-full max-w-sm">
          <DrawerHeader className="text-center">
            <DrawerTitle className="text-stone-800">{replacing ? "Substituir o rascunho existente?" : "Salvar como rascunho?"}</DrawerTitle>
            <DrawerDescription className="text-[15px] font-medium leading-snug text-stone-700">
              {replacing
                ? `Já existe uma escala em rascunho em ${monthLabel} (${replacementCount} ${replacementCount === 1 ? "missa" : "missas"}: ${replacementDates}). Salvar vai substituir essas missas pelas deste planejamento. Missas publicadas não serão tocadas.`
                : `A escala de ${monthLabel} será gravada como rascunho, sem publicar. Missas publicadas não serão tocadas.`}
            </DrawerDescription>
          </DrawerHeader>
          <DrawerFooter className="flex flex-col gap-2 pb-8">
            <button
              type="button"
              onClick={onConfirm}
              className={`min-h-12 rounded-2xl px-4 text-[15px] font-bold text-white transition-transform active:scale-95 ${replacing ? "bg-red-600" : "bg-stone-800"}`}
            >
              {replacing ? "Substituir e salvar" : "Salvar como rascunho"}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="min-h-12 rounded-2xl border border-stone-200 bg-white px-4 text-[15px] font-bold text-stone-700 transition-transform active:scale-95"
            >
              Cancelar
            </button>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
