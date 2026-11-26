"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { addMonths, format, startOfMonth } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Loader2 } from "lucide-react"
import { useAuth } from "@/shared/hooks/useAuth"
import { usePlanning } from "@/features/planning/hooks/usePlanning"
import { NotebookList } from "@/features/planning/ui/NotebookList"
import { PublishedNotice } from "@/features/planning/ui/PublishedNotice"
import { PlanningHeader } from "@/features/planning/ui/PlanningHeader"
import { PlanningFooter } from "@/features/planning/ui/PlanningFooter"
import { otherMassTimes } from "@/features/planning/lib/massConflicts"
import { MassSheet } from "@/features/planning/ui/MassSheet"
import { SuggestionList } from "@/features/planning/ui/SuggestionList"

function Loading({ text }: { text: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-stone-400">
      <Loader2 className="h-8 w-8 animate-spin text-amber-600" />
      <p className="text-sm font-medium">{text}</p>
    </div>
  )
}

function PlanningScreen() {
  const [month, setMonth] = useState(() => startOfMonth(new Date()))
  const planning = usePlanning(month)
  // "new" = criando; string = chave da missa em edição; null = fechado.
  const [sheet, setSheet] = useState<"new" | string | null>(null)
  const editing = sheet && sheet !== "new" ? planning.masses.find((m) => m.key === sheet && !m.readOnly) : undefined
  const sheetOpen = sheet === "new" || !!editing
  const monthName = format(month, "MMMM", { locale: ptBR })
  const monthLabel = `${monthName.charAt(0).toUpperCase()}${monthName.slice(1)} ${format(month, "yyyy")}`

  return (
    <div className="min-h-screen bg-white pb-28 font-sans text-stone-900">
      <main className="mx-auto max-w-md">
        <PlanningHeader
          monthLabel={monthLabel}
          massCount={planning.masses.length}
          slotCount={planning.summary.totalSlots}
          readerCount={planning.readers.length}
          onPrevMonth={() => setMonth((m) => addMonths(m, -1))}
          onNextMonth={() => setMonth((m) => addMonths(m, 1))}
          onCreateDefaults={planning.createDefaults}
          onAddMass={() => setSheet("new")}
          actionsDisabled={planning.loading || planning.error}
        />
        {planning.loading ? (
          <Loading text="Carregando o mês..." />
        ) : planning.error ? (
          <div role="alert" className="mx-4 mt-4 rounded-3xl border border-red-100 bg-red-50 p-5 text-center">
            <p className="text-[15px] font-bold text-red-700">Não foi possível carregar este mês.</p>
            <p className="mt-1 text-sm text-red-700/80">
              Sem os dados reais do mês não dá para planejar sem risco de duplicar missas.
            </p>
            <button
              type="button"
              onClick={planning.retry}
              className="mt-4 min-h-12 rounded-2xl bg-stone-800 px-5 text-[15px] font-bold text-white transition-transform active:scale-95"
            >
              Tentar novamente
            </button>
          </div>
        ) : planning.phase === "suggested" ? (
          <SuggestionList
            masses={planning.masses}
            readers={planning.readers}
            readerNames={planning.readerNames}
            stats={planning.stats}
            unavailable={planning.unavailable}
            summary={planning.summary}
            monthName={monthName}
            onSetReader={planning.setSlotReader}
            onToggleLock={planning.toggleLock}
            onSuggestAgain={planning.runLamp}
          />
        ) : (
          <NotebookList masses={planning.masses} onSelectMass={setSheet} />
        )}
      </main>

      {sheetOpen && (
        <MassSheet
          key={editing?.key ?? "new"}
          month={month}
          mass={editing}
          existing={otherMassTimes(planning.masses, editing?.key)}
          onSave={(saved) => {
            if (editing) {
              const [m] = saved
              planning.updateMass(editing.key, { date: m.date, time: m.time, description: m.description, slots: m.slots })
            } else {
              // addMass pode renomear a chave; não dependemos dela depois.
              saved.forEach(planning.addMass)
            }
            setSheet(null)
          }}
          onRemove={editing ? () => { planning.removeMass(editing.key); setSheet(null) } : undefined}
          onClose={() => setSheet(null)}
        />
      )}

      {planning.phase === "planning" && (
        <PlanningFooter emptySlots={planning.summary.empty} onLamp={planning.loading || planning.error ? undefined : planning.runLamp} />
      )}

      {!planning.loading && planning.publishedCount > 0 && planning.publishedDecision === "pending" && (
        <PublishedNotice
          count={planning.publishedCount}
          monthName={monthName}
          onInclude={planning.acceptPublished}
          onKeep={planning.declinePublished}
        />
      )}
    </div>
  )
}

export default function PlanejamentoPage() {
  const { user, profile, loading: authLoading } = useAuth()
  const router = useRouter()
  const isAdmin = !!user && profile?.role === "admin"

  useEffect(() => {
    if (!authLoading && !isAdmin) router.push("/")
  }, [authLoading, isAdmin, router])

  if (authLoading || !isAdmin) return <Loading text="Carregando planejamento..." />
  return <PlanningScreen />
}
