"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { format, startOfMonth } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { useAuth } from "@/shared/hooks/useAuth"
import { usePlanning, type PlanTarget } from "@/features/planning/hooks/usePlanning"
import { usePlannerSettings } from "@/features/planning/hooks/usePlannerSettings"
import { SettingsSheet } from "@/features/planning/ui/SettingsSheet"
import { NotebookList } from "@/features/planning/ui/NotebookList"
import { PublishedNotice } from "@/features/planning/ui/PublishedNotice"
import { PlanChooser } from "@/features/planning/ui/PlanChooser"
import { ReadOnlyBanner, type ReadOnlyReason } from "@/features/planning/ui/ReadOnlyBanner"
import { SaveIndicator } from "@/features/planning/ui/SaveIndicator"
import { PlanningNotices, sortedDayMonth } from "@/features/planning/ui/PlanningNotices"
import { PlanningHeader } from "@/features/planning/ui/PlanningHeader"
import { PlanningFooter } from "@/features/planning/ui/PlanningFooter"
import { otherMassTimes } from "@/features/planning/lib/massConflicts"
import { MassSheet } from "@/features/planning/ui/MassSheet"
import { SuggestionList } from "@/features/planning/ui/SuggestionList"
import { BalanceDetail } from "@/features/planning/ui/BalanceDetail"
import { SaveDraftDrawer } from "@/features/planning/ui/SaveDraftDrawer"
import { usePlanningSave } from "@/features/planning/hooks/usePlanningSave"

function Loading({ text }: { text: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-stone-400">
      <Loader2 className="h-8 w-8 animate-spin text-amber-600" />
      <p className="text-sm font-medium">{text}</p>
    </div>
  )
}

// Só alimenta usePlanningSave enquanto nenhum planejamento foi escolhido (ele fica inativo: loading verdadeiro).
const IDLE_MONTH = new Date(0)

const targetKey = (t: PlanTarget) => `${t.kind}:${format(t.month, "yyyy-MM")}:${t.kind === "other" ? t.planId : ""}`

function Message({ text, onBack, tone }: { text: string; onBack: () => void; tone: "error" | "info" }) {
  return (
    <div role={tone === "error" ? "alert" : "status"} className="mx-4 mt-6 rounded-3xl border border-stone-200 bg-stone-50 p-5 text-center">
      <p className="text-[15px] font-bold text-stone-800">{text}</p>
      <button
        type="button"
        onClick={onBack}
        className="mt-4 min-h-12 rounded-2xl bg-stone-800 px-5 text-[15px] font-bold text-white transition-transform active:scale-95"
      >
        Voltar à lista
      </button>
    </div>
  )
}

