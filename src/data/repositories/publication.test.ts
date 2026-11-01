import { SupabaseScheduleRepository } from './SupabaseScheduleRepository'
import { supabase } from '@/shared/api/supabase'
jest.mock('@/shared/api/supabase', () => ({supabase:{rpc:jest.fn()}}))
test('publication uses an authenticated RPC and propagates failure', async () => {
  ;(supabase.rpc as jest.Mock).mockResolvedValue({error:new Error('forbidden')})
  await expect(new SupabaseScheduleRepository().updateMassesStatus(['m'],true)).rejects.toThrow('forbidden')
  expect(supabase.rpc).toHaveBeenCalledWith('set_masses_publication',{target_mass_ids:['m'],publish:true})
})
