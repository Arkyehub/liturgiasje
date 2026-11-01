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
})
