import { act, renderHook, waitFor } from "@testing-library/react"
import { usePlanning, massToPlan, type PlanTarget } from "./usePlanning"
import { makeListSchedulesForMonth, makeListSlotHistory } from "@/main/factories/usecases/schedule"
import { makeListProfiles, makeListUnavailableForRange } from "@/main/factories/usecases/profiles"
import { serializePlanState } from "../lib/planState"
import type { Mass } from "@/domain/models/Schedule"
import type { Profile } from "@/domain/models/Profile"
import type { PlanDocument } from "@/domain/models/SchedulePlan"

// Este arquivo usa o usePlanSync REAL (sem o dublê): só a rede é simulada.
const mockUc = {
  open: jest.fn(),
  get: jest.fn(),
  save: jest.fn(),
  heartbeat: jest.fn(),
  release: jest.fn(),
  reopen: jest.fn(),
}
jest.mock("@/main/factories/usecases/plans", () => ({
  makeOpenPlan: () => ({ execute: (...a: unknown[]) => mockUc.open(...a) }),
  makeGetPlan: () => ({ execute: (...a: unknown[]) => mockUc.get(...a) }),
  makeSavePlan: () => ({ execute: (...a: unknown[]) => mockUc.save(...a) }),
  makeHeartbeatPlan: () => ({ execute: (...a: unknown[]) => mockUc.heartbeat(...a) }),
  makeReleasePlan: () => ({ execute: (...a: unknown[]) => mockUc.release(...a) }),
  makeReopenPlan: () => ({ execute: (...a: unknown[]) => mockUc.reopen(...a) }),
}))
jest.mock("@/main/factories/usecases/schedule", () => ({
  makeListSchedulesForMonth: jest.fn(),
  makeListSlotHistory: jest.fn(),
}))
jest.mock("@/main/factories/usecases/profiles", () => ({
  makeListProfiles: jest.fn(),
  makeListUnavailableForRange: jest.fn(),
}))
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warning: jest.fn() } }))

const DEC = new Date(2026, 11, 1)
const MINE: PlanTarget = { kind: "mine", month: DEC }

const profile = (id: string): Profile => ({
  id, fullName: `Leitor ${id}`, role: "reader", authUserId: `auth-${id}`, archivedAt: null, createdAt: "2025-01-01", updatedAt: "2025-01-01",
})
const realDraft: Mass = {
  id: "d1", date: "2026-12-08", time: "19:00:00", isPublished: false, monthReference: "2026-12", scheduleRevision: 3, specialDescription: "",
  slots: [{ id: "s1", massId: "d1", role: "C", profileId: "", isConfirmed: false, isSwapRequested: false, createdAt: "2026-11-01" }],
}

const doc = (revision: number, over: Partial<PlanDocument> = {}): PlanDocument => ({
  id: "plan-1", monthReference: "2026-12", ownerProfileId: "owner-1", ownerName: "Coordenador Teste", isMine: true, status: "em_andamento",
  createdAt: "2026-11-01T00:00:00Z", updatedAt: "2026-11-01T00:00:00Z", expiresAt: "2027-01-01T00:00:00Z", copiedFromName: null,
  concludedAt: null, hasContent: true, revision, state: null, ...over,
})

beforeEach(() => {
  jest.clearAllMocks()
  window.sessionStorage.clear()
  ;(makeListSchedulesForMonth as jest.Mock).mockReturnValue({ execute: jest.fn().mockResolvedValue([realDraft]) })
  ;(makeListSlotHistory as jest.Mock).mockReturnValue({ execute: jest.fn().mockResolvedValue([]) })
  ;(makeListProfiles as jest.Mock).mockReturnValue({ execute: jest.fn().mockResolvedValue([profile("a")]) })
  ;(makeListUnavailableForRange as jest.Mock).mockReturnValue({ execute: jest.fn().mockResolvedValue({}) })
  mockUc.open.mockResolvedValue({ mode: "edit", plan: doc(1) })
  mockUc.save.mockResolvedValue(2)
  mockUc.heartbeat.mockResolvedValue(undefined)
  mockUc.release.mockResolvedValue(undefined)
})

test("after markConcluded the planning is concluded, edits are ignored, no notices and nothing is sent or released", async () => {
  const { result } = renderHook(() => usePlanning(MINE))
  await waitFor(() => expect(result.current.loading).toBe(false))
  expect(result.current.mode).toBe("edit")

  act(() => result.current.updateMass("d1", { description: "Festa" }))
  await waitFor(() => expect(mockUc.save).toHaveBeenCalledTimes(1))
  await waitFor(() => expect(result.current.syncStatus).toBe("saved"))

  // O servidor concluiu (ConcludePlan) e devolve o mesmo conteúdo já guardado.
  const savedState = serializePlanState(
    [{ ...massToPlan(realDraft), description: "Festa" }],
    [],
    false,
  )
  mockUc.get.mockResolvedValue(doc(2, { status: "concluido", concludedAt: "2026-11-26T12:00:00Z", state: savedState }))
  await act(async () => {
    await result.current.markConcluded()
  })

  await waitFor(() => expect(result.current.mode).toBe("concluded"))
  expect(result.current.readOnly).toBe(true)
  expect(result.current.notices).toEqual([])
  expect(result.current.syncStatus).toBe("idle")
  expect(result.current.masses.find((m) => m.key === "d1")?.description).toBe("Festa")

  act(() => result.current.updateMass("d1", { description: "Outra" }))
  await act(async () => {})
  expect(result.current.masses.find((m) => m.key === "d1")?.description).toBe("Festa")
  expect(mockUc.save).toHaveBeenCalledTimes(1)
  expect(mockUc.release).not.toHaveBeenCalled()
  expect(result.current.notices).toEqual([])
})
