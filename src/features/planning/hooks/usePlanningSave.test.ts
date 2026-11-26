import { act, renderHook, waitFor } from "@testing-library/react"
import { usePlanning } from "./usePlanning"
import { usePlanningSave } from "./usePlanningSave"
import {
  makeListSchedulesForMonth,
  makeListSlotHistory,
  makeSaveScheduleBatch,
  makeUpdateMassesStatus,
} from "@/main/factories/usecases/schedule"
import { makeListProfiles, makeListUnavailableForRange } from "@/main/factories/usecases/profiles"
import { toast } from "sonner"
import type { Mass } from "@/domain/models/Schedule"
import type { Profile } from "@/domain/models/Profile"
import { makeConcludePlan } from "@/main/factories/usecases/plans"
import { resetSync, setSync, planDoc } from "./planSyncTestDouble"

jest.mock("@/main/factories/usecases/schedule", () => ({
  makeListSchedulesForMonth: jest.fn(),
  makeListSlotHistory: jest.fn(),
  makeSaveScheduleBatch: jest.fn(),
  makeUpdateMassesStatus: jest.fn(),
}))
jest.mock("@/main/factories/usecases/plans", () => ({ makeConcludePlan: jest.fn() }))
jest.mock("@/main/factories/usecases/profiles", () => ({
  makeListProfiles: jest.fn(),
  makeListUnavailableForRange: jest.fn(),
}))
jest.mock("./usePlanSync", () => jest.requireActual("./planSyncTestDouble"))
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warning: jest.fn() } }))

const DEC = new Date(2026, 11, 1)

const profile = (id: string, extra: Partial<Profile> = {}): Profile => ({
  id,
  fullName: `Leitor ${id}`,
  role: "reader",
  authUserId: `auth-${id}`,
  archivedAt: null,
  createdAt: "2025-01-01",
  updatedAt: "2025-01-01",
  ...extra,
})

const slot = (id: string, massId: string, role: string, profileId: string) => ({
  id: `00000000-0000-4000-8000-00000000000${id}`,
  massId,
  role,
  profileId,
  isConfirmed: false,
  isSwapRequested: false,
  createdAt: "2026-11-01",
})

const mass = (id: string, date: string, time: string, isPublished: boolean, slots: ReturnType<typeof slot>[]): Mass => ({
  id,
  date,
  time,
  isPublished,
  monthReference: date.slice(0, 7),
  scheduleRevision: 3,
  specialDescription: "",
  slots,
})

let listMonth: jest.Mock
let saveBatch: jest.Mock
let updateStatus: jest.Mock
let conclude: jest.Mock

function setup(masses: Mass[], profiles: Profile[] = [profile("a"), profile("b")]) {
  listMonth = jest.fn().mockResolvedValue(masses)
  saveBatch = jest.fn().mockResolvedValue(undefined)
  updateStatus = jest.fn().mockResolvedValue(undefined)
  ;(makeListSchedulesForMonth as jest.Mock).mockReturnValue({ execute: listMonth })
  ;(makeListSlotHistory as jest.Mock).mockReturnValue({ execute: jest.fn().mockResolvedValue([]) })
  ;(makeListProfiles as jest.Mock).mockReturnValue({ execute: jest.fn().mockResolvedValue(profiles) })
  ;(makeListUnavailableForRange as jest.Mock).mockReturnValue({ execute: jest.fn().mockResolvedValue({}) })
  ;(makeSaveScheduleBatch as jest.Mock).mockReturnValue({ execute: saveBatch })
  ;(makeUpdateMassesStatus as jest.Mock).mockReturnValue({ execute: updateStatus })
  conclude = jest.fn().mockResolvedValue(undefined)
  ;(makeConcludePlan as jest.Mock).mockReturnValue({ execute: conclude })
}

function usePage(month: Date, overrides: { planId?: string | null } = {}) {
  const planning = usePlanning({ kind: "mine", month })
  const save = usePlanningSave({
    month,
    masses: planning.masses,
    removedMasses: planning.removedMasses,
    readerNames: planning.readerNames,
    planId: "planId" in overrides ? overrides.planId! : planning.planId,
    session: planning.sessionId,
    enabled: planning.mode === "edit",
    loading: planning.loading,
    error: planning.error,
    reload: planning.retry,
  })
  return { planning, save }
}

