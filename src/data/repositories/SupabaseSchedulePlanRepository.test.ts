import { SupabaseSchedulePlanRepository } from './SupabaseSchedulePlanRepository'
import { PlanError, planErrorMessage } from '@/domain/models/SchedulePlan'
import { supabase } from '@/shared/api/supabase'
jest.mock('@/shared/api/supabase', () => ({ supabase: { rpc: jest.fn(), from: jest.fn() } }))

const rpc = supabase.rpc as jest.Mock
const repo = new SupabaseSchedulePlanRepository()
const item = { id: 'p1', monthReference: '2026-12', ownerProfileId: 'o', ownerName: 'Ana', isMine: true, status: 'em_andamento', createdAt: 'a', updatedAt: 'b', expiresAt: 'c', copiedFromName: null, concludedAt: null, openElsewhere: false }
const doc = { ...item, revision: 3, state: { a: 1 } }

beforeEach(() => jest.clearAllMocks())

test('list calls plan_list with p_months', async () => {
  rpc.mockResolvedValue({ data: [item], error: null })
  expect(await repo.list(['2026-12'])).toEqual([item])
  expect(rpc).toHaveBeenCalledWith('plan_list', { p_months: ['2026-12'] })
})

test('list returns [] when data is null', async () => {
  rpc.mockResolvedValue({ data: null, error: null })
  expect(await repo.list([])).toEqual([])
})

test('open calls plan_open', async () => {
  const result = { mode: 'edit', holderLastSeen: null, plan: doc }
  rpc.mockResolvedValue({ data: result, error: null })
  expect(await repo.open('2026-12', 's1')).toEqual(result)
  expect(rpc).toHaveBeenCalledWith('plan_open', { p_month: '2026-12', p_session: 's1' })
})

test('get calls plan_get and accepts null', async () => {
  rpc.mockResolvedValueOnce({ data: doc, error: null })
  expect(await repo.get('p1')).toEqual(doc)
  expect(rpc).toHaveBeenCalledWith('plan_get', { p_plan_id: 'p1' })
  rpc.mockResolvedValueOnce({ data: null, error: null })
  expect(await repo.get('p1')).toBeNull()
})

test('copy calls plan_copy with three params', async () => {
  rpc.mockResolvedValue({ data: doc, error: null })
  expect(await repo.copy('src', 's1', true)).toEqual(doc)
  expect(rpc).toHaveBeenCalledWith('plan_copy', { p_source: 'src', p_session: 's1', p_overwrite: true })
})

test('save returns new revision', async () => {
  rpc.mockResolvedValue({ data: 4, error: null })
  expect(await repo.save('p1', 's1', 'r1', 3, { a: 2 })).toBe(4)
  expect(rpc).toHaveBeenCalledWith('plan_save', { p_plan_id: 'p1', p_session: 's1', p_request_id: 'r1', p_expected_revision: 3, p_state: { a: 2 } })
})

test.each([
  ['heartbeat', 'plan_heartbeat'],
  ['release', 'plan_release'],
  ['conclude', 'plan_conclude']
] as const)('%s calls %s', async (method, fn) => {
  rpc.mockResolvedValue({ data: null, error: null })
  await repo[method]('p1', 's1')
  expect(rpc).toHaveBeenCalledWith(fn, { p_plan_id: 'p1', p_session: 's1' })
})

test('reopen calls plan_reopen', async () => {
  const result = { mode: 'edit', holderLastSeen: null, plan: doc }
  rpc.mockResolvedValue({ data: result, error: null })
  expect(await repo.reopen('p1', 's1')).toEqual(result)
  expect(rpc).toHaveBeenCalledWith('plan_reopen', { p_plan_id: 'p1', p_session: 's1' })
})

test('discard calls plan_discard', async () => {
  rpc.mockResolvedValue({ data: null, error: null })
  await repo.discard('p1')
  expect(rpc).toHaveBeenCalledWith('plan_discard', { p_plan_id: 'p1' })
})

test.each([
  'forbidden', 'invalid_arguments', 'plan_not_found', 'plan_lock_lost', 'plan_revision_conflict',
  'plan_concluded', 'plan_expired', 'plan_too_large', 'plan_exists', 'plan_in_use'
])('maps %s error message to PlanError code', async (code) => {
  const cause = { message: `${code}`, code: 'P0001' }
  rpc.mockResolvedValue({ data: null, error: cause })
  const error = await repo.heartbeat('p1', 's1').catch(e => e)
  expect(error).toBeInstanceOf(PlanError)
  expect(error.code).toBe(code)
  expect(error.cause).toBe(cause)
})

test.each([
  [{ code: 'PGRST202', message: 'x' }],
  [{ code: '42883', message: 'x' }],
  [{ message: 'Could not find the function public.plan_list' }],
  [{ message: 'function plan_list(text[]) does not exist' }]
])('missing function %j becomes unavailable', async (cause) => {
  rpc.mockResolvedValue({ data: null, error: cause })
  const error = await repo.list(['2026-12']).catch(e => e)
  expect(error).toBeInstanceOf(PlanError)
  expect(error.code).toBe('unavailable')
})

test('unknown errors become unknown', async () => {
  rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
  const error = await repo.discard('p1').catch(e => e)
  expect(error.code).toBe('unknown')
})

test('planErrorMessage gives distinct pt-BR texts', () => {
  const codes = ['plan_lock_lost', 'plan_revision_conflict', 'plan_expired', 'plan_too_large', 'plan_in_use', 'plan_concluded', 'plan_exists', 'plan_not_found', 'forbidden', 'unavailable', 'unknown'] as const
  const messages = codes.map(code => planErrorMessage(new PlanError(code)))
  expect(new Set(messages).size).toBe(codes.length)
  expect(planErrorMessage(new PlanError('unavailable'))).toBe('Planejamento compartilhado indisponível neste ambiente.')
  expect(planErrorMessage(new Error('x'))).toBe(planErrorMessage(new PlanError('unknown')))
})
