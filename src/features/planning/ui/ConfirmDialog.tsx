"use client"

import { useId } from "react"

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

/** Confirmação antes de uma ação que os leitores sentem ou que descarta trabalho. */
export function ConfirmDialog({ title, message, confirmLabel, cancelLabel, tone = "default", onConfirm, onCancel }: ConfirmDialogProps) {
  const titleId = useId()
  const descId = useId()
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-stone-900/40 p-4 animate-in fade-in duration-200 sm:items-center">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="w-full max-w-md rounded-3xl border border-stone-100 bg-white p-5 shadow-xl animate-in slide-in-from-bottom-4 duration-200"
      >
        <h2 id={titleId} className="text-lg font-black tracking-tight text-stone-800">
          {title}
        </h2>
        <p id={descId} className="mt-2 text-[15px] font-medium leading-snug text-stone-700">
          {message}
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={onConfirm}
            className={`min-h-12 rounded-2xl px-4 text-[15px] font-bold text-white transition-transform active:scale-95 ${tone === "danger" ? "bg-red-600" : "bg-stone-800"}`}
          >
            {confirmLabel}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="min-h-12 rounded-2xl border border-stone-200 bg-white px-4 text-[15px] font-bold text-stone-700 transition-transform active:scale-95"
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
