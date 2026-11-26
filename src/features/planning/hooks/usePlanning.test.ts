import { act, renderHook, waitFor } from "@testing-library/react"
import { usePlanning } from "./usePlanning"
import { makeListSchedulesForMonth, makeListSlotHistory } from "@/main/factories/usecases/schedule"
import { makeListProfiles, makeListUnavailableForRange } from "@/main/factories/usecases/profiles"
import type { Mass } from "@/domain/models/Schedule"
import type { Profile } from "@/domain/models/Profile"

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

beforeEach(() => jest.clearAllMocks())

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
  id,
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
let listHistory: jest.Mock
let listProfiles: jest.Mock
let listUnavailable: jest.Mock

function setup(masses: Mass[], profiles: Profile[] = [profile("a"), profile("b")]) {
  listMonth = jest.fn().mockResolvedValue(masses)
  listHistory = jest.fn().mockResolvedValue([{ date: "2026-11-03", role: "C", profileId: "a" }])
  listProfiles = jest.fn().mockResolvedValue(profiles)
  listUnavailable = jest.fn().mockResolvedValue({ "2026-12-06": ["b"] })
  ;(makeListSchedulesForMonth as jest.Mock).mockReturnValue({ execute: listMonth })
  ;(makeListSlotHistory as jest.Mock).mockReturnValue({ execute: listHistory })
  ;(makeListProfiles as jest.Mock).mockReturnValue({ execute: listProfiles })
  ;(makeListUnavailableForRange as jest.Mock).mockReturnValue({ execute: listUnavailable })
}

async function load(month = DEC) {
  const hook = renderHook(() => usePlanning(month))
  await waitFor(() => expect(hook.result.current.loading).toBe(false))
  return hook
}

test("loads the month as admin, 12 months of history before it and the month's unavailability", async () => {
  setup([])
  const { result } = await load()
  expect(listMonth).toHaveBeenCalledWith(DEC, true)
  expect(listHistory).toHaveBeenCalledWith("2025-12-01", "2026-11-30")
  expect(listUnavailable).toHaveBeenCalledWith("2026-12-01", "2026-12-31")
  expect(result.current.unavailable).toEqual({ "2026-12-06": ["b"] })
})

test("with month=null the hook is idle: no reads, nothing loading, every action is a no-op", async () => {
  setup([])
  const { result } = renderHook(() => usePlanning(null))
  await act(async () => {})
  expect(makeListSchedulesForMonth).not.toHaveBeenCalled()
  expect(makeListProfiles).not.toHaveBeenCalled()
  expect(makeListSlotHistory).not.toHaveBeenCalled()
  expect(makeListUnavailableForRange).not.toHaveBeenCalled()
  expect(result.current).toMatchObject({ loading: false, error: false, publishedCount: 0, phase: "planning", masses: [], readers: [] })
  act(() => {
    result.current.createDefaults()
    result.current.addMass({ key: "k", date: "2026-12-06", time: "07:00", description: "", wasPublished: false, readOnly: false, slots: [] })
    result.current.runLamp()
    result.current.retry()
    result.current.acceptPublished()
  })
  await act(async () => {})
  expect(result.current.masses).toEqual([])
  expect(result.current.publishedDecision).toBe("pending")
  expect(result.current.phase).toBe("planning")
  expect(makeListSchedulesForMonth).not.toHaveBeenCalled()
})

test("going from idle to a chosen month loads that month exactly like before", async () => {
  setup([])
  const hook = renderHook(({ m }: { m: Date | null }) => usePlanning(m), { initialProps: { m: null as Date | null } })
  await act(async () => {})
  expect(listMonth).not.toHaveBeenCalled()
  hook.rerender({ m: DEC })
  expect(hook.result.current.loading).toBe(true)
  await waitFor(() => expect(hook.result.current.loading).toBe(false))
  expect(listMonth).toHaveBeenCalledWith(DEC, true)
  expect(listHistory).toHaveBeenCalledWith("2025-12-01", "2026-11-30")
  expect(listUnavailable).toHaveBeenCalledWith("2026-12-01", "2026-12-31")
})

