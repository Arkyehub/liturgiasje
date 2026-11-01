import { SupabaseScheduleRepository } from './SupabaseScheduleRepository'
import { supabase } from '@/shared/api/supabase'
jest.mock('@/shared/api/supabase',()=>({supabase:{rpc:jest.fn()}}))
test('deletes all masses in a single RPC',async()=>{
 ;(supabase.rpc as jest.Mock).mockResolvedValue({error:null})
 await new SupabaseScheduleRepository().deleteMasses(['a','b'])
 expect(supabase.rpc).toHaveBeenCalledWith('delete_masses_safely',{target_mass_ids:['a','b']})
})
