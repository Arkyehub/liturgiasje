import { SupabaseScheduleRepository } from './SupabaseScheduleRepository'
import { supabase } from '@/shared/api/supabase'
jest.mock('@/shared/api/supabase', () => ({ supabase: { rpc: jest.fn() } }))
jest.mock('@/shared/api/LiturgyService', () => ({ LiturgyService: { getLiturgyColorForDate: jest.fn().mockResolvedValue(null) } }))
test('edits a mass and its slots in one database operation', async () => {
  ;(supabase.rpc as jest.Mock).mockResolvedValue({ error: null })
  const mass = {date:'2026-12-01',time:'10:00',monthReference:'2026-12'}
  const slots = [{id:'slot-id',role:'1L',profileId:'profile-id'}]
  await new SupabaseScheduleRepository().updateMass('mass-id', mass, slots)
  expect(supabase.rpc).toHaveBeenCalledWith('update_mass_with_slots', expect.objectContaining({target_mass_id:'mass-id',slot_data:slots}))
})