test("every active reader is eligible, with or without a linked account; archived ones are not; stats for each", async () => {
  setup([], [profile("a"), profile("b", { archivedAt: "2026-01-01" }), profile("c", { authUserId: null })])
  const { result } = await load()
  expect(result.current.readers.map((r) => r.id)).toEqual(["a", "c"])
  expect(Object.keys(result.current.stats)).toEqual(["a", "c"])
})

test("the lamp suggests an active reader without a linked account, never an archived one", async () => {
  setup(
    [mass("m1", "2026-12-08", "19:00:00", false, [slot("s1", "m1", "C", "")])],
    [profile("x", { archivedAt: "2026-01-01" }), profile("y", { authUserId: null })],
  )
  const { result } = await load()
  act(() => result.current.runLamp())
  expect(result.current.masses[0].slots[0].profileId).toBe("y")
  // a escolha à mão também aceita o leitor sem conta e recusa o arquivado
  act(() => result.current.setSlotReader("m1", 0, "x"))
  expect(result.current.masses[0].slots[0].profileId).toBe("y")
})

test("maps existing masses: filled slots locked, time as HH:mm, published masses read-only", async () => {
  setup([
    mass("m2", "2026-12-06", "09:00:00", false, [slot("s3", "m2", "C", "")]),
    mass("m1", "2026-12-06", "07:00:00", true, [slot("s2", "m1", "1L", ""), slot("s1", "m1", "C", "a")]),
  ])
  const { result } = await load()
  const [first, second] = result.current.masses
  expect(first).toMatchObject({ key: "m1", id: "m1", time: "07:00", wasPublished: true, readOnly: true, scheduleRevision: 3 })
  expect(first.slots).toEqual([
    { id: "s1", role: "C", profileId: "a", locked: true },
    { id: "s2", role: "1L", profileId: "", locked: false },
  ])
  expect(second).toMatchObject({ key: "m2", time: "09:00", wasPublished: false, readOnly: false })
  expect(result.current.publishedCount).toBe(1)
  expect(result.current.summary).toMatchObject({ totalSlots: 3, filled: 1, empty: 2, locked: 1 })
})

test("createDefaults fills December 2026 with 25 masses / 82 slots on an empty month", async () => {
  setup([])
  const { result } = await load()
  act(() => result.current.createDefaults())
  expect(result.current.masses).toHaveLength(25)
  expect(result.current.summary.totalSlots).toBe(82)
})

test("createDefaults does not duplicate an existing mass whose time came from Postgres as HH:mm:ss", async () => {
  setup([mass("m1", "2026-12-06", "07:00:00", false, [slot("s1", "m1", "C", "")])])
  const { result } = await load()
  act(() => result.current.createDefaults())
  expect(result.current.masses).toHaveLength(25)
  expect(result.current.masses.filter((m) => m.date === "2026-12-06" && m.time === "07:00")).toHaveLength(1)
  // continua em ordem cronológica
  const order = result.current.masses.map((m) => `${m.date}_${m.time}`)
  expect(order).toEqual([...order].sort())
})

test("acceptPublished makes published masses editable; declinePublished keeps them read-only", async () => {
  const published = [
    mass("m1", "2026-12-06", "07:00:00", true, [slot("s1", "m1", "C", "a")]),
    mass("m2", "2026-12-06", "09:00:00", true, [slot("s2", "m2", "C", "")]),
  ]
  setup(published)
  const accepted = await load()
  expect(accepted.result.current.publishedDecision).toBe("pending")
  act(() => accepted.result.current.acceptPublished())
  expect(accepted.result.current.masses.every((m) => !m.readOnly && m.wasPublished)).toBe(true)
  expect(accepted.result.current.publishedDecision).toBe("included")
  accepted.unmount()

  setup(published)
  const declined = await load()
  act(() => declined.result.current.declinePublished())
  expect(declined.result.current.masses.every((m) => m.readOnly)).toBe(true)
  expect(declined.result.current.publishedDecision).toBe("kept")
})

