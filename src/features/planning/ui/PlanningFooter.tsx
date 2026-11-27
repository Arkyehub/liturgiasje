"use client"

import { Lightbulb } from "lucide-react"

interface PlanningFooterProps {
  emptySlots: number
  /** Lâmpada (Task 10). Sem callback, o botão fica desabilitado. */
  onLamp?: () => void
}

export function PlanningFooter({ emptySlots, onLamp }: PlanningFooterProps) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-stone-200 bg-white pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex max-w-md items-center gap-3 px-4 py-3.5">
        <div className="flex flex-1 flex-col">
          <span className="text-[13px] font-extrabold text-stone-900">
            {emptySlots === 1 ? "1 vaga sem leitor" : `${emptySlots} vagas sem leitor`}
          </span>
          <span className="text-xs text-stone-600">Toque na lâmpada para sugerir</span>
        </div>
        <button
          type="button"
          aria-label="Sugerir escala"
          onClick={onLamp}
          disabled={!onLamp}
          className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-600 shadow-[0_8px_24px_rgba(217,119,6,0.35)] transition-transform active:scale-95 disabled:opacity-60 disabled:active:scale-100"
        >
          <Lightbulb className="h-[30px] w-[30px] text-white" />
        </button>
      </div>
    </div>
  )
}
