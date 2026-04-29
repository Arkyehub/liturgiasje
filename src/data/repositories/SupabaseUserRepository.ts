import { supabase } from "@/shared/api/supabase"
import { UserProfile, BirthdayInfo } from "@/domain/models/UserProfile"
import { UserRepository } from "@/domain/repositories/UserRepository"

export class SupabaseUserRepository implements UserRepository {
  private extractPathFromUrl(url: string, bucketName: string = 'avatars'): string | null {
    if (!url) return null
    const searchStr = `/storage/v1/object/public/${bucketName}/`
    const index = url.indexOf(searchStr)
    if (index === -1) return null
    return url.substring(index + searchStr.length)
  }

  private mapToDomain(u: any): UserProfile {
    return {
      id: u.id,
      email: u.email,
      fullName: u.full_name,
      avatarUrl: u.avatar_url,
      role: u.role,
      whatsapp: u.whatsapp,
      birthDate: u.birth_date,
      preferences: u.preferences,
      claimedAt: u.claimed_at,
      isSelfRegistered: u.is_self_registered
    }
  }

  async getProfile(userId: string): Promise<UserProfile | null> {
    const { data, error } = await supabase.from('users').select('*').eq('id', userId).maybeSingle()
    if (error) throw error
    return data ? this.mapToDomain(data) : null
  }

  async createProfile(profile: Partial<UserProfile>): Promise<UserProfile> {
    const dataToInsert: any = {
      id: profile.id,
      email: profile.email,
      full_name: profile.fullName,
      role: profile.role || 'reader',
      whatsapp: profile.whatsapp,
      birth_date: profile.birthDate,
      preferences: profile.preferences
    }
    const { data, error } = await supabase.from('users').insert(dataToInsert).select().single()
    if (error) throw error
    return this.mapToDomain(data)
  }

  async updateProfile(userId: string, profile: Partial<UserProfile>): Promise<UserProfile> {
    const updateData: any = {}
    if (profile.fullName) updateData.full_name = profile.fullName
    if (profile.avatarUrl !== undefined) updateData.avatar_url = profile.avatarUrl
    if (profile.whatsapp !== undefined) updateData.whatsapp = profile.whatsapp
    if (profile.birthDate !== undefined) updateData.birth_date = profile.birthDate
    if (profile.preferences !== undefined) updateData.preferences = profile.preferences

    if (updateData.full_name) {
      const { data: currentMember } = await supabase.from('members').select('id').eq('claimed_by', userId).maybeSingle()
      const query = supabase.from('members').select('id').ilike('full_name', updateData.full_name)
      if (currentMember) query.neq('id', currentMember.id)
      const { data: existingMember, error: checkError } = await query.maybeSingle()
      if (checkError) throw checkError
      if (existingMember) throw new Error("NAME_ALREADY_IN_USE")
    }

    const { data, error } = await supabase.from('users').update(updateData).eq('id', userId).select().single()
    if (error) throw error

    const syncData: any = {}
    if (profile.fullName) syncData.full_name = profile.fullName
    if (profile.whatsapp) syncData.whatsapp = profile.whatsapp
    if (Object.keys(syncData).length > 0) {
      await supabase.from('members').update(syncData).eq('claimed_by', userId)
    }

    return this.mapToDomain(data)
  }

  async uploadAvatar(userId: string, file: Blob): Promise<string> {
    const oldProfile = await this.getProfile(userId)
    const oldAvatarUrl = oldProfile?.avatarUrl
    const fileName = `${userId}/avatar-${Date.now()}.webp`
    
    const { error: uploadError } = await supabase.storage.from('avatars').upload(fileName, file, { contentType: 'image/webp', upsert: true })
    if (uploadError) throw uploadError

    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(fileName)
    await this.updateProfile(userId, { avatarUrl: publicUrl })

    if (oldAvatarUrl) {
      const oldPath = this.extractPathFromUrl(oldAvatarUrl, 'avatars')
      if (oldPath) await supabase.storage.from('avatars').remove([oldPath]).catch(err => console.error(err))
    }

    return publicUrl
  }

  async updateRole(userId: string, role: 'admin' | 'reader'): Promise<UserProfile> {
    const { data, error } = await supabase.from('users').update({ role }).eq('id', userId).select().single()
    if (error) throw error
    return this.mapToDomain(data)
  }

  async listBirthdays(): Promise<BirthdayInfo[]> {
    const { data, error } = await supabase.from('users').select('id, full_name, avatar_url, birth_date').not('birth_date', 'is', null).order('birth_date')
    if (error) throw error
    return (data || []).map(u => ({
      id: u.id,
      fullName: u.full_name,
      avatarUrl: u.avatar_url,
      birthDate: u.birth_date,
      isClaimed: true
    }))
  }
}
