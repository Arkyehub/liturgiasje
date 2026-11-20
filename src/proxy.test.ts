import { config } from './proxy'

jest.mock('@/shared/api/supabaseMiddleware', () => ({ updateSession: jest.fn() }))

// O matcher do Next usa path-to-regexp; aqui testamos o trecho interno (regex) que ele envolve.
const matcher = config.matcher[0]
const regex = new RegExp('^' + matcher.replace(/^\/\(/, '/(').replace(/\\\\/g, '\\'))

describe('proxy matcher', () => {
  it.each(['/', '/perfil', '/admin/membros', '/admin/membros/abc', '/api/push/send', '/auth/callback'])('runs the session proxy for %s', (path) => {
    expect(regex.test(path)).toBe(true)
  })

  it.each([
    '/sw.js',
    '/manifest.webmanifest',
    '/favicon.ico',
    '/icons/android-chrome-192x192.png',
    '/Logo-Liturgia-SJE.png',
    '/_next/static/chunks/app.js',
    '/_next/image',
  ])('skips %s (static files must not refresh the Auth session)', (path) => {
    expect(regex.test(path)).toBe(false)
  })
})
