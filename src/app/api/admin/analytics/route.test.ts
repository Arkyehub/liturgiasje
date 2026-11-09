/** @jest-environment node */
import { GET } from './route'
import { createClient } from '@/shared/api/supabaseServer'
import { createClient as createServiceClient } from '@supabase/supabase-js'

jest.mock('@/shared/api/supabaseServer', () => ({ createClient: jest.fn() }))
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }))

const session = (profile: unknown, error: unknown = null, user: unknown = { id: 'user' }) => ({
  auth: { getUser: async () => ({ data: { user }, error: null }) },
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: profile, error }) }) }) })
})

describe('admin analytics authorization', () => {
  beforeEach(() => jest.resetAllMocks())
  it('rejects anonymous requests before creating a privileged client', async () => {
    ;(createClient as jest.Mock).mockResolvedValue(session(null, null, null))
    expect((await GET()).status).toBe(401)
    expect(createServiceClient).not.toHaveBeenCalled()
  })
  it.each([
    ['reader', { role: 'reader', archived_at: null }, null],
    ['archived admin', { role: 'admin', archived_at: '2026-01-01' }, null],
    ['missing profile', null, null],
    ['query error', null, { message: 'failed' }],
    ['missing state', { role: 'admin' }, null],
  ])('rejects %s without accessing privileged data', async (_name, profile, error) => {
    ;(createClient as jest.Mock).mockResolvedValue(session(profile, error))
    expect((await GET()).status).toBe(403)
    expect(createServiceClient).not.toHaveBeenCalled()
  })
  it('allows an active administrator to reach the analytics query', async () => {
    ;(createClient as jest.Mock).mockResolvedValue(session({ role: 'admin', archived_at: null }))
    const query = { select: () => query, eq: () => query, order: () => query, then: (resolve: (value: unknown) => void) => resolve({ data: [], error: null }) }
    ;(createServiceClient as jest.Mock).mockReturnValue({ from: () => query, auth: { admin: { listUsers: async () => ({ data: { users: [] }, error: null }) } } })
    const response = await GET()
    expect(createServiceClient).toHaveBeenCalled()
    expect(response.status).toBe(200)
  })
  it('still computes slot metrics when schedule_slots has no original_profile_id column', async () => {
    ;(createClient as jest.Mock).mockResolvedValue(session({ role: 'admin', archived_at: null }))
    const future = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10)
    const tables: Record<string, unknown[]> = {
      profiles: [{ id: 'p1', full_name: 'Ana', whatsapp: null, role: 'reader', auth_user_id: 'u1', created_at: '2026-01-01', last_seen_at: null, archived_at: null }],
      // linhas como no Production: sem original_profile_id
      schedule_slots: [{ id: 's1', role: '1L', is_confirmed: false, is_swap_requested: false, profile_id: 'p1', created_at: '2026-01-01', mass_id: 'm1' }],
      masses: [{ id: 'm1', date: future, time: '09:00:00', special_description: null }],
      announcements: [],
    }
    const selects: Record<string, unknown[]> = {}
    const from = (table: string) => {
      const query: Record<string, unknown> = {
        select: (columns: string) => { (selects[table] ||= []).push(columns); return query },
        eq: () => query, in: () => query, order: () => query,
        then: (resolve: (value: unknown) => void) => resolve({ data: tables[table] ?? [], error: null }),
      }
      return query
    }
    ;(createServiceClient as jest.Mock).mockReturnValue({ from, auth: { admin: { listUsers: async () => ({ data: { users: [] }, error: null }) } } })

    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(selects.schedule_slots).toEqual(['*'])
    expect(body.summary.unconfirmedSlotsCount).toBe(1)
    expect(body.summary.totalSwapsExecuted).toBe(0)
    expect(body.unconfirmedSlots[0]).toMatchObject({ id: 's1', massDate: future })
  })
})
