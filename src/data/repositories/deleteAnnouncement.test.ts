import { SupabaseAnnouncementRepository } from './SupabaseAnnouncementRepository'
import { supabase } from '@/shared/api/supabase'
jest.mock('@/shared/api/supabase', () => ({supabase:{from:jest.fn(),rpc:jest.fn(),storage:{from:jest.fn()}}}))
test('does not delete media when announcement deletion is denied', async () => {
  ;(supabase.from as jest.Mock).mockReturnValue({select:()=>({eq:()=>({single:async()=>({data:{image_url:'http://storage/storage/v1/object/public/announcement_media/a'},error:null})})})})
  ;(supabase.rpc as jest.Mock).mockResolvedValue({error:new Error('forbidden')})
  await expect(new SupabaseAnnouncementRepository().delete('id')).rejects.toThrow('forbidden')
  expect(supabase.storage.from).not.toHaveBeenCalled()
})
