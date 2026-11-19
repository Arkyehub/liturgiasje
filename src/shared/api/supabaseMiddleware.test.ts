/** @jest-environment node */
import { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { updateSession } from './supabaseMiddleware'

jest.mock('@supabase/ssr', () => ({ createServerClient: jest.fn() }))

const getUser = jest.fn()
beforeEach(() => {
  jest.clearAllMocks()
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon'
  ;(createServerClient as jest.Mock).mockReturnValue({ auth: { getUser } })
  getUser.mockResolvedValue({ data: { user: null } })
})

test('refreshes the session on normal navigations', async () => {
  await updateSession(new NextRequest('http://localhost:3000/perfil'))
  expect(getUser).toHaveBeenCalledTimes(1)
})

test.each([
  [{ 'next-router-prefetch': '1' }],
  [{ purpose: 'prefetch' }],
])('skips the Auth call for prefetch requests %j', async (headers) => {
  await updateSession(new NextRequest('http://localhost:3000/perfil', { headers }))
  expect(createServerClient).not.toHaveBeenCalled()
  expect(getUser).not.toHaveBeenCalled()
})
