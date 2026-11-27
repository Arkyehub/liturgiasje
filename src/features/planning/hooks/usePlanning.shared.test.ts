import { act, renderHook, waitFor } from "@testing-library/react"
import { SAMPLE_STANDARD } from "../lib/testFixtures"
import { DEFAULT_LAMP_RULES } from "@/domain/models/PlannerSettings"
import { usePlanning, massToPlan, type PlanTarget } from "./usePlanning"
import { makeListSchedulesForMonth, makeListSlotHistory } from "@/main/factories/usecases/schedule"
import { makeListProfiles, makeListUnavailableForRange } from "@/main/factories/usecases/profiles"
import { serializePlanState } from "../lib/planState"
import type { Mass } from "@/domain/models/Schedule"
import type { Profile } from "@/domain/models/Profile"
import type { PlanMass } from "../lib/types"
import { planDoc, resetSync, setSync, setSyncPlan, syncSave, syncReopen, syncRetrySave } from "./planSyncTestDouble"

jest.mock("@/main/factories/usecases/schedule", () => ({
  makeListSchedulesForMonth: jest.fn(),
  makeListSlotHistory: jest.fn(),
}))
jest.mock("@/main/factories/usecases/profiles", () => ({
  makeListProfiles: jest.fn(),
  makeListUnavailableForRange: jest.fn(),
}))
jest.mock("./usePlanSync", () => jest.requireActual("./planSyncTestDouble"))
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warning: jest.fn() } }))

const DEC = new Date(2026, 11, 1)
const JAN = new Date(2027, 0, 1)
const MINE: PlanTarget = { kind: "mine", month: DEC }

const profile = (id: string): Profile => ({
  id, fullName: `Leitor ${id}`, role: "reader", authUserId: `auth-${id}`, archivedAt: null, createdAt: "2025-01-01", updatedAt: "2025-01-01",
})
const slot = (id: string, massId: string, role: string, profileId: string) => ({
  id, massId, role, profileId, isConfirmed: false, isSwapRequested: false, createdAt: "2026-11-01",
})
const mass = (id: string, date: string, time: string, isPublished: boolean, slots: ReturnType<typeof slot>[], revision = 3): Mass => ({
  id, date, time, isPublished, monthReference: date.slice(0, 7), scheduleRevision: revision, specialDescription: "", slots,
})

const draft = () => mass("d1", "2026-12-08", "19:00:00", false, [slot("s1", "d1", "C", ""), slot("s2", "d1", "1L", "")])
const published = () => mass("p1", "2026-12-06", "09:00:00", true, [slot("s3", "p1", "C", "a")])

let listMonth: jest.Mock
function setup(masses: Mass[]) {
  listMonth = jest.fn().mockResolvedValue(masses)
  ;(makeListSchedulesForMonth as jest.Mock).mockReturnValue({ execute: listMonth })
  ;(makeListSlotHistory as jest.Mock).mockReturnValue({ execute: jest.fn().mockResolvedValue([]) })
  ;(makeListProfiles as jest.Mock).mockReturnValue({ execute: jest.fn().mockResolvedValue([profile("a"), profile("b"), profile("c")]) })
  ;(makeListUnavailableForRange as jest.Mock).mockReturnValue({ execute: jest.fn().mockResolvedValue({}) })
}

beforeEach(() => {
  jest.clearAllMocks()
  resetSync()
})

const SETTINGS = { standardMasses: SAMPLE_STANDARD, lampRules: DEFAULT_LAMP_RULES, loaded: true }

async function load(target: PlanTarget | null = MINE) {
  const hook = renderHook(({ t }: { t: PlanTarget | null }) => usePlanning(t, SETTINGS), { initialProps: { t: target } })
  await waitFor(() => expect(hook.result.current.loading).toBe(false))
  await act(async () => {})
  return hook
}

/** Estado guardado já no formato do servidor (uma missa rascunho com a revisão da realidade). */
const storedDraft = (patch: Partial<PlanMass> = {}): PlanMass => ({
  ...massToPlan(draft()),
  description: "Guardada",
  ...patch,
})

