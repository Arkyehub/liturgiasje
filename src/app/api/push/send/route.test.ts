/** @jest-environment node */
import { POST } from './route'
import { createClient, createAdminClient } from '@/shared/api/supabaseServer'
jest.mock('@/shared/api/supabaseServer', () => ({ createClient: jest.fn(), createAdminClient: jest.fn() }))
jest.mock('@/shared/lib/push', () => ({ sendPushNotification: jest.fn() }))
test('does not send a swap notification from an archived member', async () => {
  const query = {select:()=>query,eq:()=>query,single:async()=>({data:{role:'reader',archived_at:'2026-01-01'},error:null})}
  ;(createClient as jest.Mock).mockResolvedValue({ auth:{getUser:async()=>({data:{user:{id:'user'}},error:null})}, from:()=>query })
  const response = await POST(new Request('http://localhost', {method:'POST',body:JSON.stringify({title:'Troca',body:'troca'})}))
  expect(response.status).toBe(403)
  expect(createAdminClient).not.toHaveBeenCalled()
})
