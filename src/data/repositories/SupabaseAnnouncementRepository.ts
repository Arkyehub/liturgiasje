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

  private mapToDomain(ann: any, userId?: string): Announcement {
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
      createdBy: ann.created_by,
      authorName: ann.author?.full_name,
      isRead: ann.created_by === userId || ann.views?.some((v: any) => v.user_id === userId) || false,
      viewers: ann.views?.map((v: any) => ({
        name: v.user?.full_name || 'Usuário',
        at: v.viewed_at,
        avatarUrl: v.user?.avatar_url,
        isClaimed: true
      })) || []
    }
  }

  async create(data: CreateAnnouncementData): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error("Usuário não autenticado")

    const imageUrls: string[] = []
    const audioUrls: string[] = []
    const pdfUrls: string[] = []

    if (data.imageFiles) {
      for (const file of data.imageFiles) {
        const fileExt = file.name.split('.').pop()
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${fileExt}`
        const filePath = `announcements/images/${fileName}`
        const { error } = await supabase.storage.from('announcement_media').upload(filePath, file, { upsert: true })
        if (error) throw error
        const { data: { publicUrl } } = supabase.storage.from('announcement_media').getPublicUrl(filePath)
        imageUrls.push(publicUrl)
      }
    }

    if (data.audioFiles) {
      for (const file of data.audioFiles) {
        const fileExt = file.name.split('.').pop()
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${fileExt}`
        const filePath = `announcements/audio/${fileName}`
        const { error } = await supabase.storage.from('announcement_media').upload(filePath, file, { upsert: true })
        if (error) throw error
        const { data: { publicUrl } } = supabase.storage.from('announcement_media').getPublicUrl(filePath)
        audioUrls.push(publicUrl)
      }
    }

    if (data.pdfFiles) {
      for (const file of data.pdfFiles) {
        const fileExt = file.name.split('.').pop()
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${fileExt}`
        const filePath = `announcements/pdfs/${fileName}`
        const { error } = await supabase.storage.from('announcement_media').upload(filePath, file, { upsert: true })
        if (error) throw error
        const { data: { publicUrl } } = supabase.storage.from('announcement_media').getPublicUrl(filePath)
        pdfUrls.push(`${publicUrl}?t=${Date.now()}`)
      }
    }

    const { error } = await supabase.from('announcements').insert({
      title: data.title,
      content: data.content,
      type: data.type,
      image_url: imageUrls[0] || "",
      image_urls: imageUrls,
      audio_url: audioUrls[0] || "",
      audio_urls: audioUrls,
      pdf_urls: pdfUrls,
      expires_at: data.expiresAt instanceof Date ? data.expiresAt.toISOString() : data.expiresAt,
      created_by: user.id
    })

    if (error) throw error

    fetch('/api/push/send', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Novo Recado',
        body: data.title,
        url: '/'
      }),
      headers: { 'Content-Type': 'application/json' }
    }).catch(err => console.error('Erro ao disparar push:', err))
  }

  async list(userId?: string): Promise<Announcement[]> {
    const { data: announcements, error } = await supabase
      .from('announcements')
      .select(`
        *,
        author:users!announcements_created_by_fkey(full_name),
        views:announcement_views(user_id, viewed_at, user:users(full_name))
      `)
      .order('created_at', { ascending: false })
      .limit(50)
      .neq('id', '00000000-0000-0000-0000-000000000000')

    if (error) throw error
    
    const now = new Date()
    return (announcements || [])
      .filter(ann => !ann.expires_at || new Date(ann.expires_at) > now)
      .map(ann => this.mapToDomain(ann, userId))
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

  async markAsRead(announcementId: string, userId: string): Promise<void> {
    const { error } = await supabase.from('announcement_views').insert({
      announcement_id: announcementId,
      user_id: userId
    })
    if (error) throw error
  }

  async update(id: string, data: any): Promise<void> {
    const { imageFiles, audioFiles, pdfFiles, imageUrls, audioUrls, pdfUrls, expiresAt, ...rest } = data
    const finalData: any = { 
      ...rest,
      image_urls: imageUrls,
      audio_urls: audioUrls,
      pdf_urls: pdfUrls,
      expires_at: expiresAt instanceof Date ? expiresAt.toISOString() : expiresAt
    }


    if (imageFiles) {
      const newUrls: string[] = []
      for (const file of imageFiles) {
        const fileExt = file.name.split('.').pop()
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${fileExt}`
        const filePath = `announcements/images/${fileName}`
        const { error } = await supabase.storage.from('announcement_media').upload(filePath, file, { upsert: true })
        if (error) throw error
        const { data: { publicUrl } } = supabase.storage.from('announcement_media').getPublicUrl(filePath)
        newUrls.push(publicUrl)
      }
      finalData.image_urls = [...(finalData.image_urls || []), ...newUrls]
    }
    
    if (finalData.image_urls) {
      finalData.image_url = finalData.image_urls[0] || ""
    }

    if (audioFiles) {
      const newUrls: string[] = []
      for (const file of audioFiles) {
        const fileExt = file.name.split('.').pop()
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${fileExt}`
        const filePath = `announcements/audio/${fileName}`
        const { error } = await supabase.storage.from('announcement_media').upload(filePath, file, { upsert: true })
        if (error) throw error
        const { data: { publicUrl } } = supabase.storage.from('announcement_media').getPublicUrl(filePath)
        newUrls.push(publicUrl)
      }
      finalData.audio_urls = [...(finalData.audio_urls || []), ...newUrls]
    }

    if (finalData.audio_urls) {
      finalData.audio_url = finalData.audio_urls[0] || ""
    }

    if (pdfFiles) {
      const newUrls: string[] = []
      for (const file of pdfFiles) {
        const fileExt = file.name.split('.').pop()
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${fileExt}`
        const filePath = `announcements/pdfs/${fileName}`
        const { error } = await supabase.storage.from('announcement_media').upload(filePath, file, { upsert: true })
        if (error) throw error
        const { data: { publicUrl } } = supabase.storage.from('announcement_media').getPublicUrl(filePath)
        newUrls.push(publicUrl)
      }
      finalData.pdf_urls = [...(finalData.pdf_urls || []), ...newUrls]
    }

    const { data: oldAnn } = await supabase.from('announcements').select('image_urls, audio_urls, pdf_urls').eq('id', id).single()
    if (oldAnn) {
      const removedFiles: string[] = []
      if (oldAnn.image_urls && Array.isArray(oldAnn.image_urls)) {
        const newUrls = finalData.image_urls || []
        oldAnn.image_urls.forEach((oldUrl: string) => {
          if (!newUrls.includes(oldUrl)) {
            const path = this.extractPathFromUrl(oldUrl)
            if (path) removedFiles.push(path)
          }
        })
      }
      if (oldAnn.audio_urls && Array.isArray(oldAnn.audio_urls)) {
        const newUrls = finalData.audio_urls || []
        oldAnn.audio_urls.forEach((oldUrl: string) => {
          if (!newUrls.includes(oldUrl)) {
            const path = this.extractPathFromUrl(oldUrl)
            if (path) removedFiles.push(path)
          }
        })
      }
      if (oldAnn.pdf_urls && Array.isArray(oldAnn.pdf_urls)) {
        const newUrls = finalData.pdf_urls || []
        oldAnn.pdf_urls.forEach((oldUrl: string) => {
          if (!newUrls.includes(oldUrl)) {
            const path = this.extractPathFromUrl(oldUrl)
            if (path) removedFiles.push(path)
          }
        })
      }
      if (removedFiles.length > 0) {
        await supabase.storage.from('announcement_media').remove(removedFiles).catch(err => console.error("Error cleaning files:", err))
      }
    }

    const { error } = await supabase.from('announcements').update(finalData).eq('id', id)
    if (error) throw error
  }
}
