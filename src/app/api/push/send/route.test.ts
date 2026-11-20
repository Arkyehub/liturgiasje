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

describe('push permissions for members who are not administrators', () => {
  const { sendPushNotification } = jest.requireMock('@/shared/lib/push') as { sendPushNotification: jest.Mock }
  const post = (payload: unknown) => POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify(payload) }))

  const asUser = (profile: { role: string; archived_at: string | null; full_name: string }, id = 'sender') => {
    const query: Record<string, unknown> = { select: () => query, eq: () => query, single: async () => ({ data: profile, error: null }) }
    ;(createClient as jest.Mock).mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { id } }, error: null }) }, from: () => query })
    const chain = (data: unknown) => {
      const c: Record<string, unknown> = {
        select: () => c, neq: () => c, in: () => c, is: () => c, delete: () => c, match: () => c,
        then: (resolve: (v: unknown) => void) => resolve({ data, error: null }),
      }
      return c
    }
    const tables: Record<string, unknown> = {
      push_subscriptions: chain([{ subscription: { endpoint: 'e1' }, user_id: 'recipient' }]),
      profiles: chain([{ auth_user_id: 'recipient' }]),
    }
    ;(createAdminClient as jest.Mock).mockReturnValue({ from: (table: string) => tables[table] })
  }
  const reader = { role: 'reader', archived_at: null, full_name: 'Ana Teste' }

  beforeEach(() => {
    jest.clearAllMocks()
    sendPushNotification.mockResolvedValue({ success: true })
  })

  it('rejects arbitrary text from a member even when it contains the word "troca"', async () => {
    asUser(reader)
    const response = await post({ title: 'Promoção imperdível', body: 'clique aqui, troca de plano grátis', url: 'https://evil.test' })
    expect(response.status).toBe(403)
    expect(sendPushNotification).not.toHaveBeenCalled()
  })

  it('sends a swap request with server-written text, ignoring the text sent by the client', async () => {
    asUser(reader)
    const response = await post({ title: 'Solicitação de Troca', body: 'texto malicioso', url: 'https://evil.test' })
    expect(response.status).toBe(200)
    expect(sendPushNotification).toHaveBeenCalledWith({ endpoint: 'e1' }, {
      title: 'Solicitação de Troca',
      body: 'Alguém solicitou uma troca de escala. Confira no mural!',
      url: '/',
    })
  })

  it('does not let a member choose recipients for a swap request', async () => {
    asUser(reader)
    expect((await post({ title: 'Solicitação de Troca', targetUserIds: ['recipient'] })).status).toBe(400)
    expect(sendPushNotification).not.toHaveBeenCalled()
  })

  it('confirms a swap to exactly one other member, naming the sender from the database', async () => {
    asUser(reader)
    expect((await post({ title: 'Troca Confirmada! ✅', body: 'x', targetUserIds: ['recipient'] })).status).toBe(200)
    expect(sendPushNotification).toHaveBeenCalledWith({ endpoint: 'e1' }, expect.objectContaining({ body: 'Ana Teste aceitou sua troca de escala.' }))
  })

  it.each([[[]], [['a', 'b']], [['sender']]])('rejects swap confirmation with recipients %j', async (targetUserIds) => {
    asUser(reader)
    expect((await post({ title: 'Troca Confirmada! ✅', targetUserIds })).status).toBe(400)
    expect(sendPushNotification).not.toHaveBeenCalled()
  })

  it('limits how many notifications one member can send', async () => {
    asUser(reader, 'busy-sender')
    const statuses: number[] = []
    for (let i = 0; i < 7; i++) statuses.push((await post({ title: 'Solicitação de Troca' })).status)
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429, 429])
  })

  it('keeps administrators able to send custom messages', async () => {
    asUser({ role: 'admin', archived_at: null, full_name: 'Carlos' }, 'admin-sender')
    expect((await post({ title: 'Aviso geral', body: 'Reunião sábado', url: '/' })).status).toBe(200)
    expect(sendPushNotification).toHaveBeenCalledWith({ endpoint: 'e1' }, { title: 'Aviso geral', body: 'Reunião sábado', url: '/' })
  })
})
