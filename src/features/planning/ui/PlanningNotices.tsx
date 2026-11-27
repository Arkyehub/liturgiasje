"use client"

import { useState } from "react"
import { X } from "lucide-react"
import type { ReconcileNotice } from "../lib/reconcilePlan"

interface PlanningNoticesProps {
  notices: ReconcileNotice[]
}

/** Datas "yyyy-MM-dd" em ordem crescente, no formato dd/MM. */
export function sortedDayMonth(dates: string[]): string[] {
  return [...dates].sort().map((d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`)
}

function noticeText({ kind, dates }: ReconcileNotice): string {
  const list = sortedDayMonth(dates).join(", ")
  if (kind === "changed") return `A escala mudou fora do planejamento: ${list}`
  if (kind === "removed") return `Missas removidas fora do planejamento: ${list}`
  if (kind === "published") return `Datas que agora estão publicadas (a edição do planejamento nelas foi descartada): ${list}`
  return "O planejamento guardado estava corrompido e foi ignorado."
}

/**
 * Avisos da reconciliação com a escala real (spec 5.6), um por tipo, cada um dispensável.
 * O estado de "dispensado" mora aqui: quem usa troca a `key` ao mudar de planejamento para reabrir os avisos.
 */
export function PlanningNotices({ notices }: PlanningNoticesProps) {
  const [dismissed, setDismissed] = useState<ReadonlySet<ReconcileNotice["kind"]>>(new Set())
  const visible = notices.filter((n) => !dismissed.has(n.kind))
  if (visible.length === 0) return null
  return (
    <div className="mx-4 mb-2 flex flex-col gap-2">
      {visible.map((notice) => (
        <div key={notice.kind} role="status" className="flex items-start gap-2 rounded-2xl border border-sky-100 bg-sky-50 py-1 pl-3 pr-1">
          <p className="flex-1 py-2 text-[13px] font-medium leading-snug text-stone-800">{noticeText(notice)}</p>
          <button
            type="button"
            aria-label="Dispensar aviso"
            onClick={() => setDismissed((prev) => new Set(prev).add(notice.kind))}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl active:bg-sky-100"
          >
            <X aria-hidden="true" className="h-4 w-4 text-stone-600" />
          </button>
        </div>
      ))}
    </div>
  )
}
