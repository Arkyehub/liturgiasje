import { SupabaseScheduleRepository } from './SupabaseScheduleRepository'
import { supabase } from '@/shared/api/supabase'
jest.mock('@/shared/api/supabase', () => ({ supabase: { from: jest.fn() } }))

type Builder = { select: jest.Mock; eq: jest.Mock; then: (resolve: (value: unknown) => unknown) => unknown }
const chain = (result: unknown): Builder => {
  const builder: Builder = { select: jest.fn(() => builder), eq: jest.fn(() => builder), then: (resolve) => resolve(result) }
  return builder
}

beforeEach(() => jest.clearAllMocks())

test('lists only published readings of the member, newest first, with swap flag', async () => {
  const builder = chain({
    error: null,
    data: [
      { id: 's1', mass_id: 'm1', role: '1L', is_confirmed: true, profile_id: 'p', original_profile_id: null, mass: { date: '2026-03-01', time: '07:00:00', special_description: null } },
      { id: 's2', mass_id: 'm2', role: 'C', is_confirmed: false, profile_id: 'p', original_profile_id: 'other', mass: { date: '2026-05-10', time: '09:00:00', special_description: 'Páscoa' } },
      { id: 's3', mass_id: 'm3', role: 'P', is_confirmed: true, profile_id: 'p', original_profile_id: 'p', mass: { date: '2026-05-10', time: '19:00:00', special_description: null } }
    ]
  })
  ;(supabase.from as jest.Mock).mockReturnValue(builder)

  const readings = await new SupabaseScheduleRepository().listReadingsByProfile('p')

  expect(supabase.from).toHaveBeenCalledWith('schedule_slots')
  expect(builder.eq).toHaveBeenCalledWith('profile_id', 'p')
  expect(builder.eq).toHaveBeenCalledWith('mass.is_published', true)
  expect(readings.map(r => r.slotId)).toEqual(['s3', 's2', 's1'])
  expect(readings[1]).toMatchObject({ time: '09:00', specialDescription: 'Páscoa', isSwapTakeover: true })
  expect(readings[0].isSwapTakeover).toBe(false)
})

test('works when the database has no original_profile_id column', async () => {
  const builder = chain({
    error: null,
    data: [{ id: 's1', mass_id: 'm1', role: 'L', is_confirmed: false, profile_id: 'p', mass: { date: '2026-03-01', time: '07:00:00', special_description: null } }]
  })
  ;(supabase.from as jest.Mock).mockReturnValue(builder)

  const readings = await new SupabaseScheduleRepository().listReadingsByProfile('p')

  expect(builder.select).toHaveBeenCalledWith(expect.stringMatching(/^\*,/))
  expect(readings).toHaveLength(1)
  expect(readings[0].isSwapTakeover).toBe(false)
})

test('propagates database errors', async () => {
  ;(supabase.from as jest.Mock).mockReturnValue(chain({ error: new Error('denied'), data: null }))
  await expect(new SupabaseScheduleRepository().listReadingsByProfile('p')).rejects.toThrow('denied')
})