async function load(month = DEC) {
  const hook = renderHook(({ m }) => usePage(m), { initialProps: { m: month } })
  await waitFor(() => expect(hook.result.current.planning.loading).toBe(false))
  return hook
}

const draft = () => mass("m1", "2026-12-06", "07:00:00", false, [slot("1", "m1", "C", ""), slot("2", "m1", "1L", "")])
const published = () => mass("p1", "2026-12-06", "09:00:00", true, [slot("3", "p1", "C", "a")])

beforeEach(() => {
  jest.clearAllMocks()
  resetSync()
})
afterEach(() => jest.restoreAllMocks())

/** Falhas de gravação são registradas no console; só nos testes de falha. */
const quietErrors = () => jest.spyOn(console, "error").mockImplementation(() => {})


/** Missa real que o plano aberto não conhece (outro coordenador gravou depois). */
const otherDraft = (revision = 7) => ({ ...mass("o1", "2026-12-06", "11:00:00", false, [slot("5", "o1", "C", "b")]), scheduleRevision: revision })

async function saveOk(result: { current: ReturnType<typeof usePage> }) {
  let ok = false
  await act(async () => {
    await result.current.save.prepareSave()
    ok = await result.current.save.saveDraft()
  })
  return ok
}

test("without real drafts to replace, prepareSave needs no confirmation and saveDraft writes ONE batch, never touching publication", async () => {
  setup([draft(), published()])
  const { result } = await load()
  act(() => result.current.planning.runLamp())
  const filled = result.current.planning.masses.find((m) => m.id === "m1")!.slots.map((s) => s.profileId)

  let prep = { needsConfirm: true }
  await act(async () => {
    prep = await result.current.save.prepareSave()
  })
  expect(prep.needsConfirm).toBe(false)
  expect(result.current.save.replacement).toBeNull()
  expect(saveBatch).not.toHaveBeenCalled()

  let ok = false
  await act(async () => {
    ok = await result.current.save.saveDraft()
  })
  expect(ok).toBe(true)
  expect(updateStatus).not.toHaveBeenCalled()
  expect(saveBatch).toHaveBeenCalledTimes(1)
  const [entries, removed] = saveBatch.mock.calls[0]
  expect(removed).toEqual([])
  // a missa publicada (somente leitura) nunca entra no lote
  expect(entries).toHaveLength(1)
  expect(entries[0]).toMatchObject({ massId: "m1", massData: { expectedRevision: 3, date: "2026-12-06", time: "07:00:00" } })
  expect(entries[0].slots.map((s: { profileId: string }) => s.profileId)).toEqual(filled)
  expect(toast.success).toHaveBeenCalledWith("Rascunho salvo.")
  await waitFor(() => expect(listMonth).toHaveBeenCalledTimes(3)) // abertura + prepareSave + recarga
})

test("prepareSave reads the real masses now and reports the drafts that saving would replace", async () => {
  setup([draft()])
  const { result } = await load()
  expect(listMonth).toHaveBeenCalledTimes(1)
  listMonth.mockResolvedValue([draft(), otherDraft(), published()])

  let prep = { needsConfirm: false }
  await act(async () => {
    prep = await result.current.save.prepareSave()
  })
  expect(listMonth).toHaveBeenCalledTimes(2)
  expect(prep.needsConfirm).toBe(true)
  expect(result.current.save.replacement).toEqual({ count: 1, dates: ["2026-12-06"] })
  expect(saveBatch).not.toHaveBeenCalled()

  act(() => result.current.save.cancelSave())
  expect(result.current.save.replacement).toBeNull()
})

