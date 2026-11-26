"use client"

import { useMemo, useState } from "react"
import { Lightbulb, MessageCircle } from "lucide-react"
import type { PlanMass, PlanReader, PlanSummary, ReaderStats } from "../lib/types"
import { ReaderCard } from "./ReaderCard"
import { ReaderPicker } from "./ReaderPicker"
import { SuggestionRow, type SuggestionLine } from "./SuggestionRow"

interface SuggestionListProps {
  masses: PlanMass[]
  /** Elegíveis: os únicos oferecidos na troca manual. */
  readers: PlanReader[]
  /** Nomes de todos os perfis, para vagas já gravadas com leitor arquivado/sem conta. */
  readerNames: Record<string, string>
  stats: Record<string, ReaderStats>
  unavailable: Record<string, string[]>
  summary: PlanSummary
  monthName: string // ex.: "dezembro"
  onSetReader: (massKey: string, slotIndex: number, profileId: string) => void
  onToggleLock: (massKey: string, slotIndex: number) => void
  onSuggestAgain: () => void
  /** Sem callback, o botão fica desabilitado. */
  onSave?: () => void
  /** Gravação em andamento: o botão mostra "Salvando...". */
  saving?: boolean
  onDetail?: () => void
  onPreview?: () => void
}

type Filter = "all" | "warning" | "locked"
type SlotRef = { massKey: string; slotIndex: number }

const hasWarning = ({ slot }: SuggestionLine) => slot.profileId === "" || slot.warning === "outside-preference"
const FILTERS: Record<Filter, (l: SuggestionLine) => boolean> = {
  all: () => true,
  warning: hasWarning,
  locked: ({ slot }) => slot.locked,
}

const filterClass = (active: boolean) =>
  `min-h-11 text-[13px] transition-colors ${active ? "font-extrabold text-stone-900 underline decoration-2 underline-offset-[6px]" : "font-semibold text-stone-600"}`

