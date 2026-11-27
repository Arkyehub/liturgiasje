"use client"

import { useState } from "react"
import { Plus, Trash2 } from "lucide-react"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/shared/ui/sheet"
import {
  DEFAULT_LAMP_RULES,
  LAMP_RULE_KEYS,
  PLANNER_ROLES,
  type LampRules,
  type PlannerRoleCode,
  type StandardMass,
} from "@/domain/models/PlannerSettings"
import type { PlannerSettingsStatus } from "../hooks/usePlannerSettings"

const DAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"]

const ROLE_LABEL: Record<PlannerRoleCode, string> = {
  C: "Comentarista",
  "1L": "1ª Leitura",
  "2L": "2ª Leitura",
  L: "Leitura única",
  P: "Preces",
}

const RULE_LABEL: Record<keyof LampRules, string> = {
  balance: "Equilibrar a carga entre os leitores",
  preferences: "Respeitar preferências de dia e horário",
  affinity: "Combinar o leitor com a função que ele mais faz",
  sameDay: "Evitar o mesmo leitor duas vezes no mesmo dia",
  weekends: "Evitar fins de semana seguidos",
  history: "Dar mais vagas a quem serviu menos nos meses anteriores",
}

const TIME = /^([01][0-9]|2[0-3]):[0-5][0-9]$/

interface Row {
  id: number
  weekday: number
  time: string
  roles: PlannerRoleCode[]
}

interface SettingsSheetProps {
  status: PlannerSettingsStatus
  standardMasses: StandardMass[]
  lampRules: LampRules
  /** Mensagem do último erro de leitura ou de gravação. */
  error: string | null
  /** Grava; true = gravou (o painel fecha), false = falhou (o painel fica aberto e mostra `error`). */
  onSave: (standardMasses: StandardMass[], lampRules: LampRules) => Promise<boolean>
  onClose: () => void
  onRetry: () => void
}

let nextId = 1
const toRows = (masses: StandardMass[]): Row[] => masses.map((m) => ({ id: nextId++, weekday: m.weekday, time: m.time, roles: [...m.roles] }))

function rowProblem(row: Row, rows: Row[]): string | null {
  if (!TIME.test(row.time)) return "Informe um horário válido."
  if (row.roles.length === 0) return "Marque ao menos uma função."
  if (rows.some((r) => r.id !== row.id && r.weekday === row.weekday && r.time === row.time)) return "Já existe este horário neste dia."
  return null
}

const sameRules = (a: LampRules, b: LampRules) => LAMP_RULE_KEYS.every((k) => a[k] === b[k])

