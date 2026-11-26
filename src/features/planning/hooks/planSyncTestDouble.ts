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
export const syncRelease = jest.fn()

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
  openElsewhere: false,
  revision: 1,
  state: null,
  ...extra,
})

const base = (): UsePlanSyncResult => ({
  mode: "edit",
  plan: planDoc(),
  holderLastSeen: null,
  status: "idle",
  lostChanges: 0,
  error: null,
  sessionId: "sessao-teste",
  save: syncSave,
  retrySave: syncRetrySave,
  reopen: syncReopen,
  release: syncRelease,
})

let current: UsePlanSyncResult = base()

export function setSync(patch: Partial<UsePlanSyncResult> = {}) {
  current = { ...base(), ...patch }
}

export function resetSync() {
  syncSave.mockClear()
  syncRetrySave.mockClear()
  syncReopen.mockClear()
  syncRelease.mockClear()
  current = base()
  forMonth.clear()
}

/** Troca só o documento (simula releitura do servidor); mantém o resto. */
export function setSyncPlan(plan: PlanDocument | null) {
  current = { ...current, plan }
}

const forMonth = new Map<string, UsePlanSyncResult & { __source?: UsePlanSyncResult }>()

/** O documento acompanha o mês pedido (como o servidor faria); identidade estável por (estado, mês). */
export function usePlanSync(target: { kind: "mine"; month: string } | { kind: "other"; planId: string } | null): UsePlanSyncResult {
  if (!target) return { ...base(), mode: "idle", plan: null }
  if (target.kind !== "mine" || !current.plan) return current
  const key = target.month
  const cached = forMonth.get(key)
  if (cached && cached.__source === current) return cached
  const next = Object.assign({ ...current, plan: { ...current.plan, monthReference: key } }, { __source: current })
  forMonth.set(key, next)
  return next
}
