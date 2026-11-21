"use client"

import { Check } from "lucide-react"
import { cn } from "@/shared/lib/utils"
import { MASS_PREFERENCE_DAYS, type MassPreferenceDay } from "../lib/massPreferences"

interface MassPreferencesFieldProps {
  value: Record<string, string[]>
  onToggle: (dayKey: string, time: string) => void
}

const cardClass = "rounded-2xl border border-[#E9DFCB] bg-[#FAF5E6]/60 p-3"
const dayLabel = "text-sm font-extrabold text-[#322113]"

/** Escolha de missas de preferência: terça e sexta lado a lado, domingo logo abaixo. */
export function MassPreferencesField({ value, onToggle }: MassPreferencesFieldProps) {
  const byKey = (key: string) => MASS_PREFERENCE_DAYS.find((d) => d.key === key)!
  const tuesday = byKey("2")
  const friday = byKey("5")
  const sunday = byKey("6")

  const chip = (day: MassPreferenceDay, time: string, extra?: string) => {
    const isSelected = (value?.[day.key] ?? []).includes(time)
    return (
      <button
        key={time}
        type="button"
        aria-pressed={isSelected}
        aria-label={`${day.label} ${time}`}
        onClick={() => onToggle(day.key, time)}
        className={cn(
          "flex h-12 items-center justify-center gap-1 rounded-xl border text-sm font-bold transition-all active:scale-95",
          isSelected
            ? "border-[#322113] bg-[#322113] text-[#FFF8E8] shadow-sm"
            : "border-[#E9DFCB] bg-white text-[#6B5D50] hover:border-[#D9CDB8]",
          extra
        )}
      >
        {isSelected && <Check className="h-3.5 w-3.5 text-[#E8C76A]" strokeWidth={3} />}
        {time.slice(0, 2)}h
      </button>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-xs leading-snug text-[#6B5D50]">Marque todas as missas em que você costuma poder ler. Pode escolher mais de um dia e horário.</p>

      <div className={cn(cardClass, "grid grid-cols-2 gap-3")}>
        <fieldset className="flex flex-col items-start gap-2.5">
          <legend className="sr-only">{tuesday.label}</legend>
          <span className={dayLabel} aria-hidden="true">{tuesday.label}</span>
          <div className="flex gap-2">{tuesday.times.map((t) => chip(tuesday, t, "w-[4.5rem]"))}</div>
        </fieldset>
        <fieldset className="flex flex-col items-end gap-2.5">
          <legend className="sr-only">{friday.label}</legend>
          <span className={dayLabel} aria-hidden="true">{friday.label}</span>
          <div className="flex gap-2">{friday.times.map((t) => chip(friday, t, "w-[4.5rem]"))}</div>
        </fieldset>
      </div>

      <fieldset className={cardClass}>
        <legend className="sr-only">{sunday.label}</legend>
        <span className={cn(dayLabel, "mb-2.5 block")} aria-hidden="true">{sunday.label}</span>
        <div className="grid grid-cols-4 gap-2">{sunday.times.map((t) => chip(sunday, t))}</div>
      </fieldset>
    </div>
  )
}
