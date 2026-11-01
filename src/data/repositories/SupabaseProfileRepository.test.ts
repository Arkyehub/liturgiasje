import { SupabaseProfileRepository } from './SupabaseProfileRepository'
import { supabase } from '@/shared/api/supabase'
jest.mock('@/shared/api/supabase', () => ({ supabase: { from: jest.fn(), rpc: jest.fn() } }))
test('role changes use the protected role function', async () => {
  ;(supabase.rpc as jest.Mock).mockResolvedValue({ error: null })
  ;(supabase.from as jest.Mock).mockReturnValue({select:()=>({eq:()=>({maybeSingle:async()=>({data:{id:'member',role:'admin'},error:null})})})})
  await new SupabaseProfileRepository().update('member', {role:'admin'})
  expect(supabase.rpc).toHaveBeenCalledWith('set_member_role', { target_profile_id: 'member', new_role: 'admin' })
})
