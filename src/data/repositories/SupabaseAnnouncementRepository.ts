import { supabase } from "@/shared/api/supabase"
import { Announcement, CreateAnnouncementData } from "@/domain/models/Announcement"
import { AnnouncementRepository } from "@/domain/repositories/AnnouncementRepository"

export class SupabaseAnnouncementRepository implements AnnouncementRepository {
  private extractPathFromUrl(url: string, bucketName: string = 'announcement_media'): string | null {
    if (!url) return null
    const searchStr = `/storage/v1/object/public/${bucketName}/`
    const index = url.indexOf(searchStr)
    if (index === -1) return null
    return url.substring(index + searchStr.length)
  }

  private mapToDomain(ann: any, profileId?: string): Announcement {
    return {
      id: ann.id,
      title: ann.title,
      content: ann.content,
      type: ann.type,
      imageUrls: ann.image_urls || [],
      audioUrls: ann.audio_urls || [],
      pdfUrls: ann.pdf_urls || [],
      expiresAt: ann.expires_at,
      createdAt: ann.created_at,
      createdBy: ann.profile_id,
      authorName: ann.author?.full_name,
      isRead: ann.profile_id === profileId || ann.views?.some((v: any) => v.profile_id === profileId) || false,
      isPublished: ann.is_published ?? true,
      viewers: ann.views?.map((v: any) => ({
        name: v.profile?.full_name || 'Usuário',
        at: v.viewed_at,
        avatarUrl: v.profile?.avatar_url,
        isClaimed: !!v.profile?.auth_user_id
      })) || []
    }
  }

  async create(data: CreateAnnouncementData): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error("Usuário não autenticado")

    const { data: profile } = await supabase.from('profiles').select('id').eq('auth_user_id', user.id).single()
    if (!profile) throw new Error("Perfil não encontrado")

    const { title, content, type = 'Aviso', expiresAt, isPublished = true, imageUrls = [], audioUrls = [], pdfUrls = [] } = data

    const { error } = await supabase.from('announcements').insert({
      title,
      content,
      type,
      image_url: imageUrls[0] || "",
      image_urls: imageUrls,
      audio_url: audioUrls[0] || "",
      audio_urls: audioUrls,
      pdf_urls: pdfUrls,
      expires_at: expiresAt instanceof Date ? expiresAt.toISOString() : expiresAt,
      is_published: isPublished,
      profile_id: profile.id
    })

    if (error) throw error
    
