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
import { BalanceDetail } from "@/features/planning/ui/BalanceDetail"
import { ConfirmDialog } from "@/features/planning/ui/ConfirmDialog"
import { usePlanningSave } from "@/features/planning/hooks/usePlanningSave"

function Loading({ text }: { text: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-stone-400">
      <Loader2 className="h-8 w-8 animate-spin text-amber-600" />
      <p className="text-sm font-medium">{text}</p>
    </div>
  )
}

type Confirm = { kind: "unpublish" } | { kind: "month"; delta: number }

function PlanningScreen() {
  const [month, setMonth] = useState(() => startOfMonth(new Date()))
  const planning = usePlanning(month)
  const save = usePlanningSave({
    month,
    masses: planning.masses,
    removedMasses: planning.removedMasses,
    readerNames: planning.readerNames,
    loading: planning.loading,
    error: planning.error,
    reload: planning.retry,
  })
  // Enquanto grava, o plano em memória fica congelado: a recarga depois de gravar descartaria edições feitas agora.
  const { setBusy } = planning
  useEffect(() => {
    setBusy(save.saving)
  }, [save.saving, setBusy])
  // Alterações não salvas: o navegador mostra o aviso nativo ao fechar/recarregar a aba.
  // Lacuna conhecida: não intercepta a navegação interna do app (links/voltar do Next.js); só trocar de mês pergunta.
  const { dirty } = save
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ""
    }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty])
  const [confirm, setConfirm] = useState<Confirm | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  // "new" = criando; string = chave da missa em edição; null = fechado.
  const [sheet, setSheet] = useState<"new" | string | null>(null)
  const editing = sheet && sheet !== "new" ? planning.masses.find((m) => m.key === sheet && !m.readOnly) : undefined
  const sheetOpen = sheet === "new" || !!editing
  const monthName = format(month, "MMMM", { locale: ptBR })
  const monthLabel = `${monthName.charAt(0).toUpperCase()}${monthName.slice(1)} ${format(month, "yyyy")}`

  // Trocar de mês descarta o planejamento em memória: com mudanças não salvas, pergunta antes.
  const changeMonth = (delta: number) => {
    if (save.saving) return
    if (save.dirty) setConfirm({ kind: "month", delta })
    else setMonth((m) => addMonths(m, delta))
  }
  // Missas publicadas incluídas: os leitores deixam de vê-las, então confirma antes de gravar.
  const requestSave = () => {
    if (save.unpublishCount > 0) setConfirm({ kind: "unpublish" })
    else void save.saveDraft()
  }
  // noopener/noreferrer: a aba do WhatsApp não ganha acesso a esta janela (nem ao referrer do painel admin).
  const openPreview = () => window.open(`https://wa.me/?text=${encodeURIComponent(save.previewText())}`, "_blank", "noopener,noreferrer")
  const unpublishOne = save.unpublishCount === 1

  return (
    <div className="min-h-screen bg-white pb-28 font-sans text-stone-900">
      <main
        inert={save.saving}
        aria-busy={save.saving}
        className={`mx-auto max-w-md transition-opacity ${save.saving ? "opacity-60" : ""}`}
      >
        <PlanningHeader
          monthLabel={monthLabel}
          massCount={planning.masses.length}
          slotCount={planning.summary.totalSlots}
          readerCount={planning.readers.length}
          onPrevMonth={() => changeMonth(-1)}
          onNextMonth={() => changeMonth(1)}
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
          <>
            {save.leftAsDraft && (
              <p role="alert" className="mx-4 mb-2.5 rounded-2xl border border-red-100 bg-red-50 px-3 py-2.5 text-[13px] font-semibold text-red-700">
                As missas ficaram em rascunho; salve novamente ou republique.
              </p>
            )}
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
              saving={save.saving}
              onSave={save.saving ? undefined : requestSave}
              onDetail={() => setDetailOpen(true)}
              onPreview={openPreview}
            />
          </>
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

      {detailOpen && planning.phase === "suggested" && (
        <BalanceDetail
          masses={planning.masses}
          readers={planning.readers}
          stats={planning.stats}
          unavailable={planning.unavailable}
          monthLabel={monthLabel}
          onClose={() => setDetailOpen(false)}
        />
      )}

      {confirm?.kind === "unpublish" && (
        <ConfirmDialog
          title={unpublishOne ? "Voltar a missa a rascunho?" : "Voltar as missas a rascunho?"}
          message={`Ao salvar, os leitores deixam de ver ${unpublishOne ? "essa missa" : `essas ${save.unpublishCount} missas`} e os lembretes automáticos param até você republicar.`}
          confirmLabel="Voltar a rascunho e salvar"
          cancelLabel="Cancelar"
          onConfirm={() => {
            setConfirm(null)
            void save.saveDraft()
          }}
          onCancel={() => setConfirm(null)}
        />
      )}

      {confirm?.kind === "month" && (
        <ConfirmDialog
          title="Descartar alterações?"
          message="As mudanças deste mês não foram salvas. Trocar de mês descarta a sugestão, as escolhas à mão e as missas criadas, editadas ou removidas."
          confirmLabel="Descartar e trocar de mês"
          cancelLabel="Continuar planejando"
          tone="danger"
          onConfirm={() => {
            const { delta } = confirm
            setConfirm(null)
            setDetailOpen(false)
            setMonth((m) => addMonths(m, delta))
          }}
          onCancel={() => setConfirm(null)}
        />
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