test("addMass, updateMass and removeMass edit the plan; read-only masses are untouched", async () => {
  setup([
    mass("pub", "2026-12-06", "07:00:00", true, [slot("s1", "pub", "C", "a")]),
    mass("draft", "2026-12-08", "19:00:00", false, [slot("s2", "draft", "C", "")]),
  ])
  const { result } = await load()

  act(() =>
    result.current.addMass({
      key: "2026-12-01_19:00",
      date: "2026-12-01",
      time: "19:00",
      description: "",
      wasPublished: false,
      readOnly: false,
      slots: [{ role: "C", profileId: "", locked: false }],
    }),
  )
  expect(result.current.masses.map((m) => m.key)).toEqual(["2026-12-01_19:00", "pub", "draft"])

  act(() => result.current.updateMass("draft", { description: "Imaculada Conceição" }))
  expect(result.current.masses.find((m) => m.key === "draft")?.description).toBe("Imaculada Conceição")

  act(() => result.current.updateMass("pub", { description: "x" }))
  act(() => result.current.removeMass("pub"))
  expect(result.current.masses.find((m) => m.key === "pub")?.description).toBe("")

  act(() => result.current.removeMass("draft"))
  expect(result.current.masses.map((m) => m.key)).toEqual(["2026-12-01_19:00", "pub"])
  expect(result.current.removedMasses.map((m) => m.id)).toEqual(["draft"])
})

test("switching month reloads and resets the plan and the published decision", async () => {
  setup([mass("m1", "2026-12-06", "07:00:00", true, [slot("s1", "m1", "C", "a")])])
  const hook = renderHook(({ month }) => usePlanning(month), { initialProps: { month: DEC } })
  await waitFor(() => expect(hook.result.current.loading).toBe(false))
  act(() => hook.result.current.declinePublished())

  listMonth.mockResolvedValue([])
  const JAN = new Date(2027, 0, 1)
  hook.rerender({ month: JAN })
  expect(hook.result.current.loading).toBe(true)
  expect(hook.result.current.masses).toEqual([])
  await waitFor(() => expect(hook.result.current.loading).toBe(false))
  expect(listMonth).toHaveBeenLastCalledWith(JAN, true)
  expect(listHistory).toHaveBeenLastCalledWith("2026-01-01", "2026-12-31")
  expect(hook.result.current.publishedDecision).toBe("pending")
  expect(hook.result.current.publishedCount).toBe(0)
})

test("a failed read is an error state (not an empty month); createDefaults/addMass are no-ops; retry recovers", async () => {
  setup([mass("m1", "2026-12-06", "07:00:00", false, [slot("s1", "m1", "C", "a")])])
  listMonth.mockRejectedValueOnce(new Error("timeout"))
  jest.spyOn(console, "error").mockImplementation(() => {})
  const { result } = renderHook(() => usePlanning(DEC))

  // enquanto carrega: sem efeito
  expect(result.current.loading).toBe(true)
  act(() => result.current.createDefaults())

  await waitFor(() => expect(result.current.error).toBe(true))
  expect(result.current.loading).toBe(false)
  expect(result.current.masses).toEqual([])
  act(() => result.current.createDefaults())
  act(() =>
    result.current.addMass({ key: "x", date: "2026-12-01", time: "19:00", description: "", wasPublished: false, readOnly: false, slots: [] }),
  )
  expect(result.current.masses).toEqual([])

  act(() => result.current.retry())
  expect(result.current.error).toBe(false)
  expect(result.current.loading).toBe(true)
  await waitFor(() => expect(result.current.loading).toBe(false))
  expect(result.current.error).toBe(false)
  expect(listMonth).toHaveBeenCalledTimes(2)
  expect(result.current.masses.map((m) => m.key)).toEqual(["m1"])
  ;(console.error as jest.Mock).mockRestore()
})

