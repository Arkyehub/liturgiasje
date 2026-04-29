"use client"

import { ChevronUp, ChevronDown } from "lucide-react"

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"))
const MINUTES = ["00", "10", "20", "30", "40", "50"]

interface TimeRollerProps {
  value: string // "HH:mm"
  onChange: (value: string) => void
  prefix?: string
}

function StepColumn({
  items,
  value,
  onUp,
  onDown,
}: {
  items: string[]
  value: string
  onUp: () => void
  onDown: () => void
}) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <button
        type="button"
        onClick={onUp}
        className="p-1 text-stone-300 hover:text-stone-700 active:scale-90 transition-all rounded-lg hover:bg-stone-100"
      >
        <ChevronUp className="h-3 w-3" />
      </button>

      <span className="text-sm font-black text-stone-800 tabular-nums w-7 text-center leading-none select-none">
        {value}
      </span>

      <button
        type="button"
        onClick={onDown}
        className="p-1 text-stone-300 hover:text-stone-700 active:scale-90 transition-all rounded-lg hover:bg-stone-100"
      >
        <ChevronDown className="h-3 w-3" />
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
    <div className="inline-flex items-center gap-2 bg-white rounded-xl border border-stone-200 shadow-sm px-3 py-1">
      {prefix && (
        <span className="text-sm font-black text-stone-700 leading-none select-none pr-1 border-r border-stone-100">
          {prefix}
        </span>
      )}
      <StepColumn
        items={HOURS}
        value={h}
        onUp={() => onChange(`${HOURS[(hIdx + 1) % 24]}:${m}`)}
        onDown={() => onChange(`${HOURS[(hIdx - 1 + 24) % 24]}:${m}`)}
      />

      <span className="text-xl font-black text-stone-300 mb-0.5 select-none">:</span>

      <StepColumn
        items={MINUTES}
        value={m}
        onUp={() => onChange(`${h}:${MINUTES[(mIdx + 1) % MINUTES.length]}`)}
        onDown={() => onChange(`${h}:${MINUTES[(mIdx - 1 + MINUTES.length) % MINUTES.length]}`)}
      />
    </div>
  )
}