function PlanningScreen() {
  // Nenhum planejamento até o admin escolher: sem alvo não há leitura de missas nem de leitores.
  const [target, setTarget] = useState<PlanTarget | null>(null)
  const month = target?.month ?? null
  const key = target ? targetKey(target) : null
  const settings = usePlannerSettings()
  const planningSettings = useMemo(
    () => ({
      standardMasses: settings.standardMasses,
      lampRules: settings.lampRules,
      // Lâmpada e missas padrão esperam a leitura terminar (qualquer resultado: lido, indisponível ou com erro).
      loaded: settings.status !== "loading",
    }),
    [settings.standardMasses, settings.lampRules, settings.status],
  )
  const planning = usePlanning(target, planningSettings)
  const [settingsOpen, setSettingsOpen] = useState(false)
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
    onConcluded: planning.markConcluded,
  })
  // Enquanto grava, o plano em memória fica congelado: a recarga depois de gravar descartaria edições feitas agora.
  const { setBusy } = planning
  useEffect(() => {
    setBusy(save.saving)
  }, [save.saving, setBusy])
  // Outro aparelho do mesmo dono gravou (ou concluiu) o planejamento: a tela já foi atualizada; só avisa.
  const { externalChange } = planning
  useEffect(() => {
    if (!externalChange) return
    if (externalChange.lost > 0) {
      toast.warning(
        externalChange.lost === 1
          ? "Planejamento alterado em outro aparelho. Sua última edição não foi aplicada: refaça se necessário."
          : `Planejamento alterado em outro aparelho. ${externalChange.lost} edições suas não foram aplicadas: refaça se necessário.`,
      )
    } else if (externalChange.concluded) {
      toast.info("Planejamento concluído em outro aparelho.")
    } else {
      toast.info("Planejamento atualizado: alterado em outro aparelho.")
    }
  }, [externalChange])
  const [confirmSave, setConfirmSave] = useState(false)
  // Leitura das missas reais em andamento (antes do aviso de substituição): o planejamento não pode ser trocado nesse intervalo.
  const [preparing, setPreparing] = useState(false)
  // Outro planejamento nunca herda a confirmação do anterior (o botão de troca já é ignorado nesses casos; isto é a rede de segurança).
  useEffect(() => {
    setConfirmSave(false)
  }, [key])
  // A confirmação de substituição só faz sentido em edição: se a reserva foi perdida (ou o plano concluído) ela é descartada.
  const { cancelSave } = save
  const inEdit = planning.mode === "edit"
  useEffect(() => {
    if (inEdit) return
    setConfirmSave(false)
    cancelSave()
  }, [inEdit, cancelSave])
  // O aviso informativo de publicadas é mostrado uma vez por planejamento aberto.
  const [ackedKey, setAckedKey] = useState<string | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  // "new" = criando; string = chave da missa em edição; null = fechado.
  const [sheet, setSheet] = useState<"new" | string | null>(null)
  const editing = sheet && sheet !== "new" ? planning.masses.find((m) => m.key === sheet && !m.readOnly) : undefined
  const sheetOpen = !planning.readOnly && (sheet === "new" || !!editing)

  // Antes de escolher só aparece a lista: sem cabeçalho de mês, lista de missas, rodapé nem avisos.
  if (!target || !month || !key) {
    return (
      <div className="min-h-screen bg-white font-sans text-stone-900">
        <main className="mx-auto max-w-md">
          <PlanChooser
            current={startOfMonth(new Date())}
            session={planning.sessionId}
            onOpenMine={(m) => setTarget({ kind: "mine", month: m })}
            onViewOther={(plan) =>
              setTarget({ kind: "other", month: new Date(`${plan.monthReference}-01T12:00:00`), planId: plan.id })
            }
          />
        </main>
      </div>
    )
  }

  const monthName = format(month, "MMMM", { locale: ptBR })
  const monthLabel = `${monthName.charAt(0).toUpperCase()}${monthName.slice(1)} ${format(month, "yyyy")}`
  const readOnly = planning.readOnly

  // O planejamento é guardado a cada alteração: voltar à lista não perde nada, só é ignorado enquanto grava.
  const leave = () => {
    setDetailOpen(false)
    setSheet(null)
    setAckedKey(null)
    setTarget(null)
  }
  const leaveBlocked = save.saving || preparing || confirmSave || planning.syncStatus === "saving" || planning.syncStatus === "failed"

  let bannerReason: ReadOnlyReason | null = null
  if (!planning.loading && (planning.mode === "edit" || planning.mode === "readonly" || planning.mode === "concluded")) {
    if (target.kind === "other") bannerReason = "other-owner"
    else if (planning.mode === "concluded") bannerReason = "concluded"
  }
  const publishedDates = planning.masses.filter((m) => m.readOnly).map((m) => m.date)
  const showPublishedNotice =
    !planning.loading && !planning.error && planning.publishedCount > 0 && ackedKey !== key &&
    (planning.mode === "edit" || planning.mode === "readonly" || planning.mode === "concluded")

  // Lê as missas reais agora: se salvar substituiria rascunhos existentes, confirma antes de gravar.
  const requestSave = async () => {
    if (readOnly) return
    setPreparing(true)
    try {
      const { proceed } = await save.prepareSave()
      // Sempre confirma (evita toque errado); se houver rascunhos a substituir, o aviso vem na mesma gaveta.
      if (proceed) setConfirmSave(true)
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

  if (planning.mode === "unavailable") {
    return (
      <div className="min-h-screen bg-white font-sans text-stone-900">
        <main className="mx-auto max-w-md">
          <Message tone="info" text="Planejamento compartilhado indisponível neste ambiente." onBack={leave} />
        </main>
      </div>
    )
  }
  if (planning.mode === "error") {
    return (
      <div className="min-h-screen bg-white font-sans text-stone-900">
        <main className="mx-auto max-w-md">
          <Message tone="error" text={planning.syncError ?? "Não foi possível abrir o planejamento."} onBack={leave} />
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white pb-28 font-sans text-stone-900">
      {bannerReason && (
        <ReadOnlyBanner
          reason={bannerReason}
          ownerName={planning.ownerName}
          lastSeen={planning.syncPlan?.updatedAt ?? null}
          onReopen={bannerReason === "other-owner" ? undefined : () => void planning.reopen()}
        />
      )}
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
          onChangePlan={leave}
          changeDisabled={leaveBlocked}
          onCreateDefaults={planning.createDefaults}
          createDefaultsDisabled={!planning.canCreateDefaults}
          createDefaultsHint={planning.createDefaultsHint}
          onOpenSettings={planning.mode === "edit" ? () => setSettingsOpen(true) : undefined}
          onAddMass={() => setSheet("new")}
          actionsDisabled={planning.loading || planning.error || readOnly}
        />
        {planning.mode === "edit" && (
          <div className="px-4">
            <SaveIndicator status={planning.syncStatus} onRetry={planning.retrySave} />
          </div>
        )}
        {planning.mode === "edit" && <PlanningNotices key={key} notices={planning.notices} />}
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
              readOnly={readOnly}
              onSave={save.saving || readOnly ? undefined : () => void requestSave()}
              onDetail={() => setDetailOpen(true)}
              onPreview={openPreview}
            />
          </>
        ) : (
          <NotebookList masses={planning.masses} onSelectMass={readOnly ? undefined : setSheet} />
        )}
      </main>

      {sheetOpen && (
        <MassSheet
          key={editing?.key ?? "new"}
          month={month}
          mass={editing}
          existing={otherMassTimes(planning.masses, editing?.key)}
          published={otherMassTimes(planning.masses.filter((m) => m.readOnly), editing?.key)}
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

      {settingsOpen && planning.mode === "edit" && (
        <SettingsSheet
          status={settings.status}
          standardMasses={settings.standardMasses}
          lampRules={settings.lampRules}
          error={settings.error}
          onSave={settings.save}
          onClose={() => setSettingsOpen(false)}
          onRetry={settings.reload}
        />
      )}

      {planning.phase === "planning" && (
        <PlanningFooter emptySlots={planning.summary.empty} onLamp={planning.loading || planning.error || readOnly ? undefined : planning.runLamp} />
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

      {confirmSave && (
        <SaveDraftDrawer
          monthLabel={`${monthName.charAt(0).toUpperCase()}${monthName.slice(1)}`}
          replacementCount={replacementCount}
          replacementDates={replacementDates}
          onConfirm={() => {
            setConfirmSave(false)
            void save.saveDraft()
          }}
          onCancel={() => {
            setConfirmSave(false)
            save.cancelSave()
          }}
        />
      )}

      {showPublishedNotice && (
        <PublishedNotice
          count={planning.publishedCount}
          monthName={monthName}
          dates={sortedDayMonth([...new Set(publishedDates)])}
          onAcknowledge={() => setAckedKey(key)}
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