describe("abertura (spec 5.4/5.6)", () => {
  test("without a stored state the plan is the real masses (published read-only) and nothing is saved", async () => {
    setup([published(), draft()])
    setSync({ plan: planDoc({ state: null }) })
    const { result } = await load()
    expect(result.current.masses.map((m) => [m.key, m.readOnly])).toEqual([["p1", true], ["d1", false]])
    expect(result.current.notices).toEqual([])
    expect(result.current.mode).toBe("edit")
    expect(result.current.readOnly).toBe(false)
    expect(syncSave).not.toHaveBeenCalled()
  })

  test("stays loading until the shared plan has resolved too", async () => {
    setup([draft()])
    setSync({ mode: "loading", plan: null })
    const hook = renderHook(() => usePlanning(MINE))
    await act(async () => {})
    expect(listMonth).toHaveBeenCalled()
    expect(hook.result.current.loading).toBe(true)
    expect(hook.result.current.masses).toEqual([])
    setSync({ plan: planDoc({ state: null }) })
    hook.rerender()
    await waitFor(() => expect(hook.result.current.loading).toBe(false))
    expect(hook.result.current.masses).toHaveLength(1)
    expect(syncSave).not.toHaveBeenCalled()
  })

  test("a stored state is reconciled with the real masses and the notices are exposed; the reconciled snapshot is not saved", async () => {
    setup([published(), draft()])
    const stored = serializePlanState([storedDraft(), { ...storedDraft({ key: "gone", id: "gone" }) }], [], true)
    setSync({ plan: planDoc({ state: stored }) })
    const { result } = await load()
    const d1 = result.current.masses.find((m) => m.key === "d1")
    expect(d1?.description).toBe("Guardada")
    expect(result.current.masses.find((m) => m.key === "gone")).toBeUndefined()
    expect(result.current.masses.find((m) => m.key === "p1")?.readOnly).toBe(true)
    expect(result.current.notices).toEqual([{ kind: "removed", dates: ["2026-12-08"] }])
    expect(result.current.phase).toBe("suggested")
    expect(syncSave).not.toHaveBeenCalled()
  })

  test("a stored state the parser rejects falls back to the real masses with an invalid-state notice", async () => {
    setup([draft()])
    setSync({ plan: planDoc({ state: { masses: "lixo" } }) })
    const { result } = await load()
    expect(result.current.masses.map((m) => m.key)).toEqual(["d1"])
    expect(result.current.notices).toEqual([{ kind: "invalid-state", dates: [] }])
    expect(syncSave).not.toHaveBeenCalled()
  })

  test("exposes the shared plan fields", async () => {
    setup([])
    setSync({ plan: planDoc({ id: "plan-9", ownerName: "Maria" }), status: "saved", externalChange: { seq: 3, concluded: false, lost: 2 } })
    const { result } = await load()
    expect(result.current).toMatchObject({
      planId: "plan-9", ownerName: "Maria", syncStatus: "saved", externalChange: { seq: 3, concluded: false, lost: 2 }, sessionId: "sessao-teste",
    })
    expect(result.current.syncPlan?.id).toBe("plan-9")
    act(() => result.current.retrySave())
    expect(syncRetrySave).toHaveBeenCalledTimes(1)
    await act(async () => result.current.reopen())
    expect(syncReopen).toHaveBeenCalledTimes(1)
  })
})

describe("autosave", () => {
  test("every plan-changing action saves once, in order, with the serialized plan (no published masses)", async () => {
    setup([published(), draft()])
    const { result } = await load()
    const expectLast = () => {
      const { masses, removedMasses, phase } = result.current
      expect(syncSave).toHaveBeenLastCalledWith(serializePlanState(masses, removedMasses, phase === "suggested"))
    }

    act(() => result.current.addMass({ key: "n", date: "2026-12-01", time: "19:00", description: "", wasPublished: false, readOnly: false, slots: [{ role: "C", profileId: "", locked: false }] }))
    expect(syncSave).toHaveBeenCalledTimes(1)
    expectLast()

    act(() => result.current.updateMass("d1", { description: "Nova" }))
    expect(syncSave).toHaveBeenCalledTimes(2)
    expectLast()

    act(() => result.current.setSlotReader("d1", 0, "a"))
    expect(syncSave).toHaveBeenCalledTimes(3)
    expectLast()

    act(() => result.current.toggleLock("d1", 0))
    expect(syncSave).toHaveBeenCalledTimes(4)
    expectLast()

    act(() => result.current.runLamp())
    expect(syncSave).toHaveBeenCalledTimes(5)
    expectLast()
    expect((syncSave.mock.calls[4][0] as { suggested: boolean }).suggested).toBe(true)

    act(() => result.current.removeMass("n"))
    expect(syncSave).toHaveBeenCalledTimes(6)
    expectLast()

    for (const [state] of syncSave.mock.calls) {
      expect((state as { masses: PlanMass[] }).masses.some((m) => m.wasPublished)).toBe(false)
    }
  })

  test("a no-op action (published mass, unchanged plan) does not save", async () => {
    setup([published(), draft()])
    const { result } = await load()
    act(() => result.current.updateMass("p1", { description: "x" }))
    act(() => result.current.setSlotReader("p1", 0, "b"))
    act(() => result.current.removeMass("p1"))
    expect(syncSave).not.toHaveBeenCalled()
  })

  test("reconciliation, month switch and a mode change never trigger a save; the new baseline is not saved either", async () => {
    setup([draft()])
    const hook = await load()
    act(() => hook.result.current.updateMass("d1", { description: "a" }))
    expect(syncSave).toHaveBeenCalledTimes(1)
    syncSave.mockClear()

    // troca de mês: recarrega, reconcilia e define nova linha de base
    listMonth.mockResolvedValue([mass("j1", "2027-01-03", "07:00:00", false, [slot("s9", "j1", "C", "")])])
    hook.rerender({ t: { kind: "mine", month: JAN } })
    await waitFor(() => expect(hook.result.current.masses.map((m) => m.key)).toEqual(["j1"]))
    await act(async () => {})

    // leitura -> edição (reabrir): documento novo, nova linha de base
    setSync({ mode: "readonly", plan: planDoc({ state: null }) })
    hook.rerender({ t: { kind: "mine", month: JAN } })
    await act(async () => {})
    setSync({ mode: "edit", plan: planDoc({ state: serializePlanState([storedDraft({ key: "j1", id: "j1", date: "2027-01-03", time: "07:00" })], [], false) }) })
    hook.rerender({ t: { kind: "mine", month: JAN } })
    await act(async () => {})
    expect(syncSave).not.toHaveBeenCalled()

    act(() => hook.result.current.updateMass("j1", { description: "depois" }))
    expect(syncSave).toHaveBeenCalledTimes(1)
  })

  test("an edit made while the plan is busy is ignored and saves nothing", async () => {
    setup([draft()])
    const { result } = await load()
    act(() => result.current.setBusy(true))
    act(() => result.current.updateMass("d1", { description: "x" }))
    expect(syncSave).not.toHaveBeenCalled()
    expect(result.current.masses[0].description).toBe("")
  })

  test("reloading the real data in edit mode keeps the plan the user already edited", async () => {
    setup([draft()])
    const { result } = await load()
    act(() => result.current.updateMass("d1", { description: "minha edição" }))
    act(() => result.current.retry())
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => {})
    expect(result.current.masses[0].description).toBe("minha edição")
    expect(syncSave).toHaveBeenCalledTimes(1)
  })
})

