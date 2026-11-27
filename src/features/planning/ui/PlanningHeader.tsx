"use client"

import { CalendarDays, Plus, Settings } from "lucide-react"

interface PlanningHeaderProps {
  monthLabel: string // ex.: "Dezembro 2026"
  massCount: number
  slotCount: number
  readerCount: number
  /** Volta à lista de planejamentos. */
  onChangePlan: () => void
  /** Impede trocar agora (gravando ou preparando a gravação). */
  changeDisabled?: boolean
  onCreateDefaults: () => void
  /** "Criar Missas Padrões" só vale com a lista em branco e ao menos uma missa padrão configurada. */
  createDefaultsDisabled?: boolean
  /** Por que o botão de padrões está desabilitado (mostra uma dica embaixo). */
  createDefaultsHint?: "no-standard" | "not-empty" | null
  /** Abre o painel de configurações (engrenagem); sem callback, a engrenagem não aparece. */
  onOpenSettings?: () => void
  onAddMass?: () => void
  /** Desabilita as ações que criam missas (carregando ou leitura com erro). */
  actionsDisabled?: boolean
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

const linkClass =
  "flex min-h-11 items-center gap-1.5 text-[13px] font-bold text-stone-900 underline decoration-stone-300 underline-offset-4 transition-colors active:text-stone-600 disabled:opacity-50"

export function PlanningHeader({
  monthLabel,
  massCount,
  slotCount,
  readerCount,
  onChangePlan,
  changeDisabled = false,
  onCreateDefaults,
  createDefaultsDisabled = false,
  createDefaultsHint = null,
  onOpenSettings,
  onAddMass,
  actionsDisabled = false,
}: PlanningHeaderProps) {
  return (
    <header className="flex flex-col gap-2 px-4 pb-2 pt-4">
      <h1 className="text-xl font-black tracking-tight text-stone-900">Planejamento de Escala</h1>
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col">
          <span className="text-[22px] font-black tracking-tight text-stone-900">{monthLabel}</span>
          <span className="text-xs text-stone-600">
            {`${plural(massCount, "missa", "missas")} · ${plural(slotCount, "vaga", "vagas")} · ${plural(readerCount, "leitor apto", "leitores aptos")}`}
          </span>
        </div>
        <button
          type="button"
          onClick={onChangePlan}
          disabled={changeDisabled}
          className="min-h-11 shrink-0 rounded-2xl border border-stone-200 bg-white px-4 text-sm font-bold text-stone-700 transition-transform active:scale-95 disabled:opacity-50 disabled:active:scale-100"
        >
          Trocar planejamento
        </button>
      </div>
      <div className="flex justify-center gap-4">
        <button type="button" onClick={onCreateDefaults} disabled={actionsDisabled || createDefaultsDisabled} className={linkClass}>
          <CalendarDays className="h-4 w-4" />
          Criar Missas Padrões no mês
        </button>
        <button type="button" onClick={onAddMass} disabled={actionsDisabled || !onAddMass} aria-label="Adicionar missa" className={linkClass}>
          <Plus className="h-4 w-4" />
          Missa
        </button>
        {onOpenSettings && (
          <button type="button" onClick={onOpenSettings} aria-label="Configurações do planejamento" className={linkClass}>
            <Settings aria-hidden="true" className="h-4 w-4" />
          </button>
        )}
      </div>
      {createDefaultsHint === "no-standard" && (
        <p className="text-center text-xs text-stone-600">
          {onOpenSettings ? (
            <button type="button" onClick={onOpenSettings} className="font-bold text-amber-700 underline underline-offset-4">
              Defina suas missas padrão na engrenagem
            </button>
          ) : (
            "Defina suas missas padrão na engrenagem"
          )}
        </p>
      )}
      {createDefaultsHint === "not-empty" && <p className="text-center text-xs text-stone-600">Disponível só com a lista em branco</p>}
    </header>
  )
}
