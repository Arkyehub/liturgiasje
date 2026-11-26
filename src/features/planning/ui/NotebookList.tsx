"use client"

import type { PlanMass } from "../lib/types"

const WEEKDAYS = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"]

interface NotebookListProps {
  masses: PlanMass[]
  /** Toque numa linha editável abre a edição. Sem callback (somente leitura) as linhas ficam desativadas. */
  onSelectMass?: (key: string) => void
}

export function weekdayOf(date: string): string {
  return WEEKDAYS[new Date(`${date}T00:00:00`).getDay()]
}

/** Lista "caderno": linhas pautadas, margem vermelha fina e a data só na 1ª missa do dia. */
export function NotebookList({ masses, onSelectMass }: NotebookListProps) {
  if (masses.length === 0) {
    return (
      <div className="border-t-2 border-stone-900 px-6 py-12 text-center text-sm font-medium text-stone-500">
        Nenhuma missa neste mês ainda. Use <strong className="font-bold text-stone-800">Criar Missas Padrões no mês</strong> ou{" "}
        <strong className="font-bold text-stone-800">+ Missa</strong>.
      </div>
    )
  }

  return (
    <div className="relative border-t-2 border-stone-900">
      <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-[72px] w-px bg-red-300" />
      <ul aria-label="Missas do mês">
        {masses.map((mass, i) => {
          const firstOfDay = i === 0 || masses[i - 1].date !== mass.date
          const lastOfDay = i === masses.length - 1 || masses[i + 1].date !== mass.date
          const roles = mass.slots.map((s) => s.role).join(" · ")
          const [, mm, dd] = mass.date.split("-")
          return (
            <li
              key={mass.key}
              data-date={mass.date}
              className={`flex min-h-11 items-center border-b ${lastOfDay ? "border-stone-400" : "border-stone-200"}`}
            >
              <div className="flex w-[72px] shrink-0 items-baseline gap-1 pl-4 pr-2">
                {firstOfDay && (
                  <>
                    <span className="text-lg font-black leading-none text-stone-900">{dd}</span>
                    <span className="text-[11px] font-bold text-stone-500">{weekdayOf(mass.date)}</span>
                  </>
                )}
              </div>
              <button
                type="button"
                disabled={mass.readOnly || !onSelectMass}
                aria-label={`Missa de ${dd}/${mm} às ${mass.time}${mass.readOnly ? " (publicada, somente leitura)" : ""}`}
                onClick={() => onSelectMass?.(mass.key)}
                className="flex min-h-11 min-w-0 flex-1 items-center gap-3 py-1.5 pl-3 pr-4 text-left text-stone-900 transition-colors active:bg-stone-100 disabled:cursor-default disabled:active:bg-transparent"
              >
                <span className="w-11 shrink-0 text-[15px] font-extrabold tabular-nums">{mass.time}</span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-bold tracking-wide text-stone-700">{roles}</span>
                  {mass.description && (
                    <span className="truncate text-[11px] font-bold text-amber-700">{mass.description}</span>
                  )}
                </span>
                {mass.readOnly ? (
                  <span className="shrink-0 rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-stone-500">
                    publicada
                  </span>
                ) : (
                  mass.wasPublished && (
                    <span className="shrink-0 text-[10px] font-bold text-amber-700">volta a rascunho ao salvar</span>
                  )
                )}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
