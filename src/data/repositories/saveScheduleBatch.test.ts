import { SupabaseScheduleRepository } from './SupabaseScheduleRepository'
import { supabase } from '@/shared/api/supabase'
jest.mock('@/shared/api/LiturgyService',()=>({LiturgyService:{getLiturgyColorForDate:jest.fn().mockResolvedValue(null)}}))
jest.mock('@/shared/api/supabase',()=>({supabase:{rpc:jest.fn()}}))
test('saves every edited and removed mass using a single RPC',async()=>{
 ;(supabase.rpc as jest.Mock).mockResolvedValue({error:null})
 const entries=[{massId:'m',massData:{date:'2099-01-01',time:'10:00',monthReference:'2099-01',expectedRevision:3},slots:[]}]
 const removed=[{id:'other',expectedRevision:2}]
 await new SupabaseScheduleRepository().saveScheduleBatch(entries,removed)
 expect(supabase.rpc).toHaveBeenCalledTimes(1)
 expect(supabase.rpc).toHaveBeenCalledWith('save_schedule_batch',expect.objectContaining({deleted_masses:removed}))
})
