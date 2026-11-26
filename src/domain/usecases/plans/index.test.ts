import { ListPlans, OpenPlan, GetPlan, CopyPlan, SavePlan, ConcludePlan, ReopenPlan, DiscardPlan } from '.'
import { SchedulePlanRepository } from '@/domain/repositories/SchedulePlanRepository'

const repo = {
  list: jest.fn(), open: jest.fn(), get: jest.fn(), copy: jest.fn(), save: jest.fn(),
  conclude: jest.fn(), reopen: jest.fn(), discard: jest.fn()
}
const repository = repo as unknown as SchedulePlanRepository

beforeEach(() => jest.clearAllMocks())

test.each([
  ['list', new ListPlans(repository), [['2026-12']]],
  ['open', new OpenPlan(repository), ['2026-12', 's']],
  ['get', new GetPlan(repository), ['p']],
  ['copy', new CopyPlan(repository), ['p', 's', false]],
  ['save', new SavePlan(repository), ['p', 's', 'r', 1, { a: 1 }]],
  ['conclude', new ConcludePlan(repository), ['p', 's']],
  ['reopen', new ReopenPlan(repository), ['p', 's']],
  ['discard', new DiscardPlan(repository), ['p']]
] as const)('%s delegates to repository', async (method, usecase, args) => {
  const key = method as keyof typeof repo
  repo[key].mockResolvedValue('result')
  const execute = usecase.execute as (...a: unknown[]) => Promise<unknown>
  expect(await execute.apply(usecase, args as unknown as unknown[])).toBe('result')
  expect(repo[key]).toHaveBeenCalledWith(...(args as unknown as unknown[]))
})
