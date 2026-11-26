import { SupabaseUnavailableRepository } from './SupabaseUnavailableRepository'
import { supabase } from '@/shared/api/supabase'
jest.mock('@/shared/api/supabase', () => ({ supabase: { from: jest.fn() } }))

type Builder = {
  select: jest.Mock; gte: jest.Mock; lte: jest.Mock; order: jest.Mock; range: jest.Mock
  then: (resolve: (value: unknown) => unknown) => unknown
}
const chain = (result: unknown): Builder => {
  const builder: Builder = {
    select: jest.fn(() => builder),
    gte: jest.fn(() => builder),
    lte: jest.fn(() => builder),
    order: jest.fn(() => builder),
    range: jest.fn(() => builder),
    then: (resolve) => resolve(result)
  }
  return builder
}

beforeEach(() => jest.clearAllMocks())

test('groups unavailable profile ids by date within the range', async () => {
  const builder = chain({
    error: null,
    data: [
      { date: '2026-12-06', profile_id: 'p1' },
      { date: '2026-12-06', profile_id: 'p2' },
      { date: '2026-12-13', profile_id: 'p1' }
    ]
  })
  ;(supabase.from as jest.Mock).mockReturnValue(builder)

  const result = await new SupabaseUnavailableRepository().listForRange('2026-12-01', '2026-12-31')

  expect(supabase.from).toHaveBeenCalledWith('unavailable_dates')
  expect(builder.gte).toHaveBeenCalledWith('date', '2026-12-01')
  expect(builder.lte).toHaveBeenCalledWith('date', '2026-12-31')
  expect(result).toEqual({ '2026-12-06': ['p1', 'p2'], '2026-12-13': ['p1'] })
})

test('returns empty object when nothing is unavailable', async () => {
  ;(supabase.from as jest.Mock).mockReturnValue(chain({ error: null, data: null }))
  expect(await new SupabaseUnavailableRepository().listForRange('a', 'b')).toEqual({})
})

test('propagates database errors', async () => {
  ;(supabase.from as jest.Mock).mockReturnValue(chain({ error: new Error('denied'), data: null }))
  await expect(new SupabaseUnavailableRepository().listForRange('a', 'b')).rejects.toThrow('denied')
})

test('paginates with stable order and merges all pages', async () => {
  const first = chain({ error: null, data: Array.from({ length: 1000 }, (_, i) => ({ date: '2026-12-06', profile_id: `p${i}` })) })
  const second = chain({ error: null, data: [{ date: '2026-12-13', profile_id: 'x' }] })
  ;(supabase.from as jest.Mock).mockReturnValueOnce(first).mockReturnValueOnce(second)

  const result = await new SupabaseUnavailableRepository().listForRange('2026-12-01', '2026-12-31')

  expect(result['2026-12-06']).toHaveLength(1000)
  expect(result['2026-12-13']).toEqual(['x'])
  expect(first.order).toHaveBeenCalledWith('id', { ascending: true })
  expect(second.range).toHaveBeenCalledWith(1000, 1999)
})
