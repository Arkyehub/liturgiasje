import { act, render } from "@testing-library/react"
import { AuthProvider, isSameProfile, useAuthContext } from "./AuthProvider"
import { Profile } from "@/domain/models/Profile"
import { supabase } from "@/shared/api/supabase"
import { makeGetProfileByAuthId } from "@/main/factories/usecases/profiles"

jest.mock("@/shared/api/supabase", () => ({
  supabase: {
    auth: { getUser: jest.fn(), onAuthStateChange: jest.fn(), signOut: jest.fn(), signInWithOAuth: jest.fn() },
    from: jest.fn(),
  },
}))
jest.mock("@/main/factories/usecases/profiles", () => ({ makeGetProfileByAuthId: jest.fn() }))

const baseProfile: Profile = {
  id: "p1", authUserId: "u1", fullName: "Ana Teste", role: "reader", archivedAt: null,
  createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", lastSeenAt: "2026-11-01T10:00:00Z",
}
const user = { id: "u1" }

let authCallback: (event: string, session: { user: { id: string } } | null) => void
let execute: jest.Mock
let updateCall: jest.Mock
const seen: { profile: Profile | null; loading: boolean }[] = []

function Probe() {
  const { profile, loading } = useAuthContext()
  seen.push({ profile, loading })
  return null
}

async function mount() {
  render(<AuthProvider><Probe /></AuthProvider>)
  await act(async () => { await Promise.resolve() })
  await act(async () => { await Promise.resolve() })
}

beforeEach(() => {
  jest.useFakeTimers()
  seen.length = 0
  execute = jest.fn().mockResolvedValue(baseProfile)
  ;(makeGetProfileByAuthId as jest.Mock).mockReturnValue({ execute })
  ;(supabase.auth.getUser as jest.Mock).mockResolvedValue({ data: { user } })
  ;(supabase.auth.onAuthStateChange as jest.Mock).mockImplementation((cb) => {
    authCallback = cb
    return { data: { subscription: { unsubscribe: jest.fn() } } }
  })
  updateCall = jest.fn()
  const chain = { update: (...a: unknown[]) => { updateCall(...a); return chain }, eq: () => chain, then: (resolve: (v: unknown) => void) => resolve({ error: null }) }
  ;(supabase.from as jest.Mock).mockReturnValue(chain)
})
afterEach(() => jest.useRealTimers())

test("isSameProfile ignores fields that change on every access", () => {
  expect(isSameProfile(baseProfile, { ...baseProfile, lastSeenAt: "2026-11-19T00:00:00Z", updatedAt: "2026-11-19T00:00:00Z" })).toBe(true)
  expect(isSameProfile(baseProfile, { ...baseProfile, fullName: "Outro Nome" })).toBe(false)
  expect(isSameProfile(baseProfile, null)).toBe(false)
  expect(isSameProfile(null, null)).toBe(true)
})

test("background refreshes keep the same profile reference when nothing changed", async () => {
  await mount()
  execute.mockResolvedValue({ ...baseProfile, lastSeenAt: "2026-11-19T12:00:00Z" }) // outro objeto, mesmo conteúdo
  await act(async () => { jest.advanceTimersByTime(5 * 60 * 1000 + 100) })
  await act(async () => { await Promise.resolve() })

  expect(execute.mock.calls.length).toBeGreaterThanOrEqual(2) // houve atualização
  const references = new Set(seen.map((s) => s.profile).filter(Boolean))
  expect(references.size).toBe(1) // e a tela nunca recebeu um objeto novo
})

test("does not poll every 30 seconds anymore", async () => {
  await mount()
  const callsAfterMount = execute.mock.calls.length
  await act(async () => { jest.advanceTimersByTime(4 * 60 * 1000) })
  expect(execute.mock.calls.length).toBe(callsAfterMount)
})

test("repeated auth events for the same user do not show a loading state or refetch", async () => {
  await mount()
  const callsAfterMount = execute.mock.calls.length
  const renderedBefore = seen.length
  await act(async () => { authCallback("SIGNED_IN", { user }); authCallback("TOKEN_REFRESHED", { user }) })
  expect(execute.mock.calls.length).toBe(callsAfterMount)
  expect(seen.slice(renderedBefore).some((s) => s.loading)).toBe(false)
})

test("a different user does load their profile", async () => {
  await mount()
  execute.mockResolvedValue({ ...baseProfile, id: "p2", authUserId: "u2", fullName: "Outra Pessoa" })
  await act(async () => { authCallback("SIGNED_IN", { user: { id: "u2" } }) })
  await act(async () => { await Promise.resolve() })
  expect(seen[seen.length - 1].profile?.id).toBe("p2")
})

test("last_seen_at is written at most once every 10 minutes", async () => {
  await mount()
  expect(updateCall).toHaveBeenCalledTimes(1)
  await act(async () => { jest.advanceTimersByTime(5 * 60 * 1000 + 100) })
  await act(async () => { await Promise.resolve() })
  expect(updateCall).toHaveBeenCalledTimes(1)
  await act(async () => { jest.advanceTimersByTime(5 * 60 * 1000 + 100) })
  await act(async () => { await Promise.resolve() })
  expect(updateCall).toHaveBeenCalledTimes(2)
})
