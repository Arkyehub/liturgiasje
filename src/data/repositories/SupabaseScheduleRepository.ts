import { supabase } from "@/shared/api/supabase"
import { Mass, ScheduleSlot, SwapRequest, CreateMassData, CreateSlotData } from "@/domain/models/Schedule"
import { ScheduleRepository } from "@/domain/repositories/ScheduleRepository"
import { startOfMonth, endOfMonth, format, parseISO } from "date-fns"
import { ptBR } from "date-fns/locale"

export class SupabaseScheduleRepository implements ScheduleRepository {
  private mapSlotToDomain(slot: any, profilesMap: Record<string, any>): ScheduleSlot {
    const profile = profilesMap[slot.profile_id] || null

    return {
      id: slot.id,
      massId: slot.mass_id,
      role: slot.role,
      profileId: slot.profile_id,
      originalProfileId: slot.original_profile_id,
      isConfirmed: slot.is_confirmed,
      isSwapRequested: slot.is_swap_requested,
      createdAt: slot.created_at,
      profile: profile ? { 
        fullName: profile.full_name, 
        avatarUrl: profile.avatar_url,
        authUserId: profile.auth_user_id
      } : null,
      readerName: profile?.full_name || "---",
      avatarUrl: profile?.avatar_url || null,
      isActive: !!profile?.auth_user_id,
      originalProfile: slot.original_profile_id ? { 
        fullName: profilesMap[slot.original_profile_id]?.full_name, 
        avatarUrl: profilesMap[slot.original_profile_id]?.avatar_url 
      } : null
    }
  }

  async listForMonth(date: Date, isAdmin: boolean = false): Promise<Mass[]> {
    const start = startOfMonth(date)
    const end = endOfMonth(date)

    let query = supabase.from('masses').select(`*, slots:schedule_slots (*)`)
    if (!isAdmin) query = query.eq('is_published', true)

    const { data: masses, error } = await query
      .gte('date', format(start, 'yyyy-MM-dd'))
      .lte('date', format(end, 'yyyy-MM-dd'))
      .order('date', { ascending: true })
      .order('time', { ascending: true })
      .order('created_at', { foreignTable: 'schedule_slots', ascending: true })

    if (error) throw error

    const profileIds = new Set<string>()
    for (const mass of masses || []) {
      for (const slot of mass.slots) {
        if (slot.profile_id) profileIds.add(slot.profile_id)
        if (slot.original_profile_id) profileIds.add(slot.original_profile_id)
      }
    }

    let profilesMap: Record<string, any> = {}
    if (profileIds.size > 0) {
      const { data: profiles } = await supabase.from('profiles').select('id, full_name, avatar_url, auth_user_id').in('id', Array.from(profileIds))
      if (profiles) profilesMap = Object.fromEntries(profiles.map(p => [p.id, p]))
    }

    return (masses || []).map(mass => ({
      id: mass.id,
      date: mass.date,
      time: mass.time,
      specialDescription: mass.special_description,
      monthReference: mass.month_reference,
      isPublished: mass.is_published,
      slots: mass.slots.map((s: any) => this.mapSlotToDomain(s, profilesMap))
    }))
  }

  async confirmSlot(slotId: string, profileId: string): Promise<ScheduleSlot> {
    const { data, error } = await supabase
      .from('schedule_slots')
      .update({ is_confirmed: true, profile_id: profileId })
      .eq('id', slotId)
      .select(`*, profile:profiles(id, full_name, avatar_url, auth_user_id)`)
      .single()
    
    if (error) throw error
    
    const p = (data as any).profile
    const profilesMap = p ? { [p.id]: p } : {}
    return this.mapSlotToDomain(data, profilesMap)
  }

  async requestSwap(slotId: string): Promise<void> {
    const { error } = await supabase.from('schedule_slots').update({ is_swap_requested: true }).eq('id', slotId)
    if (error) throw error
    
    await fetch('/api/push/send', {
      method: 'POST',
      body: JSON.stringify({ title: 'Solicitação de Troca', body: 'Alguém solicitou uma troca de escala. Confira no mural!', url: '/' }),
      headers: { 'Content-Type': 'application/json' }
    }).catch(err => console.error(err))
  }

  async cancelSwapRequest(slotId: string): Promise<void> {
    const { error } = await supabase.from('schedule_slots').update({ is_swap_requested: false }).eq('id', slotId)
    if (error) throw error
  }