describe("modos sem edição", () => {
  test.each(["readonly", "concluded"] as const)("mode %s: masses are shown but every action is ignored and nothing is saved", async (mode) => {
    setup([published(), draft()])
    setSync({ mode, plan: planDoc({ state: serializePlanState([storedDraft()], [], false) }) })
    const { result } = await load()
    expect(result.current.mode).toBe(mode)
    expect(result.current.readOnly).toBe(true)
    expect(result.current.masses.map((m) => m.key)).toEqual(["p1", "d1"])
    const before = JSON.stringify(result.current.masses)
    act(() => {
      result.current.createDefaults()
      result.current.addMass({ key: "n", date: "2026-12-01", time: "19:00", description: "", wasPublished: false, readOnly: false, slots: [] })
      result.current.updateMass("d1", { description: "x" })
      result.current.removeMass("d1")
      result.current.runLamp()
      result.current.setSlotReader("d1", 0, "a")
      result.current.toggleLock("d1", 0)
    })
    expect(JSON.stringify(result.current.masses)).toBe(before)
    expect(result.current.removedMasses).toEqual([])
    expect(syncSave).not.toHaveBeenCalled()
  })

  test("kind 'other' shows the other coordinator's state reconciled with the real masses, read-only, with the owner's name", async () => {
    setup([published(), draft()])
    setSync({
      mode: "readonly",
      plan: planDoc({ id: "plan-x", isMine: false, ownerName: "Maria", state: serializePlanState([storedDraft()], [], true) }),
    })
    const { result } = await load({ kind: "other", month: DEC, planId: "plan-x" })
    expect(result.current.ownerName).toBe("Maria")
    expect(result.current.planId).toBe("plan-x")
    expect(result.current.readOnly).toBe(true)
    expect(result.current.masses.find((m) => m.key === "d1")?.description).toBe("Guardada")
    expect(result.current.masses.find((m) => m.key === "p1")?.readOnly).toBe(true)
    act(() => result.current.updateMass("d1", { description: "x" }))
    expect(result.current.masses.find((m) => m.key === "d1")?.description).toBe("Guardada")
    expect(syncSave).not.toHaveBeenCalled()
  })

  test("a newer server document in read-only mode is reconciled again", async () => {
    setup([draft()])
    setSync({ mode: "readonly", plan: planDoc({ id: "plan-x", state: serializePlanState([storedDraft()], [], false) }) })
    const hook = await load()
    expect(hook.result.current.masses[0].description).toBe("Guardada")
    setSyncPlan(planDoc({ id: "plan-x", revision: 2, state: serializePlanState([storedDraft({ description: "Atualizada" })], [], false) }))
    hook.rerender({ t: MINE })
    await waitFor(() => expect(hook.result.current.masses[0].description).toBe("Atualizada"))
    expect(syncSave).not.toHaveBeenCalled()
  })

  test.each(["unavailable", "error"] as const)("sync %s is exposed, nothing is editable or saved, real masses stay visible", async (mode) => {
    setup([draft()])
    setSync({ mode, plan: null, error: "falhou" })
    const { result } = await load()
    expect(result.current).toMatchObject({ mode, readOnly: true, syncError: "falhou", planId: null, ownerName: null })
    expect(result.current.masses.map((m) => m.key)).toEqual(["d1"])
    act(() => result.current.updateMass("d1", { description: "x" }))
    expect(result.current.masses[0].description).toBe("")
    expect(syncSave).not.toHaveBeenCalled()
  })
})

