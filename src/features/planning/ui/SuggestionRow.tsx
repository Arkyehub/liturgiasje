"use client"

import { Eye, Lock, LockOpen, Pencil, TriangleAlert } from "lucide-react"
import type { PlanMass, PlanSlot } from "../lib/types"
import { MASS_ROW_TINT, MassStatusTag } from "./MassStatusTag"

export interface SuggestionLine {
  mass: PlanMass
  slot: PlanSlot
  slotIndex: number
}

interface SuggestionRowProps extends SuggestionLine {
  /** Nome do leitor da vaga ("" quando vazia). */
  name: string
  showTime: boolean
  /** Última linha visível do dia: pauta mais forte. */
  lastOfDay: boolean
  onPick: () => void
  onView: () => void
  onToggleLock: () => void
  /** Toque no horário da missa (1ª linha dela): abre a edição da missa (remover missa, mudar funções). */
  onEditMass?: () => void
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
  showTime,
  lastOfDay,
  onPick,
  onView,
  onToggleLock,
  onEditMass,
  readOnly = false,
}: SuggestionRowProps) {
  const empty = slot.profileId === ""
  const swapPending = !!slot.isSwapRequested
  const frozen = mass.readOnly || swapPending || readOnly
  // Já existe como rascunho no sistema: linha laranja (a troca pendente, mais urgente, mantém o âmbar).
  const existingDraft = !!mass.id && !mass.readOnly && !swapPending
  const tint = swapPending ? "bg-amber-50" : mass.readOnly ? MASS_ROW_TINT.published : existingDraft ? MASS_ROW_TINT.draft : ""
  // A tag aparece uma vez por missa (na primeira linha dela).
  const tag = showTime && (mass.readOnly ? <MassStatusTag kind="published" /> : existingDraft ? <MassStatusTag kind="draft" /> : null)
  return (
    <li
      data-date={mass.date}
      data-existing-draft={existingDraft ? "true" : undefined}
      className={`flex border-b ${lastOfDay ? "border-stone-400" : "border-stone-100"} ${tint}`}
    >
      {showTime && onEditMass && !mass.readOnly && !readOnly ? (
        <button
          type="button"
          onClick={onEditMass}
          aria-label={`Editar missa de ${mass.date.slice(8, 10)}/${mass.date.slice(5, 7)} às ${mass.time}`}
          className="flex min-h-11 w-[72px] shrink-0 flex-col items-start gap-1.5 py-3 pl-4 pr-0 text-left transition-colors active:bg-stone-100"
        >
          <span className="flex items-center gap-0.5">
            <span className="text-[15px] font-extrabold leading-tight tabular-nums text-stone-900">{mass.time}</span>
            <Pencil aria-hidden="true" className="h-3 w-3 shrink-0 text-stone-400" />
          </span>
          {tag}
        </button>
      ) : (
        <div className="flex w-[72px] shrink-0 flex-col items-start gap-1.5 py-3 pl-4 pr-2">
          {showTime && <span className="text-[15px] font-extrabold leading-tight tabular-nums text-stone-900">{mass.time}</span>}
          {tag}
        </div>
      )}
      <div className="flex min-h-11 min-w-0 flex-1 items-center gap-2 pr-1">
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
