import { SupabaseScheduleRepository } from './SupabaseScheduleRepository'
import { supabase } from '@/shared/api/supabase'
jest.mock('@/shared/api/supabase', () => ({ supabase: { rpc: jest.fn() } }))
test('deletes a mass and its related data through one transaction', async () => {
  ;(supabase.rpc as jest.Mock).mockResolvedValue({error:null})
  await new SupabaseScheduleRepository().deleteMass('mass-id')
  expect(supabase.rpc).toHaveBeenCalledWith('delete_mass_safely', {target_mass_id:'mass-id'})
})
test('propagates transaction failures', async () => {
  ;(supabase.rpc as jest.Mock).mockResolvedValue({error:new Error('history')})
  await expect(new SupabaseScheduleRepository().deleteMass('mass-id')).rejects.toThrow('history')
})
