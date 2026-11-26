"use client"

import { ChevronLeft } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/shared/ui/dialog"
import type { PlanMass, PlanReader, ReaderStats } from "../lib/types"
import { plural, targetLabel, topRole } from "../lib/format"

interface BalanceDetailProps {
  masses: PlanMass[]
  /** Elegíveis: a meta do mês é vagas ÷ esses leitores. */
  readers: PlanReader[]
  stats: Record<string, ReaderStats>
  unavailable: Record<string, string[]>
  monthLabel: string // ex.: "Dezembro 2026"
  onClose: () => void
}

type Balance = "over" | "on" | "under"

interface Row {
  reader: PlanReader
  count: number
  balance: Balance
  role: string
  history: string
  note: string
}

const BAR: Record<Balance, string> = { over: "bg-amber-600", on: "bg-stone-500", under: "bg-blue-600" }
const COUNT: Record<Balance, string> = { over: "text-amber-700", on: "text-stone-900", under: "text-blue-700" }
const STATUS: Record<Balance, string> = { over: "Acima da meta", on: "Na meta", under: "Abaixo da meta" }

function topRoleText(stats?: ReaderStats): string {
  const top = topRole(stats)
  return top ? `${top.label} · ${top.percent}%` : "Sem histórico de funções"
}

function historyLine(s?: ReaderStats): string {
  if (!s) return "Sem histórico nos últimos 3 meses"
  return `Últimos 3 meses: ${plural(s.scheduled, "escalada", "escaladas")} · ${plural(s.takeovers, "troca assumida", "trocas assumidas")} · ${plural(s.passed, "passada", "passadas")}`
}

function buildRows({ masses, readers, stats, unavailable }: Omit<BalanceDetailProps, "monthLabel" | "onClose">, target: number): Row[] {
  const counts: Record<string, number> = {}
  for (const m of masses) for (const s of m.slots) if (s.profileId) counts[s.profileId] = (counts[s.profileId] ?? 0) + 1
  const known = readers.map((r) => stats[r.id]).filter((s): s is ReaderStats => !!s)
  const groupAverage = known.length > 0 ? known.reduce((sum, s) => sum + s.monthlyAverage, 0) / known.length : 0
  const lo = Math.floor(target)
  const hi = Math.ceil(target)

  return readers
    .map((reader) => {
      const count = counts[reader.id] ?? 0
      const s = stats[reader.id]
      const balance: Balance = count > hi ? "over" : count < lo ? "under" : "on"
      const days = Object.keys(unavailable).filter((d) => unavailable[d].includes(reader.id)).length
      const reasons = [STATUS[balance]]
      if (days > 0) reasons.push(`indisponível em ${plural(days, "dia", "dias")}`)
      if (s && s.monthlyAverage < groupAverage) reasons.push("média baixa → prioridade")
      if (s && s.takeovers > 0) reasons.push("assume trocas → um pouco menos")
      return { reader, count, balance, role: topRoleText(s), history: historyLine(s), note: reasons.join(" · ") }
    })
    .sort((a, b) => b.count - a.count || a.reader.fullName.localeCompare(b.reader.fullName, "pt-BR"))
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col rounded-2xl bg-stone-100 px-2.5 py-2">
      <span className="text-[10px] font-bold uppercase tracking-widest text-stone-600">{label}</span>
      <span className="text-base font-black text-stone-900">{value}</span>
    </div>
  )
}

/** "Detalhar": contagem do mês de cada leitor contra a meta, com o histórico que explica a escolha. */
export function BalanceDetail({ masses, readers, stats, unavailable, monthLabel, onClose }: BalanceDetailProps) {
  const totalSlots = masses.reduce((n, m) => n + m.slots.length, 0)
  const target = readers.length > 0 ? totalSlots / readers.length : 0
  const rows = buildRows({ masses, readers, stats, unavailable }, target)
  const scale = Math.max(1, Math.ceil(target) + 1, ...rows.map((r) => r.count))
  const goal = targetLabel(target)
  const over = rows.filter((r) => r.balance === "over").length
  const under = rows.filter((r) => r.balance === "under").length

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="top-0 flex h-[100dvh] max-h-[100dvh] max-w-md translate-y-0 flex-col gap-0 overflow-hidden rounded-none bg-stone-50 p-0 ring-0 sm:max-w-md"
      >
        <header className="flex flex-col gap-2.5 border-b border-stone-100 bg-white px-4 pb-3 pt-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Voltar às sugestões"
              onClick={onClose}
              className="-ml-2.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl transition-transform active:scale-95"
            >
              <ChevronLeft aria-hidden="true" className="h-[22px] w-[22px] text-stone-900" />
            </button>
            <div className="flex flex-col">
              <DialogTitle className="text-xl font-black tracking-tight text-stone-900">Equilíbrio do mês</DialogTitle>
              <DialogDescription className="text-xs text-stone-600">
                {`${monthLabel} · ${plural(totalSlots, "vaga", "vagas")} para ${plural(readers.length, "leitor", "leitores")}`}
              </DialogDescription>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            <Tile label="Meta" value={goal} />
            <Tile label="Acima" value={plural(over, "leitor", "leitores")} />
            <Tile label="Abaixo" value={plural(under, "leitor", "leitores")} />
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-4 pb-6 pt-3">
          {rows.length === 0 ? (
            <p className="rounded-2xl border border-stone-100 bg-white px-4 py-6 text-center text-sm text-stone-500">Nenhum leitor apto neste mês.</p>
          ) : (
            <ul aria-label="Equilíbrio por leitor" className="overflow-hidden rounded-[20px] border border-stone-100 bg-white">
              {rows.map((r) => (
                <li
                  key={r.reader.id}
                  data-reader={r.reader.id}
                  data-balance={r.balance}
                  className="flex items-center gap-2.5 border-b border-stone-100 px-3 py-2.5 last:border-b-0"
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex items-baseline justify-between gap-1.5">
                      <span className="truncate text-sm font-bold text-stone-900">{r.reader.fullName}</span>
                      <span className="whitespace-nowrap text-[11px] text-stone-600">{r.role}</span>
                    </div>
                    <div role="img" aria-label={`${r.count} de meta ${goal}`} className="relative h-2 rounded-lg bg-stone-100">
                      <div className={`absolute inset-y-0 left-0 rounded-lg ${BAR[r.balance]}`} style={{ width: `${(r.count / scale) * 100}%` }} />
                      <div className="absolute -top-[3px] h-3.5 w-0.5 rounded-sm bg-stone-700" style={{ left: `${(target / scale) * 100}%` }} />
                    </div>
                    <span className="text-[11px] text-stone-600">{r.history}</span>
                    <span className="text-[11px] font-semibold text-stone-700">{r.note}</span>
                  </div>
                  <span aria-hidden="true" className={`w-[30px] text-right text-lg font-black ${COUNT[r.balance]}`}>
                    {r.count}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mx-1 mt-2.5 text-xs text-stone-600">
            A marca preta é a meta. Trocas assumidas contam como missas servidas no equilíbrio; vagas passadas a outro não
            contam. Função mais frequente vem dos últimos 12 meses.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