describe("missas publicadas e troca de alvo", () => {
  test("published masses stay read-only and still count for the lamp", async () => {
    setup([published(), draft()])
    const { result } = await load()
    expect(result.current.masses.find((m) => m.key === "p1")).toMatchObject({ readOnly: true, wasPublished: true })
    expect(result.current.publishedCount).toBe(1)
    expect(syncSave).not.toHaveBeenCalled()
    // leitor "a" já lê na missa publicada (carga): a lâmpada o conta e dá a vaga a outro na mesma data não conflita
    act(() => result.current.runLamp())
    expect(result.current.masses.find((m) => m.key === "p1")?.slots[0].profileId).toBe("a")
  })

  test("switching target swaps plans without leaking the old state or saving it into the new plan", async () => {
    setup([draft()])
    setSync({ plan: planDoc({ id: "plan-mine", state: serializePlanState([storedDraft()], [], false) }) })
    const hook = await load()
    expect(hook.result.current.masses[0].description).toBe("Guardada")

    setup([draft()])
    setSync({
      mode: "readonly",
      plan: planDoc({ id: "plan-y", isMine: false, ownerName: "Jorge", state: serializePlanState([storedDraft({ description: "Do Jorge" })], [], false) }),
    })
    hook.rerender({ t: { kind: "other", month: DEC, planId: "plan-y" } })
    await waitFor(() => expect(hook.result.current.ownerName).toBe("Jorge"))
    await waitFor(() => expect(hook.result.current.loading).toBe(false))
    expect(hook.result.current.masses).toHaveLength(1)
    expect(hook.result.current.masses[0].description).toBe("Do Jorge")
    expect(syncSave).not.toHaveBeenCalled()
  })

  test("target null is idle: sync idle, nothing loaded, read-only", async () => {
    setup([])
    const { result } = renderHook(() => usePlanning(null))
    await act(async () => {})
    expect(result.current).toMatchObject({ mode: "idle", loading: false, readOnly: true, planId: null, masses: [] })
    expect(listMonth).not.toHaveBeenCalled()
  })

  test("returning to a month whose shared plan is still loading (A -> B -> A) is loading, not the stale plan", async () => {
    setup([draft()])
    const hook = await load()
    expect(hook.result.current.loading).toBe(false)
    // B: leitura real que nunca chega; o sync de A volta a carregar
    listMonth.mockReturnValue(new Promise(() => {}))
    setSync({ mode: "loading", plan: null })
    hook.rerender({ t: { kind: "mine", month: JAN } })
    hook.rerender({ t: MINE })
    await act(async () => {})
    expect(hook.result.current.mode).toBe("loading")
    expect(hook.result.current.loading).toBe(true)
    expect(hook.result.current.masses).toEqual([])
  })
})

describe("falha de gravação e avisos", () => {
  test("after a failed save new edits are locked (nothing is lost silently, nothing is sent)", async () => {
    setup([draft()])
    const plan = planDoc({ state: null })
    setSync({ plan })
    const hook = await load()
    act(() => hook.result.current.updateMass("d1", { description: "a" }))
    expect(syncSave).toHaveBeenCalledTimes(1)
    setSync({ plan, status: "failed" })
    hook.rerender({ t: MINE })
    await act(async () => {})
    act(() => hook.result.current.updateMass("d1", { description: "b" }))
    act(() => hook.result.current.runLamp())
    expect(hook.result.current.masses[0].description).toBe("a")
    expect(syncSave).toHaveBeenCalledTimes(1)
  })

  test.each(["readonly", "concluded"] as const)("notices appear only in edit mode (%s shows none for the same stored state)", async (mode) => {
    setup([draft()])
    const stored = serializePlanState([storedDraft({ key: "gone", id: "gone" })], [], false)
    setSync({ mode: "edit", plan: planDoc({ state: stored }) })
    const edit = await load()
    expect(edit.result.current.notices).toEqual([{ kind: "removed", dates: ["2026-12-08"] }])
    edit.unmount()
    setSync({ mode, plan: planDoc({ state: stored }) })
    const other = await load()
    expect(other.result.current.notices).toEqual([])
    expect(other.result.current.masses.map((m) => m.key)).toEqual(["d1"])
  })
})
