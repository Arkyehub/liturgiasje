import { supabase } from "@/shared/api/supabase"
import { UnavailableRepository } from "@/domain/repositories/UnavailableRepository"

export class SupabaseUnavailableRepository implements UnavailableRepository {
  async listByProfile(profileId: string): Promise<string[]> {
    const { data, error } = await supabase.from('unavailable_dates').select('date').eq('profile_id', profileId)
    if (error) throw error
    return data.map(d => d.date)
  }

  async listManyByDate(date: string): Promise<string[]> {
    const { data, error } = await supabase.from('unavailable_dates').select('profile_id').eq('date', date)
    if (error) throw error
    return data.map(d => d.profile_id)
  }

  async toggleDate(profileId: string, date: string): Promise<{ action: 'added' | 'removed' }> {
    const { data, error: checkError } = await supabase.from('unavailable_dates').select('id').eq('profile_id', profileId).eq('date', date).maybeSingle()
    if (checkError) throw checkError

    if (data) {
      const { error: deleteError } = await supabase.from('unavailable_dates').delete().eq('id', data.id)
      if (deleteError) throw deleteError
      return { action: 'removed' }
    } else {
      const { error: insertError } = await supabase.from('unavailable_dates').insert({ profile_id: profileId, date })
      if (insertError) throw insertError
      return { action: 'added' }
    }
  }
}
