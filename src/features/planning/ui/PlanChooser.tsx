"use client"

import { addMonths, differenceInHours, format, formatDistanceToNowStrict, startOfMonth } from "date-fns"
import { ptBR } from "date-fns/locale"
import { useCallback, useEffect, useState } from "react"

import { PlanError, planErrorMessage, type PlanListItem } from "@/domain/models/SchedulePlan"
import { makeCopyPlan, makeDiscardPlan, makeListPlans, makeReopenPlan } from "@/main/factories/usecases/plans"

import { ConfirmDialog } from "./ConfirmDialog"

interface PlanChooserProps {
  /** Mês atual. As opções são ele, o seguinte (sugerido) e o subsequente. */
  current: Date
  /** Identificador do aparelho (usePlanSync.sessionId). */
  session: string
  onOpenMine: (month: Date) => void
  onViewOther: (plan: PlanListItem) => void
}

type Pending =
  | { kind: "discard"; plan: PlanListItem }
  | { kind: "overwrite"; source: PlanListItem; month: Date }

const monthKey = (month: Date) => format(month, "yyyy-MM")
const monthName = (month: Date) => format(month, "MMMM", { locale: ptBR })
const monthTitle = (month: Date) => `${monthName(month).charAt(0).toUpperCase()}${monthName(month).slice(1)} ${format(month, "yyyy")}`

function ago(iso: string) {
  return formatDistanceToNowStrict(new Date(iso), { locale: ptBR, addSuffix: true })
}

function expires(iso: string) {
  const days = Math.max(0, Math.ceil(differenceInHours(new Date(iso), new Date(), { roundingMethod: "ceil" }) / 24))
  if (days === 0) return "expira hoje"
  return days === 1 ? "expira em 1 dia" : `expira em ${days} dias`
}

const outline =
  "min-h-11 rounded-2xl border border-stone-200 bg-white px-4 text-sm font-bold text-stone-700 transition-transform active:scale-95 disabled:opacity-50"
const solid =
  "min-h-11 rounded-2xl bg-stone-800 px-4 text-sm font-bold text-white transition-transform active:scale-95 disabled:opacity-50"

