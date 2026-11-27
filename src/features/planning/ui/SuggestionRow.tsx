"use client"

import { Eye, Lock, LockOpen, TriangleAlert } from "lucide-react"
import type { PlanMass, PlanSlot } from "../lib/types"
import { weekdayOf } from "./NotebookList"

export interface SuggestionLine {
  mass: PlanMass
  slot: PlanSlot
  slotIndex: number
}

interface SuggestionRowProps extends SuggestionLine {
  /** Nome do leitor da vaga ("" quando vazia). */
  name: string
  showDate: boolean
  showTime: boolean
  /** Última linha visível do dia: pauta mais forte. */
  lastOfDay: boolean
  onPick: () => void
  onView: () => void
  onToggleLock: () => void
  /** Planejamento somente leitura: trocar leitor e travar ficam desativados (ver continua). */
  readOnly?: boolean
}

/** Ícone ⚠️ com nome acessível (a lucide fica oculta e o rótulo vai no span). */
export function OutsidePreferenceIcon() {
  return (
    <span role="img" aria-label="Fora da preferência" className="inline-flex shrink-0">
      <TriangleAlert aria-hidden="true" className="h-3.5 w-3.5 text-amber-700" />
    </span>
  )
}

/** Selo de troca pendente (spec §11): a vaga continua travada até o pedido ser resolvido. */
export function SwapPendingBadge() {
  return (
    <span role="img" aria-label="Troca pendente" className="inline-flex shrink-0 rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-extrabold text-amber-800">
      <span aria-hidden="true">troca pendente</span>
    </span>
  )
}

const iconButton =
  "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors active:bg-stone-100 disabled:opacity-40 disabled:active:bg-transparent"

/** Uma linha do caderno pós-lâmpada: data · horário · função · nome · 👁 · 🔒. */
export function SuggestionRow({
  mass,
  slot,
  name,
  showDate,
  showTime,
  lastOfDay,
  onPick,
  onView,
  onToggleLock,
  readOnly = false,
}: SuggestionRowProps) {
  const dd = mass.date.slice(8, 10)
  const empty = slot.profileId === ""
  const swapPending = !!slot.isSwapRequested
  const frozen = mass.readOnly || swapPending || readOnly
  // Já existe como rascunho no sistema: linha laranja (a troca pendente, mais urgente, mantém o âmbar).
  const existingDraft = !!mass.id && !mass.readOnly && !swapPending
  return (
    <li
      data-date={mass.date}
      data-existing-draft={existingDraft ? "true" : undefined}
      className={`flex min-h-11 items-center border-b ${lastOfDay ? "border-stone-400" : "border-stone-100"} ${swapPending ? "bg-amber-50" : ""} ${existingDraft ? "bg-orange-100" : ""}`}
    >
      <div className="flex w-[72px] shrink-0 items-baseline gap-1 pl-4 pr-2">
        {showDate && (
          <>
            <span className="text-lg font-black leading-none text-stone-900">{dd}</span>
            <span className="text-[11px] font-bold text-stone-500">{weekdayOf(mass.date)}</span>
          </>
        )}
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-2 pl-3 pr-1">
        <span className="w-11 shrink-0 text-[15px] font-extrabold tabular-nums text-stone-900">{showTime ? mass.time : ""}</span>
        <span className="w-[22px] shrink-0 text-[13px] font-extrabold text-stone-600">{slot.role}</span>
        {empty ? (
          <button
            type="button"
            onClick={onPick}
            disabled={mass.readOnly || readOnly}
            className="min-h-11 flex-1 text-left text-[13px] font-bold text-red-700 underline decoration-dashed underline-offset-4 disabled:opacity-60"
          >
            sem leitor · escolher
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={onPick}
              disabled={frozen}
              className="flex min-h-11 min-w-0 flex-1 items-center gap-1.5 text-left text-stone-900 transition-colors active:text-stone-600 disabled:cursor-default"
            >
              <span className="truncate text-sm font-semibold">{name}</span>
              {swapPending && <SwapPendingBadge />}
              {slot.warning === "outside-preference" && <OutsidePreferenceIcon />}
            </button>
            <button type="button" aria-label="Ver escalas do leitor no mês" onClick={onView} className={iconButton}>
              <Eye aria-hidden="true" className="h-[18px] w-[18px] text-stone-600" />
            </button>
            <button
              type="button"
              aria-label={slot.locked ? "Destravar leitor" : "Travar leitor"}
              aria-pressed={slot.locked}
              onClick={onToggleLock}
              disabled={frozen}
              className={iconButton}
            >
              {slot.locked ? (
                <Lock aria-hidden="true" className="h-[18px] w-[18px] fill-stone-900 text-stone-900" />
              ) : (
                <LockOpen aria-hidden="true" className="h-[18px] w-[18px] text-stone-400" />
              )}
            </button>
          </>
        )}
      </div>
    </li>
  )
}
