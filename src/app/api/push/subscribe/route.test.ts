/** @jest-environment node */
import { POST, DELETE } from './route'
import { createClient } from '@/shared/api/supabaseServer'

jest.mock('@/shared/api/supabaseServer', () => ({ createClient: jest.fn() }))

const keys = { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg' }
const good = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys }
const upsert = jest.fn()
const del = jest.fn()

const post = (subscription: unknown) => POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ subscription }) }))

function session(profile: { id: string; archived_at: string | null } | null = { id: 'p1', archived_at: null }) {
  const profiles = { select: () => profiles, eq: () => profiles, single: async () => ({ data: profile, error: null }) }
  ;(createClient as jest.Mock).mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
    from: (table: string) => (table === 'profiles' ? profiles : { upsert, delete: () => ({ match: del }) }),
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  upsert.mockResolvedValue({ error: null })
  del.mockResolvedValue({ error: null })
  session()
})

test('stores a valid push subscription', async () => {
  expect((await post(good)).status).toBe(200)
  expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'u1', profile_id: 'p1', subscription: good }), expect.anything())
})

test.each([
  [{ endpoint: 'https://169.254.169.254/latest/meta-data', keys }],
  [{ endpoint: 'http://fcm.googleapis.com/fcm/send/abc', keys }],
  [{ endpoint: 'https://evil.test/x', keys }],
  [{ endpoint: good.endpoint }],
  [{ endpoint: good.endpoint, keys: { p256dh: 'x', auth: 'y' } }],
])('rejects an unsafe subscription %j without touching the database', async (subscription) => {
  expect((await post(subscription)).status).toBe(400)
  expect(upsert).not.toHaveBeenCalled()
})

test('accepts the subscription sent as a JSON string', async () => {
  expect((await post(JSON.stringify(good))).status).toBe(200)
})

test('does not store subscriptions for archived members', async () => {
  session({ id: 'p1', archived_at: '2026-01-01' })
  expect((await post(good)).status).toBe(403)
})

test('hides database error details from the client', async () => {
  upsert.mockResolvedValue({ error: { message: 'duplicate key value violates unique constraint "push_pk"' } })
  const response = await post(good)
  expect(response.status).toBe(500)
  expect(JSON.stringify(await response.json())).not.toContain('constraint')
})

test('removing a subscription also hides database error details', async () => {
  del.mockResolvedValue({ error: { message: 'relation "push_subscriptions" is locked' } })
  const response = await DELETE(new Request('http://localhost', { method: 'DELETE', body: JSON.stringify({ subscription: good }) }))
  expect(response.status).toBe(500)
  expect(JSON.stringify(await response.json())).not.toContain('locked')
})