test("saveDraft deletes the replaced drafts that are not in the plan with their CURRENT revision and refreshes the plan revisions, in one call", async () => {
  setup([draft()])
  const { result } = await load()
  act(() => result.current.planning.runLamp())
  // no banco agora: m1 ganhou revisão 4 e existe um rascunho novo "o1" (revisão 7) que o plano não conhece
  listMonth.mockResolvedValue([{ ...draft(), scheduleRevision: 4 }, otherDraft(7), published()])

  expect(await saveOk(result)).toBe(true)
  expect(saveBatch).toHaveBeenCalledTimes(1)
  const [entries, removed] = saveBatch.mock.calls[0]
  expect(updateStatus).not.toHaveBeenCalled()
  expect(removed).toEqual([{ id: "o1", expectedRevision: 7 }])
  expect(entries).toHaveLength(1)
  expect(entries[0].massId).toBe("m1")
  expect(entries[0].massData.expectedRevision).toBe(4)
  expect(entries.some((e: { massId?: string }) => e.massId === "p1")).toBe(false)
})

test("a replaced draft that is also in the plan is updated, not deleted", async () => {
  setup([draft()])
  const { result } = await load()
  listMonth.mockResolvedValue([{ ...draft(), scheduleRevision: 5 }])
  let prep = { needsConfirm: false }
  await act(async () => {
    prep = await result.current.save.prepareSave()
  })
  expect(prep.needsConfirm).toBe(true) // revisão mudou desde a abertura
  await act(async () => {
    await result.current.save.saveDraft()
  })
  const [entries, removed] = saveBatch.mock.calls[0]
  expect(removed).toEqual([])
  expect(entries[0]).toMatchObject({ massId: "m1", massData: { expectedRevision: 5 } })
})

test("masses the plan removed on purpose are deleted once, with their real revision", async () => {
  setup([draft()])
  const { result } = await load()
  act(() => result.current.planning.removeMass("m1"))
  listMonth.mockResolvedValue([{ ...draft(), scheduleRevision: 6 }])

  expect(await saveOk(result)).toBe(true)
  const [entries, removed] = saveBatch.mock.calls[0]
  expect(entries).toEqual([])
  expect(removed).toHaveLength(1)
  expect(removed[0]).toMatchObject({ id: "m1" })
})

test("saveDraft without a previous prepareSave reads the real masses itself", async () => {
  setup([draft()])
  const { result } = await load()
  listMonth.mockResolvedValue([draft(), otherDraft(9)])
  await act(async () => {
    await result.current.save.saveDraft()
  })
  expect(saveBatch.mock.calls[0][1]).toEqual([{ id: "o1", expectedRevision: 9 }])
  expect(listMonth).toHaveBeenCalledTimes(3) // abertura + leitura do salvar + recarga
  await waitFor(() => expect(result.current.planning.loading).toBe(false))
})

test("after saving, the plan is concluded with its id and session and the month reloads", async () => {
  setup([draft()])
  const { result } = await load()
  expect(await saveOk(result)).toBe(true)
  expect(conclude).toHaveBeenCalledTimes(1)
  expect(conclude).toHaveBeenCalledWith("plan-1", "sessao-teste")
  expect(conclude.mock.invocationCallOrder[0]).toBeGreaterThan(saveBatch.mock.invocationCallOrder[0])
  await waitFor(() => expect(listMonth).toHaveBeenCalledTimes(3))
})

test("without a planId nothing is concluded", async () => {
  setup([draft()])
  const hook = renderHook(() => usePage(DEC, { planId: null }))
  await waitFor(() => expect(hook.result.current.planning.loading).toBe(false))
  const { result } = hook
  expect(await saveOk(result)).toBe(true)
  expect(saveBatch).toHaveBeenCalledTimes(1)
  expect(conclude).not.toHaveBeenCalled()
})

test("a ConcludePlan failure is retried twice more and never reported as a save error", async () => {
  setup([draft()])
  const errors = quietErrors()
  const { result } = await load()
  conclude.mockRejectedValue(new Error("rede"))
  expect(await saveOk(result)).toBe(true)
  expect(conclude).toHaveBeenCalledTimes(3)
  expect(toast.error).not.toHaveBeenCalled()
  expect(toast.success).toHaveBeenCalledWith("Rascunho salvo.")
  await waitFor(() => expect(listMonth).toHaveBeenCalledTimes(3))
  errors.mockRestore()
})