/** Primeira tela do planejamento: para cada um dos 3 meses, os planejamentos de todos os coordenadores. */
export function PlanChooser({ current, session, onOpenMine, onViewOther }: PlanChooserProps) {
  const base = startOfMonth(current)
  const baseKey = monthKey(base)
  const [plans, setPlans] = useState<PlanListItem[] | null>(null)
  const [loadError, setLoadError] = useState<unknown>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<Pending | null>(null)

  const load = useCallback(async () => {
    const months = [0, 1, 2].map((delta) => monthKey(addMonths(new Date(`${baseKey}-01T12:00:00`), delta)))
    try {
      setPlans(await makeListPlans().execute(months))
      setLoadError(null)
    } catch (error) {
      setLoadError(error)
    }
  }, [baseKey])

  useEffect(() => {
    void load()
  }, [load])

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setActionError(null)
    try {
      await action()
    } catch (error) {
      setActionError(planErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  function copy(source: PlanListItem, month: Date, overwrite: boolean) {
    return run(async () => {
      await makeCopyPlan().execute(source.id, session, overwrite)
      onOpenMine(month)
    })
  }

  function reopen(plan: PlanListItem, month: Date) {
    return run(async () => {
      await makeReopenPlan().execute(plan.id, session)
      onOpenMine(month)
    })
  }

  function discard(plan: PlanListItem) {
    return run(async () => {
      await makeDiscardPlan().execute(plan.id)
      await load()
    })
  }

  const unavailable = loadError instanceof PlanError && loadError.code === "unavailable"

  return (
    <section className="flex flex-col gap-4 px-4 pb-6 pt-4">
      <h1 className="text-xl font-black tracking-tight text-stone-900">Planejamento de Escala</h1>
      <div className="flex flex-col gap-1">
        <h2 className="text-[22px] font-black tracking-tight text-stone-900">Qual mês você vai planejar?</h2>
        <p className="text-sm text-stone-600">A escala costuma ser feita com um mês de antecedência.</p>
      </div>

      {loadError !== null && unavailable && (
        <p role="alert" className="rounded-2xl border border-stone-200 bg-stone-50 p-4 text-sm font-medium text-stone-700">
          {planErrorMessage(loadError)}
        </p>
      )}

      {loadError !== null && !unavailable && (
        <div role="alert" className="flex flex-col items-start gap-3 rounded-2xl border border-red-100 bg-red-50 p-4">
          <p className="text-sm font-medium text-red-800">{planErrorMessage(loadError)}</p>
          <button type="button" onClick={() => void load()} className={outline}>
            Tentar novamente
          </button>
        </div>
      )}

      {loadError === null && plans === null && (
        <div role="status" aria-label="Carregando planejamentos" className="flex justify-center py-8">
          <span className="size-8 animate-spin rounded-full border-4 border-stone-200 border-t-stone-700" />
        </div>
      )}

      {actionError && (
        <p role="alert" className="rounded-2xl border border-red-100 bg-red-50 p-3 text-sm font-medium text-red-800">
          {actionError}
        </p>
      )}

      {loadError === null && plans !== null && (
        <div className="flex flex-col gap-4">
          {[0, 1, 2].map((delta) => {
            const month = addMonths(base, delta)
            const key = monthKey(month)
            const headingId = `plan-month-${key}`
            const monthPlans = plans.filter((p) => p.monthReference === key)
            const mine = monthPlans.find((p) => p.isMine)
            const others = monthPlans.filter((p) => !p.isMine)
            return (
              <section
                key={key}
                aria-labelledby={headingId}
                className={`flex flex-col gap-3 rounded-2xl border p-4 ${delta === 1 ? "border-amber-200 bg-amber-50" : "border-stone-100 bg-white"}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <h3 id={headingId} className="text-[17px] font-bold text-stone-900">
                    {monthTitle(month)}
                  </h3>
                  {delta === 1 && (
                    <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-amber-600">
                      Sugerido
                    </span>
                  )}
                </div>

                {mine ? (
                  <div className="flex flex-col gap-2">
                    <p className="text-sm text-stone-700">
                      Meu planejamento · editado {ago(mine.updatedAt)} · {expires(mine.expiresAt)}
                    </p>
                    {mine.status === "concluido" && mine.concludedAt && (
                      <p className="text-xs text-stone-500">
                        Concluído por {mine.ownerName} em {format(new Date(mine.concludedAt), "dd/MM")}
                      </p>
                    )}
                    {mine.openElsewhere && <p className="text-xs font-bold text-amber-700">Aberto em outro aparelho</p>}
                    <div className="flex flex-wrap gap-2">
                      {mine.status === "concluido" ? (
                        <button type="button" disabled={busy} onClick={() => void reopen(mine, month)} className={solid}>
                          Reabrir
                        </button>
                      ) : (
                        <button type="button" disabled={busy} onClick={() => onOpenMine(month)} className={solid}>
                          Abrir
                        </button>
                      )}
                      <button type="button" disabled={busy} onClick={() => setPending({ kind: "discard", plan: mine })} className={outline}>
                        Descartar
                      </button>
                    </div>
                  </div>
                ) : (
                  <button type="button" disabled={busy} onClick={() => onOpenMine(month)} className={`${solid} self-start`}>
                    Criar meu planejamento
                  </button>
                )}

                {others.map((other) => (
                  <div key={other.id} className="flex flex-col gap-2 border-t border-stone-100 pt-3">
                    <p className="text-sm text-stone-700">
                      {other.ownerName} · editado {ago(other.updatedAt)} · {expires(other.expiresAt)}
                    </p>
                    {other.copiedFromName && <p className="text-xs text-stone-500">copiado de {other.copiedFromName}</p>}
                    {other.status === "concluido" && other.concludedAt && (
                      <p className="text-xs text-stone-500">
                        Concluído por {other.ownerName} em {format(new Date(other.concludedAt), "dd/MM")}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <button type="button" disabled={busy} onClick={() => onViewOther(other)} className={outline}>
                        Ver
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => (mine ? setPending({ kind: "overwrite", source: other, month }) : void copy(other, month, false))}
                        className={outline}
                      >
                        Duplicar para mim
                      </button>
                    </div>
                  </div>
                ))}
              </section>
            )
          })}
        </div>
      )}

      {pending?.kind === "discard" && (
        <ConfirmDialog
          title="Descartar planejamento?"
          message={`O seu planejamento de ${monthName(new Date(`${pending.plan.monthReference}-01T12:00:00`))} será apagado.`}
          confirmLabel="Descartar"
          cancelLabel="Cancelar"
          tone="danger"
          onConfirm={() => {
            const plan = pending.plan
            setPending(null)
            void discard(plan)
          }}
          onCancel={() => setPending(null)}
        />
      )}
      {pending?.kind === "overwrite" && (
        <ConfirmDialog
          title="Duplicar para mim?"
          message={`Isso substitui o seu planejamento de ${monthName(pending.month)}.`}
          confirmLabel="Substituir"
          cancelLabel="Cancelar"
          tone="danger"
          onConfirm={() => {
            const { source, month } = pending
            setPending(null)
            void copy(source, month, true)
          }}
          onCancel={() => setPending(null)}
        />
      )}
    </section>
  )
}
