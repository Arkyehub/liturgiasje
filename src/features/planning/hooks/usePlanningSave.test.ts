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
import { resetSync } from "./planSyncTestDouble"

jest.mock("@/main/factories/usecases/schedule", () => ({
  makeListSchedulesForMonth: jest.fn(),
  makeListSlotHistory: jest.fn(),
  makeSaveScheduleBatch: jest.fn(),
  makeUpdateMassesStatus: jest.fn(),
}))
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
}

function usePage(month: Date) {
  const planning = usePlanning({ kind: "mine", month })
  const save = usePlanningSave({
    month,
    masses: planning.masses,
    removedMasses: planning.removedMasses,
    readerNames: planning.readerNames,
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

test("dirty is false right after loading and becomes true after a change", async () => {
  setup([draft()])
  const { result } = await load()
  expect(result.current.save.dirty).toBe(false)
  act(() => result.current.planning.runLamp())
  expect(result.current.save.dirty).toBe(true)
})

test("accepting published masses changes nothing: they stay read-only, so there is nothing to save or unpublish", async () => {
  setup([published()])
  const { result } = await load()
  act(() => result.current.planning.acceptPublished())
  expect(result.current.save.dirty).toBe(false)
  expect(result.current.save.unpublishCount).toBe(0)
  expect(result.current.planning.masses[0]).toMatchObject({ id: "p1", wasPublished: true, readOnly: true })
})

test("saveDraft without published masses saves the batch once, never touches publication and reloads the month", async () => {
  setup([draft()])
  const { result } = await load()
  act(() => result.current.planning.runLamp())
  const filled = result.current.planning.masses[0].slots.map((s) => s.profileId)

  let ok = false
  await act(async () => {
    ok = await result.current.save.saveDraft()
  })
  expect(ok).toBe(true)
  expect(updateStatus).not.toHaveBeenCalled()
  expect(saveBatch).toHaveBeenCalledTimes(1)
  const [entries, removed] = saveBatch.mock.calls[0]
  expect(removed).toEqual([])
  expect(entries).toHaveLength(1)
  expect(entries[0]).toMatchObject({ massId: "m1", massData: { expectedRevision: 3, date: "2026-12-06", time: "07:00:00" } })
  expect(entries[0].slots.map((s: { profileId: string }) => s.profileId)).toEqual(filled)
  expect(toast.success).toHaveBeenCalledWith("Rascunho salvo.")

  // recarrega o mês para atualizar ids e revisões
  await waitFor(() => expect(listMonth).toHaveBeenCalledTimes(2))
  await waitFor(() => expect(result.current.planning.loading).toBe(false))
  expect(result.current.save.dirty).toBe(false)
})

test("a schedule_conflict shows the scheduleErrorMessage text, keeps the plan intact and does not reload", async () => {
  setup([draft()])
  const { result } = await load()
  act(() => result.current.planning.runLamp())
  const before = result.current.planning.masses
  saveBatch.mockRejectedValueOnce({ message: "schedule_conflict" })
  const errors = quietErrors()

  let ok = true
  await act(async () => {
    ok = await result.current.save.saveDraft()
  })
  expect(ok).toBe(false)
  expect(toast.error).toHaveBeenCalledWith("A escala foi alterada. Atualize a página e tente novamente.")
  expect(result.current.planning.masses).toEqual(before)
  expect(result.current.planning.phase).toBe("suggested")
  expect(result.current.save.dirty).toBe(true)
  expect(result.current.save.saving).toBe(false)
  expect(listMonth).toHaveBeenCalledTimes(1)
  expect(errors).toHaveBeenCalled()
})

test("double clicks save only once", async () => {
  setup([draft()])
  const { result } = await load()
  act(() => result.current.planning.runLamp())
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

test("switching month resets dirty", async () => {
  setup([draft()])
  const hook = await load()
  act(() => hook.result.current.planning.runLamp())
  expect(hook.result.current.save.dirty).toBe(true)
  hook.rerender({ m: new Date(2027, 0, 1) })
  await waitFor(() => expect(hook.result.current.planning.loading).toBe(false))
  expect(hook.result.current.save.dirty).toBe(false)
})
