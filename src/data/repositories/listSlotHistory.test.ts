import { SupabaseScheduleRepository } from './SupabaseScheduleRepository'
import { supabase } from '@/shared/api/supabase'
jest.mock('@/shared/api/supabase', () => ({ supabase: { from: jest.fn() } }))

type Builder = {
  select: jest.Mock; eq: jest.Mock; gte: jest.Mock; lte: jest.Mock
  then: (resolve: (value: unknown) => unknown) => unknown
}
const chain = (result: unknown): Builder => {
  const builder: Builder = {
    select: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    gte: jest.fn(() => builder),
    lte: jest.fn(() => builder),
    then: (resolve) => resolve(result)
  }
  return builder
}

beforeEach(() => jest.clearAllMocks())

test('lists published slot history in the date range without naming original_profile_id', async () => {
  const builder = chain({
    error: null,
    data: [
      { id: 's1', role: 'L', profile_id: 'p1', original_profile_id: 'p9', mass: { date: '2026-11-01', is_published: true } },
      { id: 's2', role: 'C', profile_id: 'p2', original_profile_id: null, mass: { date: '2026-11-08', is_published: true } },
      { id: 's3', role: 'L', profile_id: null, original_profile_id: null, mass: { date: '2026-11-08', is_published: true } }
    ]
  })
  ;(supabase.from as jest.Mock).mockReturnValue(builder)

  const rows = await new SupabaseScheduleRepository().listSlotHistory('2026-11-01', '2026-11-30')

  expect(supabase.from).toHaveBeenCalledWith('schedule_slots')
  expect(builder.select).toHaveBeenCalledWith('*, mass:masses!inner(date, is_published)')
  expect(builder.eq).toHaveBeenCalledWith('mass.is_published', true)
  expect(builder.gte).toHaveBeenCalledWith('mass.date', '2026-11-01')
  expect(builder.lte).toHaveBeenCalledWith('mass.date', '2026-11-30')
  expect(rows).toEqual([
    { date: '2026-11-01', role: 'L', profileId: 'p1', originalProfileId: 'p9' },
    { date: '2026-11-08', role: 'C', profileId: 'p2', originalProfileId: null }
  ])
})

test('row without original_profile_id column yields null and no error', async () => {
  ;(supabase.from as jest.Mock).mockReturnValue(chain({
    error: null,
    data: [{ id: 's1', role: 'L', profile_id: 'p1', mass: [{ date: '2026-11-01', is_published: true }] }]
  }))
  const rows = await new SupabaseScheduleRepository().listSlotHistory('2026-11-01', '2026-11-30')
  expect(rows).toEqual([{ date: '2026-11-01', role: 'L', profileId: 'p1', originalProfileId: null }])
})

test('propagates database errors', async () => {
  ;(supabase.from as jest.Mock).mockReturnValue(chain({ error: new Error('denied'), data: null }))
  await expect(new SupabaseScheduleRepository().listSlotHistory('a', 'b')).rejects.toThrow('denied')
})
