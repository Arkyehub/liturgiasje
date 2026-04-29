import { supabase } from "@/shared/api/supabase"
import { Member } from "@/domain/models/Member"
import { MemberRepository } from "@/domain/repositories/MemberRepository"

export class SupabaseMemberRepository implements MemberRepository {
  private mapToDomain(m: any): Member {
    return {
      id: m.id,
      fullName: m.claimed_user?.full_name || m.full_name,
      whatsapp: m.whatsapp,
      isClaimed: m.is_claimed,
      claimedBy: m.claimed_by,
      createdAt: m.created_at,
      claimedUser: m.claimed_user ? {
        avatarUrl: m.claimed_user.avatar_url,
        role: m.claimed_user.role,
        preferences: m.claimed_user.preferences
      } : undefined
    }
  }

  async listAll(): Promise<Member[]> {
    const { data, error } = await supabase
      .from('members')
      .select('*, claimed_user:users!claimed_by(full_name, avatar_url, role, preferences)')
      .order('full_name')
    
    if (error) throw error
    return (data || []).map(this.mapToDomain)
  }

  async search(query: string): Promise<Member[]> {
    const digitsOnly = query.replace(/\D/g, "")
    const whatsappQuery = (digitsOnly && digitsOnly.length >= 4) 
      ? `%${digitsOnly.split("").join("%")}%` 
      : `%${query}%`

    const { data, error } = await supabase
      .from('members')
      .select('*, claimed_user:users!claimed_by(full_name, avatar_url)')
      .or(`full_name.ilike.%${query}%,whatsapp.ilike.${whatsappQuery}`)
      .eq('is_claimed', false)
      .limit(10)
    
    if (error) throw error
    return (data || []).map(this.mapToDomain)
  }

  async create(data: Omit<Member, 'id' | 'createdAt'>): Promise<Member> {
    const { data: existing, error: checkError } = await supabase
      .from('members')
      .select('id')
      .ilike('full_name', data.fullName)
      .maybeSingle()

    if (checkError) throw checkError
    if (existing) throw new Error("NAME_ALREADY_IN_USE")

    const { data: member, error } = await supabase
      .from('members')
      .insert({
        full_name: data.fullName,
        whatsapp: data.whatsapp,
        is_claimed: data.isClaimed,
        claimed_by: data.claimedBy
      })
      .select()
      .single()
    
    if (error) throw error
    return this.mapToDomain(member)
  }

  async update(id: string, data: Partial<Member>): Promise<Member> {
    const updateData: any = {}
    if (data.fullName) updateData.full_name = data.fullName
    if (data.whatsapp !== undefined) updateData.whatsapp = data.whatsapp
    if (data.isClaimed !== undefined) updateData.is_claimed = data.isClaimed
    if (data.claimedBy !== undefined) updateData.claimed_by = data.claimedBy

    if (updateData.full_name) {
      const { data: existing, error: checkError } = await supabase
        .from('members')
        .select('id')
        .ilike('full_name', updateData.full_name)
        .neq('id', id)
        .maybeSingle()

      if (checkError) throw checkError
      if (existing) throw new Error("NAME_ALREADY_IN_USE")
    }

    const { data: member, error } = await supabase
      .from('members')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()
    
    if (error) throw error
    return this.mapToDomain(member)
  }

  async delete(id: string): Promise<void> {
    const response = await fetch('/api/admin/members/delete', {
      method: 'POST',
      body: JSON.stringify({ memberId: id }),
      headers: { 'Content-Type': 'application/json' }
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Erro ao excluir membro");
    }
  }

  async claim(memberId: string, userId: string): Promise<Member> {
    const { data: member, error } = await supabase
      .from('members')
      .update({
        is_claimed: true,
        claimed_by: userId
      })
      .eq('id', memberId)
      .select()
      .single()
    
    if (error) throw error
    return this.mapToDomain(member)
  }

  async getByUserId(userId: string): Promise<Member | null> {
    const { data, error } = await supabase
      .from('members')
      .select('*, claimed_user:users!claimed_by(full_name, avatar_url, role, preferences)')
      .eq('claimed_by', userId)
      .maybeSingle()
    
    if (error) throw error
    if (!data) return null

    return this.mapToDomain(data)
  }
}