test("editing a new mass's time and creating defaults again keeps keys unique; update/remove touch one mass", async () => {
  setup([])
  const { result } = await load()
  act(() => result.current.createDefaults())
  act(() => result.current.updateMass("2026-12-06_07:00", { time: "08:00" }))
  act(() => result.current.createDefaults())

  const keys = result.current.masses.map((m) => m.key)
  expect(result.current.masses).toHaveLength(26)
  expect(new Set(keys).size).toBe(keys.length)
  const sunday = result.current.masses.filter((m) => m.date === "2026-12-06")
  expect(sunday.map((m) => m.time)).toEqual(["07:00", "08:00", "09:00", "11:00", "19:00"])
  const recreated = sunday.find((m) => m.time === "07:00") as { key: string }
  expect(recreated.key).not.toBe("2026-12-06_07:00")

  act(() => result.current.updateMass("2026-12-06_07:00", { description: "editada" }))
  expect(result.current.masses.filter((m) => m.description === "editada").map((m) => m.time)).toEqual(["08:00"])

  act(() => result.current.removeMass("2026-12-06_07:00"))
  expect(result.current.masses).toHaveLength(25)
  expect(result.current.masses.filter((m) => m.date === "2026-12-06").map((m) => m.time)).toEqual(["07:00", "09:00", "11:00", "19:00"])

  // addMass com chave já usada também recebe chave nova
  act(() =>
    result.current.addMass({ key: recreated.key, date: "2026-12-06", time: "10:00", description: "", wasPublished: false, readOnly: false, slots: [] }),
  )
  const after = result.current.masses.map((m) => m.key)
  expect(new Set(after).size).toBe(after.length)
})

// ---------------------------------------------------------------------------
// Task 10: lâmpada, travas e troca manual
// ---------------------------------------------------------------------------

const draftSunday = () =>
  mass("m1", "2026-12-06", "07:00:00", false, [slot("s1", "m1", "C", ""), slot("s2", "m1", "1L", "")])

test("runLamp fills the empty slots with eligible readers and switches to phase 'suggested'", async () => {
  // b está indisponível em 06/12: só sobra "a" para uma das vagas
  setup([draftSunday()], [profile("a"), profile("b"), profile("c")])
  const { result } = await load()
  expect(result.current.phase).toBe("planning")
  act(() => result.current.runLamp())
  expect(result.current.phase).toBe("suggested")
  const ids = result.current.masses[0].slots.map((s) => s.profileId)
  expect(ids.every((id) => id === "a" || id === "c")).toBe(true)
  expect(new Set(ids).size).toBe(2)
  expect(result.current.summary).toMatchObject({ filled: 2, empty: 0 })
})

test("runLamp with no masses shows 'Crie as missas do mês primeiro' and does nothing", async () => {
  const { toast } = jest.requireMock("sonner") as { toast: Record<string, jest.Mock> }
  setup([])
  const { result } = await load()
  act(() => result.current.runLamp())
  expect(toast.info).toHaveBeenCalledWith("Crie as missas do mês primeiro")
  expect(result.current.phase).toBe("planning")
  expect(result.current.masses).toEqual([])
})

test("runLamp is a no-op while loading", async () => {
  setup([draftSunday()])
  const { result } = renderHook(() => usePlanning(DEC))
  act(() => result.current.runLamp())
  expect(result.current.phase).toBe("planning")
  await waitFor(() => expect(result.current.loading).toBe(false))
  expect(result.current.phase).toBe("planning")
  expect(result.current.summary.filled).toBe(0)
})

test("runLamp with no eligible readers warns and leaves the slots empty", async () => {
  const { toast } = jest.requireMock("sonner") as { toast: Record<string, jest.Mock> }
  setup([draftSunday()], [profile("x", { archivedAt: "2026-01-01" }), profile("y", { archivedAt: "2026-02-01", authUserId: null })])
  const { result } = await load()
  act(() => result.current.runLamp())
  expect(toast.warning).toHaveBeenCalledWith(expect.stringMatching(/Nenhum leitor apto/))
  expect(result.current.phase).toBe("suggested")
  expect(result.current.masses[0].slots.map((s) => s.profileId)).toEqual(["", ""])
})