/** Painel de configuração do coordenador: missas padrão por dia da semana e regras da lâmpada. Salvar/Cancelar. */
export function SettingsSheet({ status, standardMasses, lampRules, error, onSave, onClose, onRetry }: SettingsSheetProps) {
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" className="max-h-[92vh] gap-0 overflow-y-auto rounded-t-[28px] bg-white p-0 sm:mx-auto sm:max-w-md">
        <SheetHeader className="gap-1 px-5 pb-2 pt-5">
          <SheetTitle className="text-xl font-black tracking-tight text-stone-900">Configurações do planejamento</SheetTitle>
          <SheetDescription className="text-xs text-stone-600">Valem só para você, em todos os meses.</SheetDescription>
        </SheetHeader>

        {status === "loading" && <p className="px-5 py-8 text-center text-sm font-medium text-stone-600">Carregando suas configurações...</p>}

        {status === "unavailable" && (
          <p role="status" className="mx-5 my-6 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm font-medium text-stone-700">
            Configurações indisponíveis neste ambiente.
          </p>
        )}

        {status === "error" && (
          <div role="alert" className="mx-5 my-6 flex flex-col items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
            <p className="text-sm font-bold text-red-700">{error ?? "Não foi possível ler suas configurações."}</p>
            <button
              type="button"
              onClick={onRetry}
              className="min-h-11 rounded-2xl bg-stone-800 px-4 text-sm font-bold text-white transition-transform active:scale-95"
            >
              Tentar novamente
            </button>
          </div>
        )}

        {status === "ready" && (
          <SettingsForm standardMasses={standardMasses} lampRules={lampRules} error={error} onSave={onSave} onClose={onClose} />
        )}

        {(status === "unavailable" || status === "error" || status === "loading") && (
          <div className="sticky bottom-0 border-t border-stone-200 bg-white px-5 py-4">
            <button
              type="button"
              onClick={onClose}
              className="min-h-12 w-full rounded-2xl border border-stone-200 bg-white px-4 text-[15px] font-bold text-stone-700 transition-transform active:scale-95"
            >
              Fechar
            </button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

function SettingsForm({
  standardMasses,
  lampRules,
  error,
  onSave,
  onClose,
}: Pick<SettingsSheetProps, "standardMasses" | "lampRules" | "error" | "onSave" | "onClose">) {
  // Estado de edição inicial = o que está gravado; o formulário só monta depois da leitura.
  const [rows, setRows] = useState<Row[]>(() => toRows(standardMasses))
  const [rules, setRules] = useState<LampRules>(lampRules)
  const [saving, setSaving] = useState(false)
  const [initialRows] = useState(() => JSON.stringify(standardMasses.map((m) => [m.weekday, m.time, m.roles.join(",")])))

  const snapshot = JSON.stringify(rows.map((r) => [r.weekday, r.time, PLANNER_ROLES.filter((x) => r.roles.includes(x)).join(",")]))
  const dirty = snapshot !== initialRows || !sameRules(rules, lampRules)
  const problems = new Map(rows.map((r) => [r.id, rowProblem(r, rows)]))
  const invalid = [...problems.values()].some(Boolean)

  const update = (id: number, patch: Partial<Row>) => setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  const toggleRole = (row: Row, role: PlannerRoleCode) => {
    let roles = row.roles.includes(role) ? row.roles.filter((r) => r !== role) : [...row.roles, role]
    // Leitura única não convive com 1ª e 2ª leituras.
    if (!row.roles.includes(role)) {
      if (role === "L") roles = roles.filter((r) => r !== "1L" && r !== "2L")
      if (role === "1L" || role === "2L") roles = roles.filter((r) => r !== "L")
    }
    update(row.id, { roles })
  }

  const save = async () => {
    if (saving || invalid || !dirty) return
    setSaving(true)
    const masses: StandardMass[] = [...rows]
      .sort((a, b) => a.weekday - b.weekday || a.time.localeCompare(b.time))
      .map((r) => ({ weekday: r.weekday, time: r.time, roles: PLANNER_ROLES.filter((x) => r.roles.includes(x)) }))
    const ok = await onSave(masses, rules)
    setSaving(false)
    if (ok) onClose()
  }

  return (
    <>
      <div className="flex flex-col gap-6 px-5 pb-4 pt-2">
        <section aria-labelledby="settings-masses" className="flex flex-col gap-4">
          <div>
            <h2 id="settings-masses" className="text-base font-black text-stone-900">
              Missas padrão
            </h2>
            <p className="text-xs text-stone-600">Usadas por &quot;Criar Missas Padrões no mês&quot;. Nenhuma vem pronta: cadastre a estrutura da sua igreja.</p>
          </div>
          {DAYS.map((day, weekday) => {
            const ofDay = rows.filter((r) => r.weekday === weekday)
            return (
              <div key={day} className="flex flex-col gap-2 border-t border-stone-200 pt-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-extrabold text-stone-800">{day}</h3>
                  <button
                    type="button"
                    aria-label={`Adicionar horário na ${day.toLowerCase()}`}
                    onClick={() => setRows((prev) => [...prev, { id: nextId++, weekday, time: "", roles: [] }])}
                    className="flex min-h-11 items-center gap-1 text-[13px] font-bold text-stone-900 underline decoration-stone-300 underline-offset-4"
                  >
                    <Plus aria-hidden="true" className="h-4 w-4" />
                    horário
                  </button>
                </div>
                {ofDay.length === 0 && <p className="text-xs text-stone-500">Nenhuma missa neste dia.</p>}
                {ofDay.map((row, n) => {
                  const problem = problems.get(row.id)
                  return (
                    <div key={row.id} className="flex flex-col gap-2 rounded-2xl border border-stone-200 p-3">
                      <div className="flex items-center gap-2">
                        <input
                          type="time"
                          aria-label={`Horário ${n + 1} de ${day}`}
                          value={row.time}
                          onChange={(e) => update(row.id, { time: e.target.value })}
                          className="min-h-11 flex-1 rounded-2xl border border-stone-300 bg-white px-3 text-[15px] font-semibold tabular-nums text-stone-900"
                        />
                        <button
                          type="button"
                          aria-label={`Remover horário ${n + 1} de ${day}`}
                          onClick={() => setRows((prev) => prev.filter((r) => r.id !== row.id))}
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-red-700 transition-colors active:bg-red-50"
                        >
                          <Trash2 aria-hidden="true" className="h-[18px] w-[18px]" />
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1">
                        {PLANNER_ROLES.map((role) => (
                          <label key={role} className="flex min-h-11 items-center gap-2 text-[14px] font-semibold text-stone-900">
                            <input
                              type="checkbox"
                              aria-label={`Função ${role} - horário ${n + 1} de ${day}`}
                              checked={row.roles.includes(role)}
                              onChange={() => toggleRole(row, role)}
                              className="h-5 w-5 accent-stone-900"
                            />
                            <span className="font-black">{role}</span>
                            <span className="sr-only">{ROLE_LABEL[role]}</span>
                          </label>
                        ))}
                      </div>
                      {problem && (
                        <p role="alert" className="text-xs font-bold text-red-700">
                          {problem}
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </section>

        <section aria-labelledby="settings-rules" className="flex flex-col gap-1 border-t-2 border-stone-900 pt-4">
          <h2 id="settings-rules" className="text-base font-black text-stone-900">
            Regras da lâmpada
          </h2>
          {LAMP_RULE_KEYS.map((key) => (
            <label key={key} className="flex min-h-11 items-center gap-3 text-[15px] font-semibold text-stone-900">
              <input
                type="checkbox"
                checked={rules[key]}
                onChange={(e) => setRules((prev) => ({ ...prev, [key]: e.target.checked }))}
                className="h-5 w-5 shrink-0 accent-stone-900"
              />
              {RULE_LABEL[key]}
            </label>
          ))}
          <p className="pt-1 text-xs text-stone-600">Sempre valem: indisponibilidade na data, um leitor por missa e vagas travadas.</p>
          <button
            type="button"
            onClick={() => setRules({ ...DEFAULT_LAMP_RULES })}
            className="mt-1 flex min-h-11 items-center self-start text-[13px] font-bold text-amber-700 underline underline-offset-4"
          >
            Restaurar regras padrão
          </button>
        </section>

        {error && (
          <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
            {error}
          </p>
        )}
      </div>

      <div className="sticky bottom-0 flex flex-col gap-2 border-t border-stone-200 bg-white px-5 py-4">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || invalid || !dirty}
          aria-busy={saving}
          className="min-h-12 rounded-2xl bg-stone-900 px-5 text-[15px] font-bold text-white transition-transform active:scale-95 disabled:opacity-40"
        >
          {saving ? "Salvando..." : "Salvar"}
        </button>
        <button
          type="button"
          onClick={onClose}
          disabled={saving}
          className="min-h-12 rounded-2xl border border-stone-200 bg-white px-4 text-[15px] font-bold text-stone-700 transition-transform active:scale-95 disabled:opacity-50"
        >
          Cancelar
        </button>
      </div>
    </>
  )
}
