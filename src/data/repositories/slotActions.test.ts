import { SupabaseScheduleRepository } from './SupabaseScheduleRepository'
import { supabase } from '@/shared/api/supabase'
jest.mock('@/shared/api/supabase', () => ({ supabase: { rpc: jest.fn() } }))
beforeEach(() => jest.clearAllMocks())
test('confirmation uses the authenticated slot action', async () => {
  ;(supabase.rpc as jest.Mock).mockResolvedValue({data:{slot:{id:'s',profile_id:'p',is_confirmed:true},profile:{id:'p',full_name:'Ana'}},error:null})
  expect((await new SupabaseScheduleRepository().confirmSlot('s','p')).isConfirmed).toBe(true)
  expect(supabase.rpc).toHaveBeenCalledWith('perform_slot_action',{target_slot_id:'s',action_name:'confirm',requested_profile_id:'p'})
})
test('swap requests use the slot action and propagate errors', async () => {
  ;(supabase.rpc as jest.Mock).mockResolvedValue({error:new Error('forbidden')})
  await expect(new SupabaseScheduleRepository().requestSwap('s')).rejects.toThrow('forbidden')
  expect(supabase.rpc).toHaveBeenCalledWith('perform_slot_action',{target_slot_id:'s',action_name:'request_swap'})
})
