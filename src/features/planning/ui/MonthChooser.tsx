"use client"

import { addMonths, format, startOfMonth } from "date-fns"
import { ptBR } from "date-fns/locale"

interface MonthChooserProps {
  /** Mês atual (primeiro dia). As opções são ele, o seguinte (sugerido) e o subsequente. */
  current: Date
  onChoose: (month: Date) => void
}

function label(month: Date) {
  const name = format(month, "MMMM", { locale: ptBR })
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${format(month, "yyyy")}`
}

/** Primeira tela do planejamento: o mês é escolhido antes de qualquer leitura (a escala sai com um mês de antecedência). */
export function MonthChooser({ current, onChoose }: MonthChooserProps) {
  const base = startOfMonth(current)
  const options = [0, 1, 2].map((delta) => ({ month: addMonths(base, delta), suggested: delta === 1 }))
  return (
    <section className="flex flex-col gap-4 px-4 pb-6 pt-4">
      <h1 className="text-xl font-black tracking-tight text-stone-900">Planejamento de Escala</h1>
      <div className="flex flex-col gap-1">
        <h2 className="text-[22px] font-black tracking-tight text-stone-900">Qual mês você vai planejar?</h2>
        <p className="text-sm text-stone-600">A escala costuma ser feita com um mês de antecedência.</p>
      </div>
      <div className="flex flex-col gap-3">
        {options.map(({ month, suggested }) => (
          <button
            key={format(month, "yyyy-MM")}
            type="button"
            onClick={() => onChoose(month)}
            className={`flex min-h-14 w-full items-center justify-between gap-3 rounded-2xl border px-5 text-left text-[17px] font-bold transition-transform active:scale-95 ${
              suggested ? "border-amber-200 bg-amber-50 text-stone-900" : "border-stone-100 bg-white text-stone-800"
            }`}
          >
            <span>{label(month)}</span>
            {suggested && (
              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-amber-600">
                Sugerido
              </span>
            )}
          </button>
        ))}
      </div>
    </section>
  )
}