test("setSlotReader sets the reader and locks the slot; 'Sugerir de novo' keeps it until unlocked", async () => {
  setup([mass("m1", "2026-12-08", "19:00:00", false, [slot("s1", "m1", "C", "")])])
  const { result } = await load()
  act(() => result.current.runLamp())
  const suggested = result.current.masses[0].slots[0].profileId
  const other = suggested === "a" ? "b" : "a"

  act(() => result.current.setSlotReader("m1", 0, other))
  expect(result.current.masses[0].slots[0]).toMatchObject({ profileId: other, locked: true })

  act(() => result.current.runLamp())
  expect(result.current.masses[0].slots[0]).toMatchObject({ profileId: other, locked: true })

  act(() => result.current.toggleLock("m1", 0))
  expect(result.current.masses[0].slots[0].locked).toBe(false)
  act(() => result.current.runLamp())
  expect(result.current.masses[0].slots[0].profileId).toBe(suggested)
})

test("setSlotReader never breaks hard rules: ineligible, unavailable, same mass, read-only", async () => {
  setup(
    [
      mass("m1", "2026-12-06", "07:00:00", false, [slot("s1", "m1", "C", "a"), slot("s2", "m1", "1L", "")]),
      mass("pub", "2026-12-08", "19:00:00", true, [slot("s3", "pub", "C", "")]),
    ],
    [profile("a"), profile("b"), profile("c"), profile("z", { archivedAt: "2026-01-01" })],
  )
  const { result } = await load()
  act(() => result.current.setSlotReader("m1", 1, "z")) // arquivado
  act(() => result.current.setSlotReader("m1", 1, "b")) // indisponível em 06/12
  act(() => result.current.setSlotReader("m1", 1, "a")) // já está nesta missa
  act(() => result.current.setSlotReader("pub", 0, "c")) // somente leitura
  act(() => result.current.setSlotReader("m1", 9, "c")) // vaga inexistente
  expect(result.current.masses[0].slots[1]).toEqual({ id: "s2", role: "1L", profileId: "", locked: false })
  expect(result.current.masses[1].slots[0].profileId).toBe("")

  act(() => result.current.setSlotReader("m1", 1, "c"))
  expect(result.current.masses[0].slots[1]).toMatchObject({ profileId: "c", locked: true })
})

test("a manual choice is flagged outside-preference when the reader did not mark that day/time", async () => {
  setup(
    [mass("m1", "2026-12-06", "07:00:00", false, [slot("s1", "m1", "C", ""), slot("s2", "m1", "1L", "")])],
    [
      profile("a", { preferences: { day_preferences: { "6": ["07:00"] } } }),
      profile("c", { preferences: { day_preferences: { "6": ["11:00"] } } }),
    ],
  )
  const { result } = await load()
  act(() => result.current.setSlotReader("m1", 0, "a"))
  act(() => result.current.setSlotReader("m1", 1, "c"))
  expect(result.current.masses[0].slots[0].warning).toBeUndefined()
  expect(result.current.masses[0].slots[1].warning).toBe("outside-preference")
  expect(result.current.summary.outsidePreference).toBe(1)
})

test("toggleLock flips an assigned slot; empty slots and read-only masses are untouched", async () => {
  setup([
    mass("m1", "2026-12-08", "19:00:00", false, [slot("s1", "m1", "C", "a"), slot("s2", "m1", "L", "")]),
    mass("pub", "2026-12-11", "19:00:00", true, [slot("s3", "pub", "C", "a")]),
  ])
  const { result } = await load()
  act(() => result.current.toggleLock("m1", 0))
  expect(result.current.masses[0].slots[0].locked).toBe(false)
  act(() => result.current.toggleLock("m1", 0))
  expect(result.current.masses[0].slots[0].locked).toBe(true)
  act(() => result.current.toggleLock("m1", 1))
  expect(result.current.masses[0].slots[1].locked).toBe(false)
  act(() => result.current.toggleLock("pub", 0))
  expect(result.current.masses[1].slots[0].locked).toBe(true)
})

