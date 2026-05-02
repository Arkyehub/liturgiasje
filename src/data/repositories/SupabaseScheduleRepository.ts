import { supabase } from "@/shared/api/supabase"
import { Mass, ScheduleSlot, SwapRequest } from "@/domain/models/Schedule"
import { ScheduleRepository } from "@/domain/repositories/ScheduleRepository"
import { startOfMonth, endOfMonth, format, parseISO } from "date-fns"
import { ptBR } from "date-fns/locale"

export class SupabaseScheduleRepository implements ScheduleRepository {
  private mapSlotToDomain(slot: any, userNames: any, memberNames: any): ScheduleSlot {
    const user = slot.reader_id ? userNames[slot.reader_id] : null
    const member = slot.member_id ? memberNames[slot.member_id] : null

    return {
      id: slot.id,
      massId: slot.mass_id,
      role: slot.role,
      readerId: slot.reader_id,
      memberId: slot.member_id,
      originalReaderId: slot.original_reader_id,
      isConfirmed: slot.is_confirmed,
      isSwapRequested: slot.is_swap_requested,
      createdAt: slot.created_at,
      reader: user ? { fullName: user.full_name, avatarUrl: user.avatar_url } : null,
      member: member ? { fullName: member.full_name } : null,
      readerName: user?.full_name || member?.full_name || "---",
      avatarUrl: user?.avatar_url || (member as any)?.avatar_url || null,
      isClaimed: !!user || !!member?.is_claimed,
      originalReader: slot.original_reader_id ? { 
        fullName: userNames[slot.original_reader_id]?.full_name, 
        avatarUrl: userNames[slot.original_reader_id]?.avatar_url 
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

    const readerIds = new Set<string>()
    const memberIds = new Set<string>()
    for (const mass of masses || []) {
      for (const slot of mass.slots) {
        if (slot.reader_id) readerIds.add(slot.reader_id)
        if (slot.member_id) memberIds.add(slot.member_id)
        if (slot.original_reader_id) readerIds.add(slot.original_reader_id)
      }
    }

    let userNames: Record<string, any> = {}
    let memberNames: Record<string, any> = {}

    if (readerIds.size > 0) {
      const { data: users } = await supabase.from('users').select('id, full_name, avatar_url').in('id', Array.from(readerIds))
      if (users) userNames = Object.fromEntries(users.map(u => [u.id, u]))
    }

    if (memberIds.size > 0) {
      const { data: members } = await supabase.from('members').select('id, full_name, user:users!claimed_by(avatar_url)').in('id', Array.from(memberIds))
      if (members) {
        memberNames = Object.fromEntries(members.map(m => [m.id, { 
          full_name: m.full_name, 
          is_claimed: !!(m as any).user,
          avatar_url: (m as any).user?.avatar_url
        }]))
      }
    }

    return (masses || []).map(mass => ({
      id: mass.id,
      date: mass.date,
      time: mass.time,
      specialDescription: mass.special_description,
      monthReference: mass.month_reference,
      isPublished: mass.is_published,
      slots: mass.slots.map((s: any) => this.mapSlotToDomain(s, userNames, memberNames))
    }))
  }

  async confirmSlot(slotId: string, userId: string): Promise<ScheduleSlot> {
    const { data, error } = await supabase.from('schedule_slots').update({ is_confirmed: true, reader_id: userId }).eq('id', slotId).select().single()
    if (error) throw error
    return this.mapSlotToDomain(data, {}, {}) // Nomes serão recarregados na listagem
  }

  async requestSwap(slotId: string): Promise<void> {
    const { error } = await supabase.from('schedule_slots').update({ is_swap_requested: true }).eq('id', slotId)
    if (error) throw error
    fetch('/api/push/send', {
      method: 'POST',
      body: JSON.stringify({ title: 'Solicitação de Troca', body: 'Alguém solicitou uma troca de escala. Confira no mural!', url: '/' }),
      headers: { 'Content-Type': 'application/json' }
    }).catch(err => console.error(err))
  }

  async cancelSwapRequest(slotId: string): Promise<void> {
    const { error } = await supabase.from('schedule_slots').update({ is_swap_requested: false }).eq('id', slotId)
    if (error) throw error
  }

  async getMembersUsage(monthReference: string): Promise<Record<string, number>> {
    const { data, error } = await supabase.from('schedule_slots').select(`member_id, mass:masses!inner(month_reference)`).eq('mass.month_reference', monthReference)
    if (error) throw error
    const counts: Record<string, number> = {}
    data?.forEach((slot: any) => { if (slot.member_id) counts[slot.member_id] = (counts[slot.member_id] || 0) + 1 })
    return counts
  }

  async createMassWithSlots(massData: any, slots: any[]): Promise<Mass> {
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
      const slotsToInsert = slots.map(slot => ({ mass_id: mass.id, role: slot.role, member_id: slot.memberId }))
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
      const { data: slots } = await supabase.from('schedule_slots').select('member_id').in('mass_id', massIds).not('member_id', 'is', null)
      if (slots && slots.length > 0) {
        const memberIds = [...new Set(slots.map(s => s.member_id))]
        const { data: membersList } = await supabase.from('members').select('claimed_by').in('id', memberIds)
        const targetUserIds = [...new Set((membersList || []).map(m => m.claimed_by).filter(id => !!id))]
        if (targetUserIds.length > 0) {
          const monthName = format(parseISO(masses[0].date), 'MMMM', { locale: ptBR })
          fetch('/api/push/send', {
            method: 'POST',
            body: JSON.stringify({ title: 'Você foi escalado! 📅', body: `Confira seus horários de leitura na nova escala de ${monthName}.`, url: '/', targetUserIds }),
            headers: { 'Content-Type': 'application/json' }
          }).catch(err => console.error(err))
        }
      }
    }
  }

  async updateMass(massId: string, massData: any, slots: any[]): Promise<void> {
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
      const slotsToInsert = slots.map(slot => ({ mass_id: massId, role: slot.role, member_id: slot.memberId }))
      const { error: slotsError } = await supabase.from('schedule_slots').insert(slotsToInsert)
      if (slotsError) throw slotsError
    }
  }

