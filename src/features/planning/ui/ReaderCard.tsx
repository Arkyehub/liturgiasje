"use client"

import { X } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/shared/ui/dialog"
import { MASS_PREFERENCE_DAYS } from "@/features/profile/lib/massPreferences"
import type { PlanMass, PlanReader, ReaderStats } from "../lib/types"
import { plural, ROLE_LABEL, targetLabel, topRole } from "../lib/format"
import { weekdayOf } from "./NotebookList"
import { OutsidePreferenceIcon } from "./SuggestionRow"

interface ReaderCardProps {
  readerId: string
  name: string
  /** Ausente quando o leitor da vaga já não é elegível (arquivado/sem conta). */
  reader?: PlanReader
  stats?: ReaderStats
  masses: PlanMass[]
  unavailable: Record<string, string[]>
  /** Meta do mês: vagas ÷ leitores elegíveis (fracionária). */
  target: number
  /** Vaga a partir da qual o card foi aberto ("ESTA"). */
  current: { massKey: string; slotIndex: number }
  monthName: string // ex.: "dezembro"
  onClose: () => void
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
const dayMonth = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return `${parts[0]?.[0] ?? ""}${parts.length > 1 ? parts[parts.length - 1][0] : ""}`.toUpperCase()
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col rounded-2xl bg-stone-100 px-2.5 py-2">
      <span className="text-[10px] font-bold uppercase tracking-widest text-stone-600">{label}</span>
      <span className="text-base font-black text-stone-900">{value}</span>
    </div>
  )
}

/** Card 👁: escalas do leitor no mês, contagem vs. meta, média, função, preferências e indisponibilidade. */
export function ReaderCard({ readerId, name, reader, stats, masses, unavailable, target, current, monthName, onClose }: ReaderCardProps) {
  const items = masses.flatMap((mass) =>
    mass.slots.flatMap((slot, slotIndex) =>
      slot.profileId === readerId
        ? [{ mass, slot, isCurrent: mass.key === current.massKey && slotIndex === current.slotIndex, key: `${mass.key}:${slotIndex}` }]
        : [],
    ),
  )
  const preferences = MASS_PREFERENCE_DAYS.flatMap((day) =>
    [...(reader?.dayPreferences[day.key] ?? [])].sort().map((time) => `${day.label.slice(0, 3)} ${time}`),
  )
  const unavailableDates = Object.keys(unavailable)
    .filter((date) => unavailable[date].includes(readerId))
    .sort()
  const average = stats ? `${stats.monthlyAverage.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} por mês` : "—"
  const listLabel = `Escalas em ${monthName}`
  const top = topRole(stats)
  const topRoleText = top ? `Mais faz: ${top.label} (${top.percent}%)` : "Sem histórico de funções"

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent showCloseButton={false} className="flex flex-col gap-3.5 rounded-[28px] bg-white p-[18px] sm:max-w-md">
        <div className="flex items-center gap-3">
          <div aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-stone-200 text-base font-extrabold text-stone-700">
            {initials(name)}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <DialogTitle className="truncate text-[17px] font-black tracking-tight text-stone-900">{name}</DialogTitle>
            <DialogDescription className="text-xs text-stone-600">{topRoleText}</DialogDescription>
          </div>
          <button
            type="button"
            aria-label="Fechar"
            onClick={onClose}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-stone-100 transition-transform active:scale-95"
          >
            <X aria-hidden="true" className="h-5 w-5 text-stone-700" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          <Tile label={capitalize(monthName)} value={plural(items.length, "missa", "missas")} />
          <Tile label="Meta" value={targetLabel(target)} />
          <Tile label="Média 3 meses" value={average} />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-bold uppercase tracking-widest text-stone-600">{listLabel}</span>
          {items.length === 0 ? (
            <p className="rounded-2xl border border-stone-100 px-3 py-3 text-sm text-stone-500">Nenhuma escala neste mês.</p>
          ) : (
            <ul aria-label={listLabel} className="max-h-60 overflow-y-auto rounded-2xl border border-stone-100">
              {items.map(({ mass, slot, isCurrent, key }) => (
                <li key={key} className="flex min-h-12 flex-col justify-center border-b border-stone-100 px-3 py-1 last:border-b-0">
                  <div className="flex items-center gap-2.5">
                    <span className="w-16 text-[13px] font-extrabold text-stone-900">{`${capitalize(weekdayOf(mass.date))} ${dayMonth(mass.date)}`}</span>
                    <span className="w-11 text-[13px] font-bold text-stone-700">{mass.time}</span>
                    <span className="flex-1 text-[13px] font-semibold text-stone-900">{ROLE_LABEL[slot.role]}</span>
                    {isCurrent && <span className="rounded-md bg-stone-900 px-1.5 py-0.5 text-[10px] font-extrabold text-white">ESTA</span>}
                    {slot.warning === "outside-preference" && <OutsidePreferenceIcon />}
                  </div>
                  {isCurrent && slot.reason && (
                    <p className="pb-1 text-[11px] leading-snug text-stone-600">
                      <span className="font-bold">Por quê:</span> {slot.reason}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-bold uppercase tracking-widest text-stone-600">Preferências e indisponibilidade</span>
          <div className="flex flex-wrap gap-1.5">
            {preferences.length === 0 ? (
              <span className="rounded-lg bg-stone-100 px-2 py-1 text-xs font-bold text-stone-600">Sem preferência marcada</span>
            ) : (
              preferences.map((p) => (
                <span key={p} className="rounded-lg bg-stone-100 px-2 py-1 text-xs font-bold text-stone-900">
                  {p}
                </span>
              ))
            )}
            {unavailableDates.length > 0 && (
              <span className="rounded-lg bg-red-50 px-2 py-1 text-xs font-bold text-red-700">
                {`Indisponível: ${unavailableDates.map(dayMonth).join(", ")}`}
              </span>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
