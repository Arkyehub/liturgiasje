/** @jest-environment node */
import { GET } from './route'
import { createAdminClient } from '@/shared/api/supabaseServer'
jest.mock('@/shared/api/supabaseServer', () => ({ createAdminClient: jest.fn() }))
jest.mock('@/shared/lib/push', () => ({ sendPushNotification: jest.fn() }))
test('rejects unauthorized birthday cron calls before privileged access', async () => {
  process.env.CRON_SECRET = 'local-test-only'
  expect((await GET(new Request('http://localhost'))).status).toBe(401)
  expect(createAdminClient).not.toHaveBeenCalled()
  delete process.env.CRON_SECRET
})

test('rejects a bearer value when CRON_SECRET is missing', async () => {
  delete process.env.CRON_SECRET
  ;(createAdminClient as jest.Mock).mockClear()
  expect((await GET(new Request('http://localhost', {headers:{authorization:'Bearer undefined'}}))).status).toBe(401)
  expect(createAdminClient).not.toHaveBeenCalled()
})
test('accepts the configured bearer before privileged access', async () => {
  process.env.CRON_SECRET = 'local-test-only'
  ;(createAdminClient as jest.Mock).mockClear().mockImplementation(() => { throw new Error('fixture') })
  const quiet = jest.spyOn(console, 'error').mockImplementation(() => {})
  expect((await GET(new Request('http://localhost', {headers:{authorization:'Bearer local-test-only'}}))).status).toBe(500)
  expect(createAdminClient).toHaveBeenCalledTimes(1)
  quiet.mockRestore()
  delete process.env.CRON_SECRET
})
