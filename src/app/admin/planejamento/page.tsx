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
        />
        {planning.loading ? (
          <Loading text="Carregando o mês..." />
        ) : (
          <NotebookList masses={planning.masses} />
        )}
      </main>

      <PlanningFooter emptySlots={planning.summary.empty} />

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