    if (isPublished) {
      const isSwap = type === 'Troca';
      await fetch('/api/push/send', {
        method: 'POST',
        body: JSON.stringify({
          title: isSwap ? 'Solicitação de Troca' : 'Novo Recado',
          body: title,
          url: '/'
        }),
        headers: { 'Content-Type': 'application/json' }
      }).catch(err => console.error('Erro ao disparar push:', err))
    }
  }

  async list(profileId?: string): Promise<Announcement[]> {
    const { data: announcements, error } = await supabase
      .from('announcements')
      .select(`
        *,
        author:profiles!announcements_profile_id_fkey(full_name),
        views:announcement_views(profile_id, viewed_at, profile:profiles(full_name, avatar_url, auth_user_id))
      `)
      .order('created_at', { ascending: false })
      .limit(50)
      .neq('id', '00000000-0000-0000-0000-000000000000')

    if (error) throw error
    
    // Buscar o role do usuário atual para filtrar rascunhos
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profileData } = user ? await supabase.from('profiles').select('role').eq('auth_user_id', user.id).single() : { data: null }
    const isAdmin = profileData?.role === 'admin'

    const now = new Date()
    return (announcements || [])
      .filter(ann => {
        const isExpired = ann.expires_at && new Date(ann.expires_at) < now
        if (isExpired) return false
        if (!isAdmin && ann.is_published === false) return false
        return true
      })
      .map(ann => this.mapToDomain(ann, profileId))
  }

  async delete(id: string): Promise<void> {
    const { data: ann } = await supabase
      .from('announcements')
      .select('image_url, image_urls, audio_url, audio_urls, pdf_urls')
      .eq('id', id)
      .single()

    if (ann) {
      const pathsToDelete: string[] = []
      const imgUrls = [...(ann.image_urls || []), ann.image_url].filter(Boolean) as string[]
      imgUrls.forEach(url => {
        const path = this.extractPathFromUrl(url.split('?')[0])
        if (path) pathsToDelete.push(path)
      })
      const audUrls = [...(ann.audio_urls || []), ann.audio_url].filter(Boolean) as string[]
      audUrls.forEach(url => {
        const path = this.extractPathFromUrl(url.split('?')[0])
        if (path) pathsToDelete.push(path)
      })
      const pdfUrls = (ann.pdf_urls || []) as string[]
      pdfUrls.forEach(url => {
        const path = this.extractPathFromUrl(url.split('?')[0])
        if (path) pathsToDelete.push(path)
      })
      const uniquePaths = Array.from(new Set(pathsToDelete))
      if (uniquePaths.length > 0) {
        await supabase.storage.from('announcement_media').remove(uniquePaths)
      }
    }

    const { error } = await supabase.from('announcements').delete().eq('id', id)
    if (error) throw error
  }

  async markAsRead(announcementId: string, profileId: string): Promise<void> {
    const { error } = await supabase.from('announcement_views').insert({
      announcement_id: announcementId,
      profile_id: profileId
    })
    if (error) throw error
  }

  async update(id: string, data: any): Promise<void> {
    const { imageFiles, audioFiles, pdfFiles, imageUrls, audioUrls, pdfUrls, expiresAt, isPublished, ...rest } = data
    
    const finalData: any = { 
      ...rest,
      image_urls: imageUrls,
      audio_urls: audioUrls,
      pdf_urls: pdfUrls,
      expires_at: expiresAt instanceof Date ? expiresAt.toISOString() : expiresAt
    }

    if (isPublished !== undefined) {
      finalData.is_published = isPublished
    }

    if (finalData.image_urls) {
      finalData.image_url = finalData.image_urls[0] || ""
    }
    if (finalData.audio_urls) {
      finalData.audio_url = finalData.audio_urls[0] || ""
    }

    const { data: oldAnn } = await supabase.from('announcements').select('image_urls, audio_urls, pdf_urls, is_published, type, title').eq('id', id).single()
    if (oldAnn) {
      const removedFiles: string[] = []
      const cleanUrls = (urls: any) => Array.isArray(urls) ? urls : []
      
      const oldImages = cleanUrls(oldAnn.image_urls)
      const newImages = cleanUrls(finalData.image_urls)
      oldImages.forEach((oldUrl: string) => {
        if (!newImages.includes(oldUrl)) {
          const path = this.extractPathFromUrl(oldUrl)
          if (path) removedFiles.push(path)
        }
      })

      const oldAudios = cleanUrls(oldAnn.audio_urls)
      const newAudios = cleanUrls(finalData.audio_urls)
      oldAudios.forEach((oldUrl: string) => {
        if (!newAudios.includes(oldUrl)) {
          const path = this.extractPathFromUrl(oldUrl)
          if (path) removedFiles.push(path)
        }
      })

      const oldPdfs = cleanUrls(oldAnn.pdf_urls)
      const newPdfs = cleanUrls(finalData.pdf_urls)
      oldPdfs.forEach((oldUrl: string) => {
        if (!newPdfs.includes(oldUrl)) {
          const path = this.extractPathFromUrl(oldUrl)
          if (path) removedFiles.push(path)
        }
      })

      if (removedFiles.length > 0) {
        await supabase.storage.from('announcement_media').remove(removedFiles).catch(err => console.error("Error cleaning files:", err))
      }
    }

    const { error } = await supabase.from('announcements').update(finalData).eq('id', id)
    if (error) throw error

    const wasPublished = oldAnn?.is_published
    const isNowPublished = finalData.is_published

    if (!wasPublished && isNowPublished) {
      const isSwap = (rest.type || oldAnn?.type) === 'Troca'
      const title = rest.title || oldAnn?.title || 'Novo Recado'
      
      await fetch('/api/push/send', {
        method: 'POST',
        body: JSON.stringify({
          title: isSwap ? 'Solicitação de Troca' : 'Novo Recado',
          body: title,
          url: '/'
        }),
        headers: { 'Content-Type': 'application/json' }
      }).catch(err => console.error('Erro ao disparar push no update:', err))
    }
  }
}
