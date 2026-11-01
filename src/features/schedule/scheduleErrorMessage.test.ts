import { scheduleErrorMessage } from './scheduleErrorMessage'
test('explains why a slot with preserved history cannot be removed', () => {
  expect(scheduleErrorMessage({message:'slot_has_assignment_history'}, 'erro')).toMatch(/histórico/i)
})
test('provides the fallback for an unrelated error', () => {
  expect(scheduleErrorMessage(new Error('offline'), 'erro')).toBe('erro')
})
