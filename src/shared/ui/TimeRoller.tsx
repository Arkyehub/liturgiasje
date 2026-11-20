"use client"

import { Minus, Plus } from "lucide-react"

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"))
const MINUTES = ["00", "10", "20", "30", "40", "50"]

interface TimeRollerProps {
  value: string // "HH:mm"
  onChange: (value: string) => void
  prefix?: string
}

function StepColumn({
  value,
  label,
  onUp,
  onDown,
}: {
  value: string
  label: string
  onUp: () => void
  onDown: () => void
}) {
  const btn =
    "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#D9CDB8] bg-white text-[#322113] transition-all hover:bg-[#FAF5E6] active:scale-90"
  return (
    <div className="flex min-w-0 items-center gap-1">
      <button type="button" aria-label={`Diminuir ${label}`} onClick={onDown} className={btn}>
        <Minus className="h-4 w-4" strokeWidth={2.2} />
      </button>
      <span className="w-9 select-none text-center text-[28px] font-extrabold tabular-nums leading-none tracking-tight">
        {value}
      </span>
      <button type="button" aria-label={`Aumentar ${label}`} onClick={onUp} className={btn}>
        <Plus className="h-4 w-4" strokeWidth={2.2} />
      </button>
    </div>
  )
}

export function TimeRoller({ value, onChange, prefix }: TimeRollerProps) {
  const parts = value ? value.split(":") : ["07", "00"]
  const h = HOURS.includes(parts[0]) ? parts[0] : "07"
  const m = MINUTES.includes(parts[1]) ? parts[1] : "00"

  const hIdx = HOURS.indexOf(h)
  const mIdx = MINUTES.indexOf(m)

  return (
    <div className="inline-flex max-w-full items-center justify-center gap-1.5">
      {prefix && <span className="pr-1 text-sm font-black text-stone-700">{prefix}</span>}
      <StepColumn
        value={h}
        label="hora"
        onUp={() => onChange(`${HOURS[(hIdx + 1) % 24]}:${m}`)}
        onDown={() => onChange(`${HOURS[(hIdx - 1 + 24) % 24]}:${m}`)}
      />
      <span aria-hidden="true" className="mb-1 select-none text-[26px] font-extrabold text-[#B8A98E]">:</span>
      <StepColumn
        value={m}
        label="minutos"
        onUp={() => onChange(`${h}:${MINUTES[(mIdx + 1) % MINUTES.length]}`)}
        onDown={() => onChange(`${h}:${MINUTES[(mIdx - 1 + MINUTES.length) % MINUTES.length]}`)}
      />
    </div>
  )
}