test("a ConcludePlan that succeeds on the retry stops retrying", async () => {
  setup([draft()])
  quietErrors()
  const { result } = await load()
  conclude.mockRejectedValueOnce(new Error("rede")).mockResolvedValue(undefined)
  expect(await saveOk(result)).toBe(true)
  expect(conclude).toHaveBeenCalledTimes(2)
})

test("a schedule_conflict shows the scheduleErrorMessage text, keeps the plan intact, does not conclude and does not reload", async () => {
  setup([draft()])
  const { result } = await load()
  act(() => result.current.planning.runLamp())
  const before = result.current.planning.masses
  saveBatch.mockRejectedValueOnce({ message: "schedule_conflict" })
  const errors = quietErrors()

  expect(await saveOk(result)).toBe(false)
  expect(toast.error).toHaveBeenCalledWith("A escala foi alterada. Atualize a página e tente novamente.")
  expect(toast.success).not.toHaveBeenCalled()
  expect(conclude).not.toHaveBeenCalled()
  expect(updateStatus).not.toHaveBeenCalled()
  expect(result.current.planning.masses).toEqual(before)
  expect(result.current.planning.phase).toBe("suggested")
  expect(result.current.save.saving).toBe(false)
  expect(listMonth).toHaveBeenCalledTimes(2) // abertura + prepareSave; sem recarga
  expect(errors).toHaveBeenCalled()
})

test("a failed read in prepareSave writes nothing and reports an error", async () => {
  setup([draft()])
  const { result } = await load()
  listMonth.mockRejectedValue(new Error("rede"))
  const errors = quietErrors()
  await act(async () => {
    await expect(result.current.save.prepareSave()).rejects.toThrow()
  })
  expect(toast.error).toHaveBeenCalledWith("Não foi possível ler as missas do mês. Tente novamente.")
  expect(saveBatch).not.toHaveBeenCalled()
  errors.mockRestore()
})

test("double clicks save only once", async () => {
  setup([draft()])
  const { result } = await load()
  let resolve: () => void = () => {}
  saveBatch.mockReturnValueOnce(new Promise<void>((r) => (resolve = r)))

  let first: Promise<boolean> = Promise.resolve(false)
  let second = true
  await act(async () => {
    first = result.current.save.saveDraft()
    second = await result.current.save.saveDraft()
  })
  expect(second).toBe(false)
  expect(result.current.save.saving).toBe(true)
  await act(async () => {
    resolve()
    await first
  })
  expect(saveBatch).toHaveBeenCalledTimes(1)
  await waitFor(() => expect(result.current.planning.loading).toBe(false))
})

test("when not in edit mode nothing is read or written", async () => {
  setup([draft()])
  setSync({ mode: "readonly", plan: planDoc({ status: "em_andamento", isMine: false }) })
  const { result } = await load()
  const reads = listMonth.mock.calls.length
  let prep = { needsConfirm: true }
  let ok = true
  await act(async () => {
    prep = await result.current.save.prepareSave()
    ok = await result.current.save.saveDraft()
  })
  expect(prep.needsConfirm).toBe(false)
  expect(ok).toBe(false)
  expect(listMonth).toHaveBeenCalledTimes(reads)
  expect(saveBatch).not.toHaveBeenCalled()
  expect(conclude).not.toHaveBeenCalled()
})

test("while the month is loading saveDraft writes nothing", async () => {
  setup([draft()])
  setSync({ mode: "loading", plan: null })
  const hook = renderHook(() => usePage(DEC))
  let ok = true
  await act(async () => {
    ok = await hook.result.current.save.saveDraft()
  })
  expect(ok).toBe(false)
  expect(saveBatch).not.toHaveBeenCalled()
})

test("previewText builds the WhatsApp text with the names of the whole month, archived readers included", async () => {
  setup(
    [mass("m1", "2026-12-06", "07:00:00", false, [slot("1", "m1", "C", "x"), slot("2", "m1", "1L", "")])],
    [profile("a"), profile("x", { fullName: "Leitora Arquivada", archivedAt: "2026-10-01" })],
  )
  const { result } = await load()
  const text = result.current.save.previewText()
  expect(text).toContain("*PRÉVIA – Escala de Dezembro/2026 (não publicada)*")
  expect(text).toContain("C - Leitora Arquivada")
  expect(text).toContain("1L - ---")
})