/** Lista "caderno" depois da lâmpada: uma linha por função, com troca manual, 👁 e 🔒. */
export function SuggestionList({
  masses,
  readers,
  readerNames,
  stats,
  unavailable,
  summary,
  monthName,
  onSetReader,
  onToggleLock,
  onSuggestAgain,
  onSave,
  onDetail,
  onPreview,
  saving = false,
}: SuggestionListProps) {
  const [filter, setFilter] = useState<Filter>("all")
  const [picking, setPicking] = useState<SlotRef | null>(null)
  const [viewing, setViewing] = useState<SlotRef | null>(null)

  const allLines = useMemo(
    () => masses.flatMap((mass) => mass.slots.map((slot, slotIndex): SuggestionLine => ({ mass, slot, slotIndex }))),
    [masses],
  )
  const monthCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const { slot } of allLines) if (slot.profileId) counts[slot.profileId] = (counts[slot.profileId] ?? 0) + 1
    return counts
  }, [allLines])
  const lines = allLines.filter(FILTERS[filter])
  const warningCount = summary.outsidePreference + summary.empty
  const target = readers.length > 0 ? summary.totalSlots / readers.length : 0

  const nameOf = (id: string) => (id ? (readerNames[id] ?? "Leitor removido") : "")
  const pickMass = picking && masses.find((m) => m.key === picking.massKey && !m.readOnly)
  const viewMass = viewing && masses.find((m) => m.key === viewing.massKey)
  const viewId = viewMass ? (viewMass.slots[viewing.slotIndex]?.profileId ?? "") : ""

  return (
    <>
      <div className="flex flex-col gap-2.5 px-4 pb-2.5">
        <div className="flex items-center gap-2.5 rounded-2xl bg-amber-50 px-3 py-2.5">
          <Lightbulb aria-hidden="true" className="h-5 w-5 shrink-0 text-amber-700" />
          <div role="status" className="flex flex-1 flex-col">
            <span className="text-[13px] font-extrabold text-stone-900">
              {`${summary.filled} de ${summary.totalSlots} ${summary.totalSlots === 1 ? "vaga preenchida" : "vagas preenchidas"}`}
            </span>
            <span className="sr-only"> · </span>
            <span className="text-xs text-stone-700">{`${summary.outsidePreference} fora da preferência · ${summary.empty} sem leitor`}</span>
          </div>
          <button
            type="button"
            onClick={onDetail}
            disabled={!onDetail}
            className="min-h-11 px-1 text-xs font-bold text-amber-700 underline underline-offset-4 disabled:opacity-50"
          >
            Detalhar
          </button>
        </div>
        <div className="flex items-center gap-4">
          {(
            [
              ["all", "Todas"],
              ["warning", `Com aviso (${warningCount})`],
              ["locked", `Travadas (${summary.locked})`],
            ] as [Filter, string][]
          ).map(([key, label]) => (
            <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)} className={filterClass(filter === key)}>
              {label}
            </button>
          ))}
          <button
            type="button"
            onClick={onPreview}
            disabled={!onPreview}
            aria-label="Prévia pelo WhatsApp"
            className="ml-auto flex min-h-11 items-center gap-1.5 rounded-2xl border border-stone-200 px-3 text-[13px] font-bold text-green-700 transition-transform active:scale-95 disabled:opacity-50 disabled:active:scale-100"
          >
            <MessageCircle aria-hidden="true" className="h-4 w-4" />
            Prévia
          </button>
        </div>
      </div>

      <div className="relative border-t-2 border-stone-900">
        <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-[72px] w-px bg-red-300" />
        {lines.length === 0 && <p className="px-6 py-10 text-center text-sm font-medium text-stone-500">Nenhuma vaga neste filtro.</p>}
        <ul aria-label="Vagas sugeridas">
          {lines.map((line, i) => {
            const prev = lines[i - 1]
            const next = lines[i + 1]
            const ref = { massKey: line.mass.key, slotIndex: line.slotIndex }
            return (
              <SuggestionRow
                key={`${line.mass.key}:${line.slotIndex}`}
                {...line}
                name={nameOf(line.slot.profileId)}
                showDate={!prev || prev.mass.date !== line.mass.date}
                showTime={!prev || prev.mass.key !== line.mass.key}
                lastOfDay={!next || next.mass.date !== line.mass.date}
                onPick={() => setPicking(ref)}
                onView={() => setViewing(ref)}
                onToggleLock={() => onToggleLock(ref.massKey, ref.slotIndex)}
              />
            )
          })}
        </ul>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-stone-200 bg-white pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex max-w-md gap-2 px-4 py-3.5">
          <button
            type="button"
            onClick={onSuggestAgain}
            className="flex h-[52px] items-center gap-1.5 rounded-2xl border border-stone-200 px-4 text-sm font-bold text-stone-900 transition-transform active:scale-95"
          >
            <Lightbulb aria-hidden="true" className="h-[18px] w-[18px] text-amber-600" />
            Sugerir de novo
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={!onSave}
            aria-busy={saving}
            className="h-[52px] flex-1 rounded-2xl bg-green-700 text-[15px] font-bold text-white transition-transform active:scale-95 disabled:opacity-60 disabled:active:scale-100"
          >
            {saving ? "Salvando..." : "Salvar como rascunho"}
          </button>
        </div>
      </div>

      {pickMass && (
        <ReaderPicker
          mass={pickMass}
          slotIndex={picking.slotIndex}
          readers={readers}
          unavailable={unavailable}
          monthCounts={monthCounts}
          onPick={(id) => onSetReader(picking.massKey, picking.slotIndex, id)}
          onClose={() => setPicking(null)}
        />
      )}
      {viewMass && viewId && (
        <ReaderCard
          readerId={viewId}
          name={nameOf(viewId)}
          reader={readers.find((r) => r.id === viewId)}
          stats={stats[viewId]}
          masses={masses}
          unavailable={unavailable}
          target={target}
          current={viewing}
          monthName={monthName}
          onClose={() => setViewing(null)}
        />
      )}
    </>
  )
}
