import { render, screen } from '@testing-library/react'
import { ScheduleCard } from './ScheduleCard'
jest.mock('@/shared/api/LiturgyService', () => ({ LiturgyService: {getLiturgyColorForDate: jest.fn().mockResolvedValue(null)} }))
test('identifies archived historical readers and preserves prior assignment context', () => {
  render(<ScheduleCard date="01/12" rawDate={new Date('2099-12-01T12:00:00')} items={[{id:'mass',time:'10:00',slots:[{id:'one',role:'1L',readerName:'Maria',readerArchived:true,isConfirmed:false,isSwapRequested:false,previousAssignments:[{fullName:'João',occurredAt:'2026-01-01',archived:true}]}]}]} />)
  expect(screen.getByText('Maria · membro removido')).toHaveClass('text-red-700')
  expect(screen.getByText(/Anteriormente: João · membro removido/)).toBeInTheDocument()
})
