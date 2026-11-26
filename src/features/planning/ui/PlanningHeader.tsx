"use client"

import { CalendarDays, ChevronLeft, ChevronRight, Plus } from "lucide-react"

interface PlanningHeaderProps {
  monthLabel: string // ex.: "Dezembro 2026"
  massCount: number
  slotCount: number
  readerCount: number
  onPrevMonth: () => void
  onNextMonth: () => void
  onCreateDefaults: () => void
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
  onPrevMonth,
  onNextMonth,
  onCreateDefaults,
  onAddMass,
  actionsDisabled = false,
}: PlanningHeaderProps) {
  return (
    <header className="flex flex-col gap-2 px-4 pb-2 pt-4">
      <h1 className="text-xl font-black tracking-tight text-stone-900">Planejamento de Escala</h1>
      <div className="flex items-center justify-between">
        <button type="button" aria-label="Mês anterior" onClick={onPrevMonth} className="flex h-11 w-11 items-center justify-center rounded-full active:bg-stone-100">
          <ChevronLeft className="h-5 w-5 text-stone-900" />
        </button>
        <div className="flex flex-col items-center">
          <span className="text-[22px] font-black tracking-tight text-stone-900">{monthLabel}</span>
          <span className="text-xs text-stone-600">
            {`${plural(massCount, "missa", "missas")} · ${plural(slotCount, "vaga", "vagas")} · ${plural(readerCount, "leitor apto", "leitores aptos")}`}
          </span>
        </div>
        <button type="button" aria-label="Próximo mês" onClick={onNextMonth} className="flex h-11 w-11 items-center justify-center rounded-full active:bg-stone-100">
          <ChevronRight className="h-5 w-5 text-stone-900" />
        </button>
      </div>
      <div className="flex justify-center gap-4">
        <button type="button" onClick={onCreateDefaults} disabled={actionsDisabled} className={linkClass}>
          <CalendarDays className="h-4 w-4" />
          Criar Missas Padrões no mês
        </button>
        <button type="button" onClick={onAddMass} disabled={actionsDisabled || !onAddMass} aria-label="Adicionar missa" className={linkClass}>
          <Plus className="h-4 w-4" />
          Missa
        </button>
      </div>
    </header>
  )
}
