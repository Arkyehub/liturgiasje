"use client"

import { useRef } from "react"

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/shared/ui/dialog"

interface ConfirmDialogProps {
  title: string
  message: string
  confirmLabel: string
  cancelLabel: string
  /** "danger" pinta a confirmação de vermelho (descartar). */
  tone?: "default" | "danger"
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Confirmação antes de uma ação que os leitores sentem ou que descarta trabalho.
 * Usa o Dialog compartilhado: foco entra no diálogo (na ação segura, "Cancelar"),
 * fica preso nele, Esc cancela e o foco volta a quem abriu.
 */
export function ConfirmDialog({ title, message, confirmLabel, cancelLabel, tone = "default", onConfirm, onCancel }: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()} disablePointerDismissal>
      <DialogContent
        role="alertdialog"
        showCloseButton={false}
        initialFocus={cancelRef}
        className="z-[60] max-w-md gap-0 rounded-3xl border border-stone-100 bg-white p-5 shadow-xl ring-0 sm:max-w-md"
      >
        <DialogTitle className="text-lg font-black leading-normal tracking-tight text-stone-800">{title}</DialogTitle>
        <DialogDescription className="mt-2 text-[15px] font-medium leading-snug text-stone-700">{message}</DialogDescription>
        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={onConfirm}
            className={`min-h-12 rounded-2xl px-4 text-[15px] font-bold text-white transition-transform active:scale-95 ${tone === "danger" ? "bg-red-600" : "bg-stone-800"}`}
          >
            {confirmLabel}
          </button>
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="min-h-12 rounded-2xl border border-stone-200 bg-white px-4 text-[15px] font-bold text-stone-700 transition-transform active:scale-95"
          >
            {cancelLabel}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
