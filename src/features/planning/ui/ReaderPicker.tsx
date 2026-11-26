"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/shared/ui/sheet"
import type { PlanMass, PlanReader } from "../lib/types"
import { prefersMass } from "../lib/slotPreference"

interface ReaderPickerProps {
  mass: PlanMass
  slotIndex: number
  /** Só leitores elegíveis (ativos e com conta): arquivados/sem conta nunca chegam aqui. */
  readers: PlanReader[]
  unavailable: Record<string, string[]>
  /** Vagas de cada leitor no plano do mês (para "menos escalados primeiro"). */
  monthCounts: Record<string, number>
  onPick: (profileId: string) => void
  onClose: () => void
}

type Kind = "pref" | "available" | "unavailable" | "in-mass"

/**
 * Troca manual. Espelha o ScheduleForm: quem prefere o horário primeiro, depois os
 * disponíveis, e por último quem não pode (indisponível na data ou já nesta missa),
 * que aparece sinalizado e não pode ser escolhido.
 */
export function ReaderPicker({ mass, slotIndex, readers, unavailable, monthCounts, onPick, onClose }: ReaderPickerProps) {
  const [search, setSearch] = useState("")
  const slot = mass.slots[slotIndex]
  const [, mm, dd] = mass.date.split("-")
  const unavailableIds = unavailable[mass.date] ?? []

  const kindOf = (r: PlanReader): Kind => {
    if (unavailableIds.includes(r.id)) return "unavailable"
    if (mass.slots.some((s, i) => i !== slotIndex && s.profileId === r.id)) return "in-mass"
    return prefersMass(r, mass) ? "pref" : "available"
  }
  const term = search.trim().toLocaleLowerCase("pt-BR")
  const byUsage = (a: PlanReader, b: PlanReader) =>
    (monthCounts[a.id] ?? 0) - (monthCounts[b.id] ?? 0) || a.fullName.localeCompare(b.fullName, "pt-BR")
  const visible = readers.filter((r) => !term || r.fullName.toLocaleLowerCase("pt-BR").includes(term)).sort(byUsage)
  const groups: { heading: string; kinds: Kind[] }[] = [
    { heading: "Preferem este horário · menos escalados primeiro", kinds: ["pref"] },
    { heading: "Disponíveis · menos escalados primeiro", kinds: ["available"] },
    { heading: "Não podem nesta missa", kinds: ["unavailable", "in-mass"] },
  ]

  const choose = (r: PlanReader, kind: Kind) => {
    if (kind === "unavailable" || kind === "in-mass") {
      toast.warning(
        kind === "in-mass"
          ? `${r.fullName} já está nesta missa.`
          : `${r.fullName} informou que não poderá participar nesta data.`,
        { duration: 5000 },
      )
      return
    }
    onPick(r.id)
    onClose()
  }

  const renderItem = (r: PlanReader, kind: Kind) => {
    const blocked = kind === "unavailable" || kind === "in-mass"
    const used = monthCounts[r.id] ?? 0
    const current = slot?.profileId === r.id
    const detail =
      kind === "in-mass"
        ? "Já nesta missa"
        : kind === "unavailable"
          ? "Informou indisponibilidade"
          : current
            ? "Escolhido nesta vaga"
            : used > 0
              ? `${used}x neste mês`
              : "Ainda sem escala neste mês"
    return (
      <li key={r.id}>
        <button
          type="button"
          aria-disabled={blocked || undefined}
          onClick={() => choose(r, kind)}
          className="flex min-h-[60px] w-full items-center justify-between gap-3 rounded-2xl px-3 py-2 text-left transition-colors active:bg-stone-100"
        >
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className={`truncate text-base font-bold ${blocked ? "text-stone-400" : "text-stone-900"}`}>{r.fullName}</span>
            <span className={`text-xs ${blocked ? "font-bold text-red-700" : "text-stone-600"}`}>{detail}</span>
          </span>
          {kind === "unavailable" ? (
            <span className="shrink-0 rounded-full bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700">Indisponível</span>
          ) : kind === "in-mass" ? (
            <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">Nesta missa</span>
          ) : kind === "pref" ? (
            <span className="shrink-0 rounded-full bg-green-50 px-2.5 py-1 text-xs font-bold text-green-700">Preferência</span>
          ) : null}
        </button>
      </li>
    )
  }

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" className="max-h-[85vh] gap-0 rounded-t-[28px] bg-white p-0 sm:mx-auto sm:max-w-md">
        <SheetHeader className="gap-1 px-5 pb-2 pt-5">
          <SheetTitle className="text-xl font-black tracking-tight text-stone-900">Escolher leitor</SheetTitle>
          <SheetDescription className="text-xs text-stone-600">
            {`${slot?.role ?? ""} · ${dd}/${mm} às ${mass.time}`} — a troca manual trava a vaga.
          </SheetDescription>
        </SheetHeader>
        <div className="px-5 pb-2">
          <input
            type="search"
            aria-label="Buscar leitor"
            placeholder="Buscar leitor"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-11 w-full rounded-2xl border border-stone-200 px-4 text-[15px] outline-none focus:border-stone-400"
          />
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-6">
          {visible.length === 0 && <p className="px-3 py-6 text-center text-sm text-stone-500">Nenhum leitor encontrado.</p>}
          {groups.map(({ heading, kinds }) => {
            const items = visible.filter((r) => kinds.includes(kindOf(r)))
            if (items.length === 0) return null
            return (
              <section key={heading} className="pt-2">
                <h3 className="px-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-stone-500">{heading}</h3>
                <ul>{items.map((r) => renderItem(r, kindOf(r)))}</ul>
              </section>
            )
          })}
        </div>
      </SheetContent>
    </Sheet>
  )
}
