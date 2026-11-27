"use client"

const WEEKDAY_NAMES = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"]

/** Dia da semana por extenso, sem "-feira" (ex.: "Terça"). */
export function weekdayName(date: string): string {
  return WEEKDAY_NAMES[new Date(`${date}T00:00:00`).getDay()]
}

/** Faixa de uma linha só que abre o dia da missa: "05 Terça". */
export function DayHeader({ date }: { date: string }) {
  return (
    <div data-day-header={date} className="flex items-baseline gap-2 border-b border-stone-200 bg-stone-100 px-4 py-2">
      <span className="text-lg font-black leading-none text-stone-900">{date.slice(8, 10)}</span>
      <span className="text-[13px] font-bold text-stone-600">{weekdayName(date)}</span>
    </div>
  )
}
