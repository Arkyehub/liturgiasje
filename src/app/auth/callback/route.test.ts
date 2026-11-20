/** @jest-environment node */
import { GET } from './route'
import { createClient } from '@/shared/api/supabaseServer'

jest.mock('@/shared/api/supabaseServer', () => ({ createClient: jest.fn() }))

const exchange = jest.fn()
const call = (query: string, headers: Record<string, string> = {}) =>
  GET(new Request(`https://app.example.test/auth/callback?${query}`, { headers }))

beforeEach(() => {
  jest.clearAllMocks()
  ;(createClient as jest.Mock).mockResolvedValue({ auth: { exchangeCodeForSession: exchange } })
  exchange.mockResolvedValue({ error: null })
})

test('sends the user to the requested internal page after login', async () => {
  const response = await call('code=ok&next=/perfil', { 'x-forwarded-host': 'app.example.test' })
  expect(new URL(response.headers.get('location')!).href).toBe('https://app.example.test/perfil')
})

test.each(['@evil.test', '//evil.test', '/\\evil.test', 'https://evil.test'])('never redirects to another site (next=%s)', async (next) => {
  const response = await call(`code=ok&next=${encodeURIComponent(next)}`, { 'x-forwarded-host': 'app.example.test' })
  expect(new URL(response.headers.get('location')!).host).toBe('app.example.test')
  expect(new URL(response.headers.get('location')!).pathname).toBe('/')
})

test('without x-forwarded-host it also stays on the same origin', async () => {
  const response = await call('code=ok&next=@evil.test')
  expect(new URL(response.headers.get('location')!).host).toBe('app.example.test')
})

test('goes to the error page when the code is missing or rejected', async () => {
  expect(new URL((await call('next=/perfil')).headers.get('location')!).pathname).toBe('/auth/auth-code-error')
  exchange.mockResolvedValue({ error: new Error('invalid') })
  expect(new URL((await call('code=bad')).headers.get('location')!).pathname).toBe('/auth/auth-code-error')
})
