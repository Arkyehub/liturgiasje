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
import { MonthChooser } from "@/features/planning/ui/MonthChooser"
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

// Só alimenta usePlanningSave enquanto nenhum mês foi escolhido (ele fica inativo: loading verdadeiro).
const IDLE_MONTH = new Date(0)

function PlanningScreen() {
  // Nenhum mês até o admin escolher: sem mês não há leitura nem aviso de missas publicadas.
  const [month, setMonth] = useState<Date | null>(null)
  const planning = usePlanning(month ? { kind: "mine", month } : null)
  const save = usePlanningSave({
    month: month ?? IDLE_MONTH,
    masses: planning.masses,
    removedMasses: planning.removedMasses,
    readerNames: planning.readerNames,
    planId: planning.planId,
    session: planning.sessionId,
    enabled: planning.mode === "edit",
    loading: planning.loading || month === null,
    error: planning.error,
    reload: planning.retry,
  })
  // Enquanto grava, o plano em memória fica congelado: a recarga depois de gravar descartaria edições feitas agora.
  const { setBusy } = planning
  useEffect(() => {
    setBusy(save.saving)
  }, [save.saving, setBusy])
  const [confirmReplace, setConfirmReplace] = useState(false)
  // Leitura das missas reais em andamento (antes do aviso de substituição): o mês não pode mudar nesse intervalo.
  const [preparing, setPreparing] = useState(false)
  // Outro mês nunca herda a confirmação do anterior (o botão de mês já é ignorado nesses casos; isto é a rede de segurança).
  useEffect(() => {
    setConfirmReplace(false)
  }, [month])
  const [detailOpen, setDetailOpen] = useState(false)
  // "new" = criando; string = chave da missa em edição; null = fechado.
  const [sheet, setSheet] = useState<"new" | string | null>(null)
  const editing = sheet && sheet !== "new" ? planning.masses.find((m) => m.key === sheet && !m.readOnly) : undefined
  const sheetOpen = sheet === "new" || !!editing

  // Antes de escolher o mês só aparece a escolha: sem cabeçalho de mês, lista, rodapé nem avisos.
  if (!month) {
    return (
      <div className="min-h-screen bg-white font-sans text-stone-900">
        <main className="mx-auto max-w-md">
          <MonthChooser current={startOfMonth(new Date())} onChoose={setMonth} />
        </main>
      </div>
    )
  }

  const monthName = format(month, "MMMM", { locale: ptBR })
  const monthLabel = `${monthName.charAt(0).toUpperCase()}${monthName.slice(1)} ${format(month, "yyyy")}`

  // O planejamento é guardado a cada alteração: trocar de mês não perde nada, só é ignorado enquanto grava.
  const changeMonth = (delta: number) => {
    if (save.saving || preparing || confirmReplace) return
    setDetailOpen(false)
    setMonth((m) => (m ? addMonths(m, delta) : m))
  }
  // Lê as missas reais agora: se salvar substituiria rascunhos existentes, confirma antes de gravar.
  const requestSave = async () => {
    setPreparing(true)
    try {
      const { needsConfirm } = await save.prepareSave()
      if (needsConfirm) setConfirmReplace(true)
      else void save.saveDraft()
    } catch {
      // prepareSave já avisou o erro e nada foi gravado.
    } finally {
      setPreparing(false)
    }
  }
  // noopener/noreferrer: a aba do WhatsApp não ganha acesso a esta janela (nem ao referrer do painel admin).
  const openPreview = () => window.open(`https://wa.me/?text=${encodeURIComponent(save.previewText())}`, "_blank", "noopener,noreferrer")
  const replacementDates = (save.replacement?.dates ?? []).map((d) => format(new Date(`${d}T00:00:00`), "dd/MM")).join(", ")
  const replacementCount = save.replacement?.count ?? 0

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
              onSave={save.saving ? undefined : () => void requestSave()}
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

      {confirmReplace && save.replacement && (
        <ConfirmDialog
          title="Substituir o rascunho existente?"
          message={`Já existe uma escala em rascunho em ${monthName.charAt(0).toUpperCase()}${monthName.slice(1)} (${replacementCount} ${replacementCount === 1 ? "missa" : "missas"}: ${replacementDates}). Salvar vai substituir essas missas pelas deste planejamento. Missas publicadas não serão tocadas.`}
          confirmLabel="Substituir e salvar"
          cancelLabel="Cancelar"
          tone="danger"
          onConfirm={() => {
            setConfirmReplace(false)
            void save.saveDraft()
          }}
          onCancel={() => {
            setConfirmReplace(false)
            save.cancelSave()
          }}
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
