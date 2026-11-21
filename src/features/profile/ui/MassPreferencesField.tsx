"use client"

import { Check } from "lucide-react"
import { cn } from "@/shared/lib/utils"
import { MASS_PREFERENCE_DAYS } from "../lib/massPreferences"

interface MassPreferencesFieldProps {
  value: Record<string, string[]>
  onToggle: (dayKey: string, time: string) => void
}

/** Escolha de missas de preferência: um bloco por dia, vários horários por dia. */
export function MassPreferencesField({ value, onToggle }: MassPreferencesFieldProps) {
  return (
    <div className="space-y-3">
      <p className="text-xs leading-snug text-[#6B5D50]">Marque todas as missas em que você costuma poder ler. Pode escolher mais de um dia e horário.</p>
      {MASS_PREFERENCE_DAYS.map((day) => {
        const selected = value?.[day.key] ?? []
        return (
          <fieldset key={day.key} className="rounded-2xl border border-[#E9DFCB] bg-[#FAF5E6]/60 p-3">
            <legend className="sr-only">{day.label}</legend>
            <div className="mb-2.5 flex items-center justify-between">
              <span className="text-sm font-extrabold text-[#322113]">{day.label}</span>
              <span className={cn("text-xs font-bold", selected.length > 0 ? "text-[#1E6B43]" : "text-[#8A7A66]")}>
                {selected.length > 0 ? `${selected.length} ${selected.length === 1 ? "marcada" : "marcadas"}` : "nenhuma"}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {day.times.map((time) => {
                const isSelected = selected.includes(time)
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
                        : "border-[#E9DFCB] bg-white text-[#6B5D50] hover:border-[#D9CDB8]"
                    )}
                  >
                    {isSelected && <Check className="h-3.5 w-3.5 text-[#E8C76A]" strokeWidth={3} />}
                    {time.slice(0, 2)}h
                  </button>
                )
              })}
            </div>
          </fieldset>
        )
      })}
    </div>
  )
}
