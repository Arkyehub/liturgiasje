"use client"

export type SaveIndicatorStatus = "idle" | "saving" | "saved" | "failed"

interface SaveIndicatorProps {
  status: SaveIndicatorStatus
  onRetry?: () => void
}

/** Estado da gravação automática. A região é sempre montada para que leitores de tela anunciem as mudanças. */
export function SaveIndicator({ status, onRetry }: SaveIndicatorProps) {
  return (
    <div aria-live="polite" className="flex min-h-6 items-center text-xs font-bold">
      {status === "saving" && <span className="text-stone-500">Salvando…</span>}
      {status === "saved" && <span className="text-emerald-700">Salvo</span>}
      {status === "failed" && (
        <button
          type="button"
          onClick={onRetry}
          className="min-h-11 rounded-xl px-3 text-xs font-bold text-red-700 underline underline-offset-2 active:scale-95"
        >
          Falhou — tentar de novo
        </button>
      )}
    </div>
  )
}
