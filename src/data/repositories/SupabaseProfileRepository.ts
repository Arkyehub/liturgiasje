import { supabase } from "@/shared/api/supabase"
import { Profile, BirthdayInfo, CreateProfileData } from "@/domain/models/Profile"
import { ProfileRepository } from "@/domain/repositories/ProfileRepository"

export class SupabaseProfileRepository implements ProfileRepository {
  private extractPathFromUrl(url: string, bucketName: string = 'avatars'): string | null {
    if (!url) return null
    const searchStr = `/storage/v1/object/public/${bucketName}/`
    const index = url.indexOf(searchStr)
    if (index === -1) return null
    return url.substring(index + searchStr.length)
  }

  private mapToDomain(p: any): Profile {
    return {
      id: p.id,
      authUserId: p.auth_user_id,
      fullName: p.full_name,
      email: p.email,
      avatarUrl: p.avatar_url,
      role: p.role,
      whatsapp: p.whatsapp,
      birthDate: p.birth_date,
      preferences: p.preferences,
      claimedAt: p.claimed_at,
      createdAt: p.created_at,
      updatedAt: p.updated_at
    }
  }

  async getById(id: string): Promise<Profile | null> {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', id).maybeSingle()
    if (error) throw error
    return data ? this.mapToDomain(data) : null
  }

  async getByAuthId(authId: string): Promise<Profile | null> {
    const { data, error } = await supabase.from('profiles').select('*').eq('auth_user_id', authId).maybeSingle()
    if (error) throw error
    return data ? this.mapToDomain(data) : null
  }

  async listAll(): Promise<Profile[]> {
    const { data, error } = await supabase.from('profiles').select('*').order('full_name')
    if (error) throw error
    return (data || []).map(this.mapToDomain)
  }

  async search(query: string, onlyPending: boolean = false): Promise<Profile[]> {
    const digitsOnly = query.replace(/\D/g, "")
    const whatsappQuery = (digitsOnly && digitsOnly.length >= 4) 
      ? `%${digitsOnly.split("").join("%")}%` 
      : `%${query}%`

    let builder = supabase.from('profiles').select('*')
    
    if (onlyPending) {
      builder = builder.is('auth_user_id', null)
    }

    const { data, error } = await builder
      .or(`full_name.ilike.%${query}%,whatsapp.ilike.${whatsappQuery}`)
      .limit(10)
    
    if (error) throw error
    return (data || []).map(this.mapToDomain)
  }

  async create(data: CreateProfileData): Promise<Profile> {
    const { data: existing } = await supabase.from('profiles').select('id').ilike('full_name', data.fullName).maybeSingle()
    if (existing) throw new Error("NAME_ALREADY_IN_USE")

    const { data: profile, error } = await supabase.from('profiles').insert({
      auth_user_id: data.authUserId,
      full_name: data.fullName,
      email: data.email,
      whatsapp: data.whatsapp,
      role: data.role || 'reader',
      birth_date: data.birthDate,
      preferences: data.preferences,
      claimed_at: data.claimedAt
    }).select().single()

    if (error) throw error
    return this.mapToDomain(profile)
  }

  async update(id: string, data: Partial<Profile>): Promise<Profile> {
    const updateData: any = {}
    if (data.fullName) updateData.full_name = data.fullName
    if (data.email !== undefined) updateData.email = data.email
    if (data.avatarUrl !== undefined) updateData.avatar_url = data.avatarUrl
    if (data.whatsapp !== undefined) updateData.whatsapp = data.whatsapp
    if (data.role !== undefined) updateData.role = data.role
    if (data.birthDate !== undefined) updateData.birth_date = data.birthDate
    if (data.preferences !== undefined) updateData.preferences = data.preferences
    if (data.authUserId !== undefined) updateData.auth_user_id = data.authUserId
    if (data.claimedAt !== undefined) updateData.claimed_at = data.claimedAt

    if (updateData.full_name) {
      const { data: existing } = await supabase.from('profiles').select('id').ilike('full_name', updateData.full_name).neq('id', id).maybeSingle()
      if (existing) throw new Error("NAME_ALREADY_IN_USE")
    }

    const { data: profile, error } = await supabase.from('profiles').update(updateData).eq('id', id).select().single()
    if (error) throw error
    return this.mapToDomain(profile)
  }

  async delete(id: string): Promise<void> {
    const response = await fetch('/api/admin/profiles/delete', {
      method: 'POST',
      body: JSON.stringify({ profileId: id }),
      headers: { 'Content-Type': 'application/json' }
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Erro ao excluir perfil");
    }
  }

  async claim(profileId: string, authUserId: string): Promise<Profile> {
    const { data: profile, error } = await supabase.from('profiles').update({
      auth_user_id: authUserId,
      claimed_at: new Date().toISOString()
    }).eq('id', profileId).select().single()

    if (error) throw error
    return this.mapToDomain(profile)
  }

  async uploadAvatar(id: string, file: Blob): Promise<string> {
    const fileName = `${id}/avatar-${Date.now()}.webp`
    const { error: uploadError } = await supabase.storage.from('avatars').upload(fileName, file, { contentType: 'image/webp', upsert: true })
    if (uploadError) throw uploadError

    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(fileName)
    
    const oldProfile = await this.getById(id)
    const oldAvatarUrl = oldProfile?.avatarUrl

    await this.update(id, { avatarUrl: publicUrl })

    if (oldAvatarUrl) {
      const oldPath = this.extractPathFromUrl(oldAvatarUrl, 'avatars')
      if (oldPath) await supabase.storage.from('avatars').remove([oldPath]).catch(err => console.error(err))
    }

    return publicUrl
  }

  async listBirthdays(): Promise<BirthdayInfo[]> {
    const { data, error } = await supabase.from('profiles').select('id, full_name, avatar_url, birth_date, auth_user_id').not('birth_date', 'is', null).order('birth_date')
    if (error) throw error
    return (data || []).map(p => ({
      id: p.id,
      fullName: p.full_name,
      avatarUrl: p.avatar_url,
      birthDate: p.birth_date,
      isActive: !!p.auth_user_id
    }))
  }
}
