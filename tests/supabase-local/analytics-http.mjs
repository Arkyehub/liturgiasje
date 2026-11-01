import { randomUUID } from 'node:crypto'
import { createServerClient } from '@supabase/ssr'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const appUrl = process.env.LOCAL_APP_URL

if (supabaseUrl !== 'http://127.0.0.1:15432' || appUrl !== 'http://127.0.0.1:3030' || !anonKey || !serviceKey) {
  throw new Error('Refusing a non-local or incomplete Analytics test target')
}

const tokenRole = token => JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).role
if (tokenRole(anonKey) !== 'anon' || tokenRole(serviceKey) !== 'service_role') {
  throw new Error('Test keys do not have expected local Supabase roles')
}

const password = randomUUID() + "Aa1!"
const email = `analytics-admin-${Date.now()}@example.test`
const headers = token => ({ apikey: token, authorization: `Bearer ${token}`, 'content-type': 'application/json' })
const check = (name, ok, detail = '') => {
  process.stdout.write(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` ${detail}` : ''}\n`)
  if (!ok) process.exitCode = 1
}

async function main() {
  const anonymous = await fetch(`${appUrl}/api/admin/analytics`)
  check('Analytics da aplicação recusa sessão ausente', anonymous.status === 401, `HTTP ${anonymous.status}`)

  const created = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    method: 'POST',
    headers: headers(serviceKey),
    body: JSON.stringify({ email, password, email_confirm: true }),
  })
  if (![200, 201].includes(created.status)) throw new Error(`GoTrue test user creation HTTP ${created.status}`)
  const user = await created.json()

  const seeded = await fetch(`${supabaseUrl}/rest/v1/profiles`, {
    method: 'POST',
    headers: { ...headers(serviceKey), Prefer: 'return=representation' },
    body: JSON.stringify({ auth_user_id: user.id, email, full_name: 'Analytics Local Admin', role: 'admin' }),
  })
  if (seeded.status !== 201) throw new Error(`Local admin profile setup HTTP ${seeded.status}`)
  const [adminProfile] = await seeded.json()
  const announcement = await fetch(`${supabaseUrl}/rest/v1/announcements`, {
    method: 'POST',
    headers: { ...headers(serviceKey), Prefer: 'return=representation' },
    body: JSON.stringify({ title: 'Troca sintética', content: 'Aviso de homologação local', type: 'Troca', profile_id: adminProfile.id }),
  })
  if (announcement.status !== 201) throw new Error(`Local announcement setup HTTP ${announcement.status}`)
  const [swapAnnouncement] = await announcement.json()

  const login = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: headers(anonKey),
    body: JSON.stringify({ email, password }),
  })
  if (login.status !== 200) throw new Error(`GoTrue password login HTTP ${login.status}`)
  const session = await login.json()

  const jar = new Map()
  const serverClient = createServerClient(supabaseUrl, anonKey, {
    cookies: {
      getAll: () => Array.from(jar, ([name, value]) => ({ name, value })),
      setAll: cookies => cookies.forEach(({ name, value }) => jar.set(name, value)),
    },
  })
  const { error } = await serverClient.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  })
  if (error || jar.size === 0) throw new Error('Could not build local SSR session cookie')

  const cookie = Array.from(jar, ([name, value]) => `${name}=${value}`).join('; ')
  const memberEmail = `analytics-member-${Date.now()}@example.test`
  const adminHeaders = { apikey: anonKey, authorization: `Bearer ${session.access_token}`, 'content-type': 'application/json', Prefer: 'return=representation' }
  const list = await fetch(`${supabaseUrl}/rest/v1/profiles?archived_at=is.null&select=id,full_name`, { headers: adminHeaders })
  const listedProfiles = list.status === 200 ? await list.json() : []
  check('Administrador lista membros ativos via PostgREST', list.status === 200 && listedProfiles.some(profile => profile.id === adminProfile.id), `HTTP ${list.status}`)

  const member = await fetch(`${supabaseUrl}/rest/v1/profiles`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ email: memberEmail, full_name: 'Analytics Local Member', role: 'reader' }),
  })
  if (member.status !== 201) throw new Error(`Local member creation HTTP ${member.status}`)
  const [memberProfile] = await member.json()
  check('Administrador cadastra membro via PostgREST', member.status === 201, `HTTP ${member.status}`)

  const archived = await fetch(`${appUrl}/api/admin/profiles/delete`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ profileId: memberProfile.id }),
  })
  let archiveResult = null
  try { archiveResult = await archived.json() } catch {}
  check('Endpoint legado de exclusão arquiva membro via sessão Auth', archived.status === 200 && archiveResult?.status === 'archived', `HTTP ${archived.status}`)
  const archivedProfile = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${memberProfile.id}&select=archived_at`, { headers: headers(serviceKey) })
  const archivedRows = archivedProfile.status === 200 ? await archivedProfile.json() : []
  check('Perfil permanece no banco com archived_at preenchido', archivedRows.length === 1 && archivedRows[0].archived_at !== null, `HTTP ${archivedProfile.status}`)
  const activeAfterArchive = await fetch(`${supabaseUrl}/rest/v1/profiles?archived_at=is.null&select=id`, { headers: adminHeaders })
  const activeRows = activeAfterArchive.status === 200 ? await activeAfterArchive.json() : []
  check('Membro inativado sai da lista ativa', activeAfterArchive.status === 200 && !activeRows.some(profile => profile.id === memberProfile.id), `HTTP ${activeAfterArchive.status}`)

  const analytics = await fetch(`${appUrl}/api/admin/analytics`, { headers: { cookie } })
  let payload = null
  try { payload = await analytics.json() } catch {}
  check('Analytics da aplicação aceita administrador Auth ativo', analytics.status === 200 && typeof payload?.summary?.totalReaders === 'number', `HTTP ${analytics.status}`)
  const mappedAnnouncement = payload?.activeSwapRequests?.find(item => item.id === swapAnnouncement.id)
  check('Analytics relaciona aviso de troca ao autor do profile_id', !!mappedAnnouncement && mappedAnnouncement.authorName === 'Analytics Local Admin', `HTTP ${analytics.status}`)
  process.stdout.write('SUMMARY ' + (process.exitCode ? 'falhas' : '0 falhas') + '\n')
}

main().catch(error => {
  process.stderr.write(`ABORT ${error.message}\n`)
  process.exitCode = 2
})
