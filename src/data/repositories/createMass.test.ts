import { SupabaseScheduleRepository } from './SupabaseScheduleRepository'
import { supabase } from '@/shared/api/supabase'
jest.mock('@/shared/api/supabase', () => ({ supabase: { rpc: jest.fn() } }))
jest.mock('@/shared/api/LiturgyService', () => ({ LiturgyService: { getLiturgyColorForDate: jest.fn().mockResolvedValue(null) } }))
test('cria celebração e vagas em uma operação', async () => {
  ;(supabase.rpc as jest.Mock).mockResolvedValue({data:{id:'mass-id',date:'2026-12-01',time:'10:00',month_reference:'2026-12',is_published:false},error:null})
  const slots=[{role:'1L',profileId:'profile-id'}]
  const result=await new SupabaseScheduleRepository().createMassWithSlots({date:'2026-12-01',time:'10:00',monthReference:'2026-12'},slots)
  expect(result.id).toBe('mass-id')
  expect(supabase.rpc).toHaveBeenCalledWith('create_mass_with_slots',expect.objectContaining({slot_data:slots}))
})
test('propaga falha da criação sem retornar sucesso', async () => {
  ;(supabase.rpc as jest.Mock).mockResolvedValue({data:null,error:new Error('invalid slot')})
  await expect(new SupabaseScheduleRepository().createMassWithSlots({date:'2026-12-01',time:'10:00',monthReference:'2026-12'},[])).rejects.toThrow('invalid slot')
})
