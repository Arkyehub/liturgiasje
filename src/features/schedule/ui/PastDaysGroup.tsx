"use client"

import { useState } from "react"
import { Check, ChevronDown } from "lucide-react"
import { cn } from "@/shared/lib/utils"

interface PastDaysGroupProps {
  /** Quantidade de missas dentro do grupo (soma dos horários de todos os dias). */
  massesCount: number
  /** Ex.: "1 a 16 nov" */
  rangeLabel: string
  /** Os cards de cada dia concluído (mantêm as ações de admin). */
  children: React.ReactNode
}

/** Um único card recolhido que reúne todos os dias já concluídos do mês. */
export function PastDaysGroup({ massesCount, rangeLabel, children }: PastDaysGroupProps) {
  const [open, setOpen] = useState(false)

  return (
    <section
      aria-label="Missas concluídas"
      className="overflow-hidden rounded-[20px] border border-[#E9DFCB] bg-[#F4EEDD]"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#E6F2EA]">
          <Check className="h-4 w-4 text-[#1E6B43]" strokeWidth={3} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-sm font-bold text-[#4A3D31]">
            {massesCount} {massesCount === 1 ? "missa concluída" : "missas concluídas"}
          </span>
          <span className="text-xs text-[#6B5D50]">{rangeLabel}</span>
        </span>
        <ChevronDown
          className={cn("h-5 w-5 shrink-0 text-[#6B5D50] transition-transform duration-200", open && "rotate-180")}
        />
      </button>
      {open && (
        <div className="space-y-3 border-t border-[#E9DFCB] p-3 animate-in fade-in slide-in-from-top-1 duration-200">
          {children}
        </div>
      )}
    </section>
  )
}
