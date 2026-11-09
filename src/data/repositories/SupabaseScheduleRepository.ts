import { supabase } from "@/shared/api/supabase"
import { MemberReading, Mass, ScheduleSlot, SwapRequest, CreateMassData, CreateSlotData, ScheduleBatchEntry, RemovedMass } from "@/domain/models/Schedule"
import { ScheduleRepository } from "@/domain/repositories/ScheduleRepository"
import { startOfMonth, endOfMonth, format, parseISO } from "date-fns"
import { ptBR } from "date-fns/locale"
import { LiturgyService } from "@/shared/api/LiturgyService"

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
        authUserId: profile.auth_user_id,
        archivedAt: profile.archived_at
      } : null,
      readerName: profile?.full_name || "---",
      avatarUrl: profile?.avatar_url || null,
      isActive: !!profile?.auth_user_id,
      originalProfile: slot.original_profile_id ? { 
        archivedAt: profilesMap[slot.original_profile_id]?.archived_at,
        fullName: profilesMap[slot.original_profile_id]?.full_name, 
        avatarUrl: profilesMap[slot.original_profile_id]?.avatar_url 
      } : null
    }
  }

  async saveScheduleBatch(entries: ScheduleBatchEntry[], removed: RemovedMass[]): Promise<void> {
    const payload = await Promise.all(entries.map(async entry => ({
      mass_id: entry.massId || null,
      mass_data: { date: entry.massData.date, time: entry.massData.time, special_description: entry.massData.specialDescription || null, month_reference: entry.massData.monthReference, expected_revision: entry.massData.expectedRevision, liturgical_color: await LiturgyService.getLiturgyColorForDate(entry.massData.date) || null },
      slot_data: entry.slots
    })))
    const { error } = await supabase.rpc('save_schedule_batch', { entries: payload, deleted_masses: removed })
    if (error) throw error
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
      const { data: profiles } = await supabase.from('profiles').select('id, full_name, avatar_url, auth_user_id, archived_at').in('id', Array.from(profileIds))
      if (profiles) profilesMap = Object.fromEntries(profiles.map(p => [p.id, p]))
    }

    const slotIds = (masses || []).flatMap(m => m.slots.map((slot: { id: string }) => slot.id))
    const historyBySlot: Record<string, { fullName: string; occurredAt: string; archived: boolean }[]> = {}
    if (slotIds.length) {
      const { data: history, error: historyError } = await supabase.from('schedule_assignment_history')
        .select('slot_id, occurred_at, profile:profiles!profile_id(full_name, archived_at)')
        .in('slot_id', slotIds).order('occurred_at', { ascending: true })
      if (historyError) throw historyError
      for (const event of history || []) {
        const profile = Array.isArray(event.profile) ? event.profile[0] : event.profile
        if (profile?.full_name) (historyBySlot[event.slot_id] ||= []).push({ fullName: profile.full_name, occurredAt: event.occurred_at, archived: !!profile.archived_at })
      }
    }
    if (isAdmin) {
      (masses || []).forEach(async mass => {
        if (mass.liturgical_color) return
        try {
          const color = await LiturgyService.getLiturgyColorForDate(mass.date)
          if (color) await supabase.rpc('set_missing_mass_color', { target_mass_id: mass.id, color })
        } catch (error) {
          console.error('Erro ao atualizar cor litúrgica:', error)
        }
      })
    }
    return (masses || []).map(mass => ({
      id: mass.id,
      scheduleRevision: mass.schedule_revision,
      date: mass.date,
      time: mass.time,
      specialDescription: mass.special_description,
      monthReference: mass.month_reference,
      isPublished: mass.is_published,
      liturgicalColor: mass.liturgical_color,
      slots: mass.slots.map((s: any) => ({ ...this.mapSlotToDomain(s, profilesMap), previousAssignments: historyBySlot[s.id] || [] }))
    }))
  }

  async confirmSlot(slotId: string, profileId: string): Promise<ScheduleSlot> {
    const { data, error } = await supabase.rpc('perform_slot_action', { target_slot_id: slotId, action_name: 'confirm', requested_profile_id: profileId })
    if (error) throw error
    if (!data?.slot || !data.profile) throw new Error('SLOT_ACTION_FAILED')
    return this.mapSlotToDomain(data.slot, { [data.profile.id]: data.profile })
  }

  async requestSwap(slotId: string): Promise<void> {
    const { error } = await supabase.rpc('perform_slot_action', { target_slot_id: slotId, action_name: 'request_swap' })
    if (error) throw error
    await fetch('/api/push/send', { method: 'POST', body: JSON.stringify({ title: 'Solicitação de Troca', body: 'Alguém solicitou uma troca de escala. Confira no mural!', url: '/' }), headers: { 'Content-Type': 'application/json' } }).catch(err => console.error(err))
  }

  async cancelSwapRequest(slotId: string): Promise<void> {
    const { error } = await supabase.rpc('perform_slot_action', { target_slot_id: slotId, action_name: 'cancel_swap' })
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
    const color = await LiturgyService.getLiturgyColorForDate(massData.date)
    const { data: mass, error } = await supabase.rpc('create_mass_with_slots', {
      mass_data: { date: massData.date, time: massData.time, special_description: massData.specialDescription || null, month_reference: massData.monthReference, liturgical_color: color || null },
      slot_data: slots
    })
    if (error) throw error
    if (!mass) throw new Error('CREATE_MASS_FAILED')
    return { id: mass.id, scheduleRevision: mass.schedule_revision, date: mass.date, time: mass.time, specialDescription: mass.special_description, monthReference: mass.month_reference, isPublished: mass.is_published, liturgicalColor: mass.liturgical_color, slots: [] }
  }
  async publishMonth(monthReference: string): Promise<void> {
    const { data: masses, error: publishError } = await supabase.rpc('publish_mass_month', { target_month: monthReference })
    if (publishError) throw publishError
    if (masses && masses.length > 0) {
      const massIds = masses.map((m: { id: string }) => m.id)
      
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
    const color = await LiturgyService.getLiturgyColorForDate(massData.date)
    const { error } = await supabase.rpc('update_mass_with_slots', {
      target_mass_id: massId,
      mass_data: { date: massData.date, time: massData.time, special_description: massData.specialDescription || null, month_reference: massData.monthReference, liturgical_color: color || null, expected_revision: massData.expectedRevision },
      slot_data: slots
    })
    if (error) throw error
  }
  async listAllSwaps(): Promise<SwapRequest[]> {
    const today = format(new Date(), 'yyyy-MM-dd')

    const { data, error } = await supabase
      .from('schedule_slots')
      .select(`id, role, profile_id, is_swap_requested, profile:profiles!profile_id (full_name, avatar_url, auth_user_id), mass:masses!inner (date, time, special_description)`)
      .eq('is_swap_requested', true)
      .gte('mass.date', today)

    if (error) throw error
    const mapped = (data || []).map(s => ({
      ...this.mapSlotToDomain(s, s.profile ? { [s.profile_id]: s.profile } : {}),
      mass: s.mass ? { 
        date: (s.mass as any).date, 
        time: (s.mass as any).time, 
        specialDescription: (s.mass as any).special_description 
      } : null
    })) as SwapRequest[]

    return mapped.sort((a, b) => {
      if (!a.mass || !b.mass) return 0;
      const dateTimeA = new Date(`${a.mass.date}T${a.mass.time}`);
      const dateTimeB = new Date(`${b.mass.date}T${b.mass.time}`);
      return dateTimeA.getTime() - dateTimeB.getTime();
    });
  }

  async deleteMasses(massIds: string[]): Promise<void> {
    const { error } = await supabase.rpc('delete_masses_safely', { target_mass_ids: massIds })
    if (error) throw error
  }
  async deleteMass(massId: string): Promise<void> {
    const { error } = await supabase.rpc('delete_mass_safely', { target_mass_id: massId })
    if (error) throw error
  }
  async acceptSwap(slotId: string, newProfileId: string): Promise<void> {
    const { data, error } = await supabase.rpc('perform_slot_action', { target_slot_id: slotId, action_name: 'accept_swap', requested_profile_id: newProfileId })
    if (error) throw error
    if (!data?.slot) throw new Error('SLOT_ACTION_FAILED')
    if (data.previous_auth_user_id) {
      await fetch('/api/push/send', { method: 'POST', body: JSON.stringify({ title: 'Troca Confirmada! ✅', body: `${data.profile?.full_name || 'Alguém'} aceitou sua troca de ${data.slot.role}.`, url: '/', targetUserIds: [data.previous_auth_user_id] }), headers: { 'Content-Type': 'application/json' } }).catch(err => console.error('Erro ao notificar aceite de troca:', err))
    }
  }
  async checkMassExists(date: string): Promise<Mass[]> {
    const { data, error } = await supabase.from('masses').select('*').eq('date', date)
    if (error) throw error
    return (data || []).map(mass => ({
      id: mass.id,
      scheduleRevision: mass.schedule_revision,
      date: mass.date,
      time: mass.time,
      specialDescription: mass.special_description,
      monthReference: mass.month_reference,
      isPublished: mass.is_published,
      liturgicalColor: mass.liturgical_color,
      slots: []
    }))
  }

  async updateMassesStatus(massIds: string[], isPublished: boolean): Promise<void> {
    const { error } = await supabase.rpc('set_masses_publication', { target_mass_ids: massIds, publish: isPublished })
    if (error) throw error
  }

  async listOccupiedDatesForMonth(monthReference: string): Promise<string[]> {
    const { data, error } = await supabase.from('masses').select('date').eq('month_reference', monthReference)
    if (error) throw error
    return [...new Set((data || []).map(m => m.date))]
  }

  async listReadingsByProfile(profileId: string): Promise<MemberReading[]> {
    const { data, error } = await supabase
      .from('schedule_slots')
      // select('*') de propósito: original_profile_id não existe em todos os bancos (ex.: Production),
      // e pedir a coluna explicitamente faria a consulta inteira falhar com 400.
      .select('*, mass:masses!inner(date, time, special_description, is_published)')
      .eq('profile_id', profileId)
      .eq('mass.is_published', true)

    if (error) throw error

    return (data || [])
      .map((slot: any) => {
        const mass = Array.isArray(slot.mass) ? slot.mass[0] : slot.mass
        return {
          slotId: slot.id,
          massId: slot.mass_id,
          date: mass.date,
          time: String(mass.time).slice(0, 5),
          role: slot.role,
          specialDescription: mass.special_description ?? null,
          isConfirmed: !!slot.is_confirmed,
          isSwapTakeover: !!slot.original_profile_id && slot.original_profile_id !== slot.profile_id
        } as MemberReading
      })
      .sort((a, b) => (a.date === b.date ? b.time.localeCompare(a.time) : b.date.localeCompare(a.date)))
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
      const { data: profiles } = await supabase.from('profiles').select('id, full_name, avatar_url, auth_user_id, archived_at').in('id', Array.from(profileIds))
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
          liturgicalColor: massData.liturgical_color,
          slots: []
        })
      }
      const mass = massMap.get(massData.id)!
      mass.slots.push(this.mapSlotToDomain(s, profilesMap))
    })

    return Array.from(massMap.values())
  }
}