test("readerNames keeps the names of archived/unlinked readers already in a slot", async () => {
  setup(
    [mass("m1", "2026-12-08", "19:00:00", false, [slot("s1", "m1", "C", "z")])],
    [profile("a"), profile("z", { fullName: "Zélia Arquivada", archivedAt: "2026-01-01" })],
  )
  const { result } = await load()
  expect(result.current.readers.map((r) => r.id)).toEqual(["a"])
  expect(result.current.readerNames).toMatchObject({ a: "Leitor a", z: "Zélia Arquivada" })
  act(() => result.current.runLamp())
  expect(result.current.masses[0].slots[0]).toMatchObject({ profileId: "z", locked: true })
})

test("switching month returns to phase 'planning'", async () => {
  setup([draftSunday()])
  const hook = renderHook(({ month }) => usePlanning(month), { initialProps: { month: DEC } })
  await waitFor(() => expect(hook.result.current.loading).toBe(false))
  act(() => hook.result.current.runLamp())
  expect(hook.result.current.phase).toBe("suggested")
  hook.rerender({ month: new Date(2027, 0, 1) })
  expect(hook.result.current.phase).toBe("planning")
  await waitFor(() => expect(hook.result.current.loading).toBe(false))
  expect(hook.result.current.phase).toBe("planning")
})

test("a slot with a pending swap request is carried into the plan, stays locked and cannot be unlocked or replaced", async () => {
  setup([
    mass("m1", "2026-12-08", "19:00:00", false, [
      { ...slot("s1", "m1", "C", "a"), isSwapRequested: true },
      slot("s2", "m1", "L", "b"),
    ]),
  ])
  const { result } = await load()
  expect(result.current.masses[0].slots[0]).toEqual({ id: "s1", role: "C", profileId: "a", locked: true, isSwapRequested: true })
  expect(result.current.masses[0].slots[1]).not.toHaveProperty("isSwapRequested")

  act(() => result.current.toggleLock("m1", 0))
  expect(result.current.masses[0].slots[0].locked).toBe(true)
  act(() => result.current.setSlotReader("m1", 0, "b"))
  expect(result.current.masses[0].slots[0]).toMatchObject({ profileId: "a", locked: true })
  act(() => result.current.runLamp())
  expect(result.current.masses[0].slots[0]).toMatchObject({ profileId: "a", locked: true, isSwapRequested: true })
})

test("while busy (saving) every edit is ignored; after busy ends edits work again", async () => {
  setup([
    mass("m1", "2026-12-08", "19:00:00", false, [slot("s1", "m1", "C", "a"), slot("s2", "m1", "L", "")]),
    mass("m2", "2026-12-11", "19:00:00", false, [slot("s3", "m2", "C", "")]),
  ])
  const { result } = await load()
  const before = JSON.stringify(result.current.masses)
  const newMass = { key: "n", date: "2026-12-12", time: "19:00", description: "", wasPublished: false, readOnly: false, slots: [] }

  act(() => result.current.setBusy(true))
  act(() => {
    result.current.updateMass("m1", { description: "X" })
    result.current.removeMass("m2")
    result.current.setSlotReader("m1", 1, "b")
    result.current.toggleLock("m1", 0)
    result.current.addMass(newMass)
    result.current.createDefaults()
    result.current.runLamp()
  })
  expect(JSON.stringify(result.current.masses)).toBe(before)
  expect(result.current.removedMasses).toEqual([])
  expect(result.current.phase).toBe("planning")

  act(() => result.current.setBusy(false))
  act(() => result.current.toggleLock("m1", 0))
  expect(result.current.masses[0].slots[0].locked).toBe(false)
  act(() => result.current.updateMass("m1", { description: "X" }))
  expect(result.current.masses[0].description).toBe("X")
})