  async getProfilesUsage(monthReference: string): Promise<Record<string, number>> {
    const { data, error } = await supabase.from('schedule_slots').select(`profile_id, mass:masses!inner(month_reference)`).eq('mass.month_reference', monthReference)
    if (error) throw error
    const counts: Record<string, number> = {}
    data?.forEach((slot: any) => { if (slot.profile_id) counts[slot.profile_id] = (counts[slot.profile_id] || 0) + 1 })
    return counts
  }

  async createMassWithSlots(massData: CreateMassData, slots: CreateSlotData[]): Promise<Mass> {
    const payload = {
      date: massData.date,
      time: massData.time,
      special_description: massData.specialDescription,
      month_reference: massData.monthReference,
      is_published: false
    }
    const { data: mass, error: massError } = await supabase.from('masses').insert(payload).select().single()
    if (massError) throw massError
    if (slots.length > 0) {
      const slotsToInsert = slots.map(slot => ({ mass_id: mass.id, role: slot.role, profile_id: slot.profileId }))
      const { error: slotsError } = await supabase.from('schedule_slots').insert(slotsToInsert)
      if (slotsError) throw slotsError
    }
    return mass as Mass
  }

  async publishMonth(monthReference: string): Promise<void> {
    const { data: masses, error: publishError } = await supabase.from('masses').update({ is_published: true }).eq('month_reference', monthReference).select('id, date')
    if (publishError) throw publishError
    if (masses && masses.length > 0) {
      const massIds = masses.map(m => m.id)
      
      const { data: slots } = await supabase
        .from('schedule_slots')
        .select('profile_id')
        .in('mass_id', massIds)

      if (slots && slots.length > 0) {
        const profileIds = Array.from(new Set(slots.map(s => s.profile_id).filter(Boolean)))

        if (profileIds.length > 0) {
          const { data: profiles } = await supabase.from('profiles').select('auth_user_id').in('id', profileIds)
          const targetUserIds = profiles?.map(p => p.auth_user_id).filter(Boolean) as string[]

          if (targetUserIds && targetUserIds.length > 0) {
            const monthName = format(parseISO(masses[0].date), 'MMMM', { locale: ptBR })
            
            await fetch('/api/push/send', {
              method: 'POST',
              body: JSON.stringify({ 
                title: 'Você foi escalado! 📅', 
                body: `Confira seus horários de leitura na nova escala de ${monthName}.`, 
                url: '/', 
                targetUserIds 
              }),
              headers: { 'Content-Type': 'application/json' }
            }).catch(err => console.error('Erro ao notificar escala:', err))
          }
        }
      }
    }
  }

  async updateMass(massId: string, massData: CreateMassData, slots: CreateSlotData[]): Promise<void> {
    const payload = {
      date: massData.date,
      time: massData.time,
      special_description: massData.specialDescription,
      month_reference: massData.monthReference,
      is_published: false
    }
    const { error: massError } = await supabase.from('masses').update(payload).eq('id', massId)
    if (massError) throw massError
    const { error: deleteError } = await supabase.from('schedule_slots').delete().eq('mass_id', massId)
    if (deleteError) throw deleteError
    if (slots.length > 0) {
      const slotsToInsert = slots.map(slot => ({ mass_id: massId, role: slot.role, profile_id: slot.profileId }))
      const { error: slotsError } = await supabase.from('schedule_slots').insert(slotsToInsert)
      if (slotsError) throw slotsError
    }
  }

  async listAllSwaps(): Promise<SwapRequest[]> {
    const { data, error } = await supabase
      .from('schedule_slots')
      .select(`id, role, profile_id, is_swap_requested, profile:profiles!profile_id (full_name, avatar_url, auth_user_id), mass:masses (date, time, special_description)`)
      .eq('is_swap_requested', true)
      .gte('mass.date', new Date().toISOString().split('T')[0])
      .order('mass(date)', { ascending: true })

    if (error) throw error
    return (data || []).map(s => ({
      ...this.mapSlotToDomain(s, s.profile ? { [s.profile_id]: s.profile } : {}),
      mass: { 
        date: (s.mass as any)?.date, 
        time: (s.mass as any)?.time, 
        specialDescription: (s.mass as any)?.special_description 
      }
    })) as SwapRequest[]
  }

