"use client"

import { Check, ChevronDown } from "lucide-react"
import { cn } from "@/shared/lib/utils"

interface ReadAnnouncementsGroupProps {
  count: number
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Os cards dos recados já lidos (mantêm editar/excluir do admin). */
  children: React.ReactNode
}

/** Um único card recolhido que reúne os recados que a pessoa já visualizou. */
export function ReadAnnouncementsGroup({ count, open, onOpenChange, children }: ReadAnnouncementsGroupProps) {
  return (
    <section aria-label="Recados já lidos" className="overflow-hidden rounded-3xl border border-[#E9DFCB] bg-[#F4EEDD]">
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
        className="flex min-h-14 w-full items-center gap-3 py-3 pl-4 pr-3 text-left"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#E6F2EA]">
          <Check className="h-4 w-4 text-[#1E6B43]" strokeWidth={3} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[15px] font-extrabold text-[#4A3D31]">{count} recados já lidos</span>
          <span className="text-xs text-[#6B5D50]">{open ? "Toque para recolher" : "Toque para rever"}</span>
        </span>
        <ChevronDown className={cn("h-5 w-5 shrink-0 text-[#6B5D50] transition-transform duration-200", open && "rotate-180")} />
      </button>
      {open && (
        <div className="space-y-2 border-t border-[#E9DFCB] p-3 animate-in fade-in slide-in-from-top-1 duration-200">
          {children}
        </div>
      )}
    </section>
  )
}