  async listAllSwaps(): Promise<SwapRequest[]> {
    const { data, error } = await supabase
      .from('schedule_slots')
      .select(`id, role, reader_id, member_id, is_swap_requested, reader:users!reader_id (full_name, avatar_url), member:members!member_id (full_name, user:users!claimed_by(avatar_url)), mass:masses (date, time, special_description)`)
      .eq('is_swap_requested', true)
      .gte('mass.date', new Date().toISOString().split('T')[0])
      .order('mass(date)', { ascending: true })

    if (error) throw error
    return (data || []).map(s => ({
      ...this.mapSlotToDomain(s, 
        s.reader ? { [s.reader_id]: s.reader } : {}, 
        s.member ? { [s.member_id]: { ...s.member, avatar_url: (s.member as any).user?.avatar_url } } : {}
      ),
      mass: { 
        date: (s.mass as any)?.date, 
        time: (s.mass as any)?.time, 
        specialDescription: (s.mass as any)?.special_description 
      }
    })) as SwapRequest[]
  }

  async deleteMass(massId: string): Promise<void> {
    // 1. Buscar os IDs dos slots vinculados a esta missa
    const { data: slots, error: fetchSlotsError } = await supabase.from('schedule_slots').select('id').eq('mass_id', massId)
    if (fetchSlotsError) throw fetchSlotsError

    if (slots && slots.length > 0) {
      const slotIds = slots.map(s => s.id)
      
      // 2. Deletar anúncios/trocas vinculados a esses slots (ex: pedidos de troca)
      const { error: announceError } = await supabase.from('announcements').delete().in('related_schedule_slot_id', slotIds)
      if (announceError) throw announceError

      // 3. Deletar os slots
      const { error: slotsError } = await supabase.from('schedule_slots').delete().in('id', slotIds)
      if (slotsError) throw slotsError
    }

    // 4. Finalmente, deletar a missa
    const { error: massError } = await supabase.from('masses').delete().eq('id', massId)
    if (massError) throw massError
  }

  async acceptSwap(slotId: string, newReaderId: string, newMemberId?: string): Promise<void> {
    const { error } = await supabase.from('schedule_slots').update({ reader_id: newReaderId, member_id: newMemberId || undefined, is_swap_requested: false, is_confirmed: true }).eq('id', slotId)
    if (error) throw error
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
      slots: [] // Não precisamos dos slots para a checagem de existência
    }))
  }

  async updateMassesStatus(massIds: string[], isPublished: boolean): Promise<void> {
    const { error } = await supabase.from('masses').update({ is_published: isPublished }).in('id', massIds)
    if (error) throw error
  }

  async listOccupiedDatesForMonth(monthReference: string): Promise<string[]> {
    const { data, error } = await supabase
      .from('masses')
      .select('date')
      .eq('month_reference', monthReference)
    if (error) throw error
    // Retorna datas únicas (pode haver várias missas no mesmo dia)
    return [...new Set((data || []).map(m => m.date))]
  }

  async listUpcomingForUser(userId: string, memberId?: string): Promise<Mass[]> {
    const today = new Date().toISOString().split('T')[0]
    
    // 1. Buscar slots vinculados ao usuário ou membro
    let query = supabase
      .from('schedule_slots')
      .select(`
        *,
        mass:masses!inner(*)
      `)
      .eq('mass.is_published', true)
      .gte('mass.date', today)

    if (memberId) {
      query = query.or(`reader_id.eq."${userId}",member_id.eq."${memberId}"`)
    } else {
      query = query.eq('reader_id', userId)
    }

    const { data: slots, error } = await query
      .order('mass(date)', { ascending: true })
      .order('mass(time)', { ascending: true })

    if (error) throw error
    if (!slots || slots.length === 0) return []

    // 2. Buscar nomes para os envolvidos
    const readerIds = new Set<string>()
    const memberIds = new Set<string>()
    slots.forEach(s => {
      if (s.reader_id) readerIds.add(s.reader_id)
      if (s.member_id) memberIds.add(s.member_id)
    })

    let userNames: Record<string, any> = {}
    let memberNames: Record<string, any> = {}

    if (readerIds.size > 0) {
      const { data: users } = await supabase.from('users').select('id, full_name, avatar_url').in('id', Array.from(readerIds))
      if (users) userNames = Object.fromEntries(users.map(u => [u.id, u]))
    }

    if (memberIds.size > 0) {
      const { data: members } = await supabase.from('members').select('id, full_name, user:users!claimed_by(avatar_url)').in('id', Array.from(memberIds))
      if (members) {
        memberNames = Object.fromEntries(members.map(m => [m.id, { 
          full_name: m.full_name, 
          is_claimed: !!(m as any).user,
          avatar_url: (m as any).user?.avatar_url
        }]))
      }
    }

    // 3. Agrupar em formato de Mass (como o widget espera)
    // No widget, cada slot vira um item de lista, mas aqui agrupamos por missa se houver várias leituras na mesma missa
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
      mass.slots.push(this.mapSlotToDomain(s, userNames, memberNames))
    })

    return Array.from(massMap.values())
  }
}