  async deleteMass(massId: string): Promise<void> {
    const { data: slots, error: fetchSlotsError } = await supabase.from('schedule_slots').select('id').eq('mass_id', massId)
    if (fetchSlotsError) throw fetchSlotsError

    if (slots && slots.length > 0) {
      const slotIds = slots.map(s => s.id)
      await supabase.from('announcements').delete().in('related_schedule_slot_id', slotIds)
      await supabase.from('schedule_slots').delete().in('id', slotIds)
    }

    const { error: massError } = await supabase.from('masses').delete().eq('id', massId)
    if (massError) throw massError
  }

  async acceptSwap(slotId: string, newProfileId: string): Promise<void> {
    const { data: slot } = await supabase
      .from('schedule_slots')
      .select('profile_id, role')
      .eq('id', slotId)
      .single()

    const oldProfileId = slot?.profile_id
    const role = slot?.role

    const { error } = await supabase
      .from('schedule_slots')
      .update({ 
        profile_id: newProfileId, 
        is_swap_requested: false, 
        is_confirmed: true 
      })
      .eq('id', slotId)
    
    if (error) throw error

    if (oldProfileId && oldProfileId !== newProfileId) {
      const { data: oldProfile } = await supabase.from('profiles').select('auth_user_id').eq('id', oldProfileId).single()
      const { data: accepter } = await supabase.from('profiles').select('full_name').eq('id', newProfileId).single()
      
      if (oldProfile?.auth_user_id) {
        await fetch('/api/push/send', {
          method: 'POST',
          body: JSON.stringify({ 
            title: 'Troca Confirmada! ✅', 
            body: `${accepter?.full_name || 'Alguém'} aceitou sua troca de ${role}.`, 
            url: '/',
            targetUserIds: [oldProfile.auth_user_id]
          }),
          headers: { 'Content-Type': 'application/json' }
        }).catch(err => console.error('Erro ao notificar aceite de troca:', err))
      }
    }
  }

  async checkMassExists(date: string): Promise<Mass[]> {
    const { data, error } = await supabase.from('masses').select('*').eq('date', date)
    if (error) throw error
    return (data || []).map(mass => ({
      id: mass.id,
      date: mass.date,
      time: mass.time,
      specialDescription: mass.special_description,
      monthReference: mass.month_reference,
      isPublished: mass.is_published,
      slots: []
    }))
  }

  async updateMassesStatus(massIds: string[], isPublished: boolean): Promise<void> {
    await supabase.from('masses').update({ is_published: isPublished }).in('id', massIds)
  }

  async listOccupiedDatesForMonth(monthReference: string): Promise<string[]> {
    const { data, error } = await supabase.from('masses').select('date').eq('month_reference', monthReference)
    if (error) throw error
    return [...new Set((data || []).map(m => m.date))]
  }

  async listUpcomingForUser(profileId: string): Promise<Mass[]> {
    const today = new Date().toISOString().split('T')[0]
    
    const { data: slots, error } = await supabase
      .from('schedule_slots')
      .select(`*, mass:masses!inner(*)`)
      .eq('mass.is_published', true)
      .gte('mass.date', today)
      .eq('profile_id', profileId)
      .order('mass(date)', { ascending: true })
      .order('mass(time)', { ascending: true })

    if (error) throw error
    if (!slots || slots.length === 0) return []

    const profileIds = new Set<string>()
    slots.forEach(s => {
      if (s.profile_id) profileIds.add(s.profile_id)
    })

    let profilesMap: Record<string, any> = {}
    if (profileIds.size > 0) {
      const { data: profiles } = await supabase.from('profiles').select('id, full_name, avatar_url, auth_user_id').in('id', Array.from(profileIds))
      if (profiles) profilesMap = Object.fromEntries(profiles.map(p => [p.id, p]))
    }

    const massMap = new Map<string, Mass>()
    slots.forEach(s => {
      const massData = s.mass as any
      if (!massMap.has(massData.id)) {
        massMap.set(massData.id, {
          id: massData.id,
          date: massData.date,
          time: massData.time,
          specialDescription: massData.special_description,
          monthReference: massData.month_reference,
          isPublished: massData.is_published,
          slots: []
        })
      }
      const mass = massMap.get(massData.id)!
      mass.slots.push(this.mapSlotToDomain(s, profilesMap))
    })

    return Array.from(massMap.values())
  }
}
