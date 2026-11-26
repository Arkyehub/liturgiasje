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
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }))

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

test("only active readers with a linked account are eligible, with stats for each", async () => {
  setup([], [profile("a"), profile("b", { archivedAt: "2026-01-01" }), profile("c", { authUserId: null })])
  const { result } = await load()
  expect(result.current.readers.map((r) => r.id)).toEqual(["a"])
  expect(Object.keys(result.current.stats)).toEqual(["a"])
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
