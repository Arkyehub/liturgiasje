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

  async listForRange(fromDate: string, toDate: string): Promise<Record<string, string[]>> {
    // PostgREST trunca em 1000 linhas sem erro: pagina com order estável (id único).
    const PAGE_SIZE = 1000
    const byDate: Record<string, string[]> = {}
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from('unavailable_dates')
        .select('date, profile_id')
        .gte('date', fromDate)
        .lte('date', toDate)
        .order('id', { ascending: true })
        .range(from, from + PAGE_SIZE - 1)
      if (error) throw error
      const page = data || []
      for (const row of page) (byDate[row.date] ||= []).push(row.profile_id)
      if (page.length < PAGE_SIZE) break
    }
    return byDate
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
