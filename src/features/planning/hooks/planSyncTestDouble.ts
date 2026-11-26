/**
 * Dublê de teste do `usePlanSync` (nenhuma rede). Uso nos testes:
 *   jest.mock("<caminho>/usePlanSync", () => jest.requireActual("<caminho>/planSyncTestDouble"))
 * Cada teste ajusta o estado com `setSync(...)` ANTES de renderizar e confere `syncSave`.
 */
import type { PlanDocument } from "@/domain/models/SchedulePlan"
import type { UsePlanSyncResult } from "./usePlanSync"

export const syncSave = jest.fn()
export const syncRetrySave = jest.fn()
export const syncReopen = jest.fn().mockResolvedValue(undefined)
export const syncMarkConcluded = jest.fn().mockResolvedValue(undefined)

export const planDoc = (extra: Partial<PlanDocument> = {}): PlanDocument => ({
  id: "plan-1",
  monthReference: "2026-12",
  ownerProfileId: "owner-1",
  ownerName: "Coordenador Teste",
  isMine: true,
  status: "em_andamento",
  createdAt: "2026-11-01T00:00:00Z",
  updatedAt: "2026-11-01T00:00:00Z",
  expiresAt: "2027-01-01T00:00:00Z",
  copiedFromName: null,
  concludedAt: null,
  hasContent: true,
  revision: 1,
  state: null,
  ...extra,
})

const base = (): UsePlanSyncResult => ({
  mode: "edit",
  plan: planDoc(),
  status: "idle",
  externalChange: null,
  error: null,
  sessionId: "sessao-teste",
  save: syncSave,
  retrySave: syncRetrySave,
  reopen: syncReopen,
  markConcluded: syncMarkConcluded,
})

let current: UsePlanSyncResult = base()

export function setSync(patch: Partial<UsePlanSyncResult> = {}) {
  current = { ...base(), ...patch }
}

export function resetSync() {
  syncSave.mockClear()
  syncRetrySave.mockClear()
  syncReopen.mockClear()
  syncMarkConcluded.mockClear()
  current = base()
}

/** Troca só o documento (simula releitura do servidor); mantém o resto. */
export function setSyncPlan(plan: PlanDocument | null) {
  current = { ...current, plan }
}

const planCopies = new WeakMap<PlanDocument, Map<string, PlanDocument>>()

/** O documento acompanha o mês pedido (como o servidor faria); a mesma entrada devolve sempre o MESMO objeto. */
export function usePlanSync(target: { kind: "mine"; month: string } | { kind: "other"; planId: string } | null): UsePlanSyncResult {
  if (!target) return { ...base(), mode: "idle", plan: null }
  if (target.kind !== "mine" || !current.plan) return current
  let perMonth = planCopies.get(current.plan)
  if (!perMonth) planCopies.set(current.plan, (perMonth = new Map()))
  let doc = perMonth.get(target.month)
  if (!doc) perMonth.set(target.month, (doc = { ...current.plan, monthReference: target.month }))
  return doc === current.plan ? current : { ...current, plan: doc }
}
