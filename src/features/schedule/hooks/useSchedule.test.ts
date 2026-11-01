import { act, renderHook } from '@testing-library/react'
import { useSchedule } from './useSchedule'
import { makeConfirmScheduleSlot, makeListSchedulesForMonth } from '@/main/factories/usecases/schedule'
jest.mock('@/main/factories/usecases/schedule',()=>({makeConfirmScheduleSlot:jest.fn(),makeListSchedulesForMonth:jest.fn()}))
jest.mock('sonner',()=>({toast:{error:jest.fn()}}))
test('keeps the displayed schedule unchanged when confirmation fails',async()=>{
 ;(makeListSchedulesForMonth as jest.Mock).mockReturnValue({execute:async()=>[{id:'m',slots:[{id:'s',isConfirmed:false}]}]})
 ;(makeConfirmScheduleSlot as jest.Mock).mockReturnValue({execute:async()=>{throw new Error('denied')}})
 const {result}=renderHook(()=>useSchedule())
 await act(async()=>{await result.current.loadSchedule(new Date('2099-01-01'))})
 await act(async()=>{await expect(result.current.confirmSlot('s','p')).rejects.toThrow('denied')})
 expect(result.current.schedule[0].slots[0].isConfirmed).toBe(false)
})
