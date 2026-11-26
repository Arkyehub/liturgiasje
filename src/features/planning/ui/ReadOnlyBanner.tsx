"use client"

import { formatDistanceToNowStrict } from "date-fns"
import { ptBR } from "date-fns/locale"

export type ReadOnlyReason = "other-owner" | "other-device" | "lost-lock" | "concluded"

interface ReadOnlyBannerProps {
  reason: ReadOnlyReason
  ownerName: string | null
  lastSeen: string | null
  /** Alterações que ficaram de fora ao perder a reserva. */
  lostChanges?: number
  /** Ação do botão: "Editar" (outro aparelho/reserva perdida) ou "Reabrir" (concluído). */
  onReopen?: () => void
}

function ago(iso: string | null) {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return formatDistanceToNowStrict(date, { locale: ptBR, addSuffix: true })
}

/** Faixa fixa que avisa que o planejamento não pode ser editado agora e por quê. */
export function ReadOnlyBanner({ reason, ownerName, lastSeen, lostChanges = 0, onReopen }: ReadOnlyBannerProps) {
  const seen = ago(lastSeen)
  let line: string
  let action: string | null = null
  let extra: string | null = null

  if (reason === "other-owner") {
    line = `Planejamento de ${ownerName ?? "outro coordenador"}${seen ? ` · editado ${seen}` : ""}`
    extra = "Para editar, use Duplicar para mim."
  } else if (reason === "other-device") {
    line = `Aberto em outro aparelho${seen ? ` (última atividade ${seen})` : ""}`
    action = "Editar"
  } else if (reason === "lost-lock") {
    line = "Você perdeu a reserva deste planejamento"
    if (lostChanges > 0) {
      extra = lostChanges === 1 ? "1 alteração não foi salva." : `${lostChanges} alterações não foram salvas.`
    }
    action = "Editar"
  } else {
    line = "Planejamento concluído"
    action = "Reabrir"
  }

  return (
    <div role="status" className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2">
      <div className="min-w-0">
        <p className="text-[11px] font-black uppercase tracking-widest text-amber-700">SOMENTE LEITURA</p>
        <p className="text-sm font-medium leading-snug text-stone-800">{line}</p>
        {extra && <p className="text-xs leading-snug text-stone-600">{extra}</p>}
      </div>
      {action && (
        <button
          type="button"
          onClick={onReopen}
          className="min-h-11 shrink-0 rounded-2xl bg-stone-800 px-4 text-sm font-bold text-white transition-transform active:scale-95"
        >
          {action}
        </button>
      )}
    </div>
  )
}
