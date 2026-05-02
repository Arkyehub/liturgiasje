export type AnnouncementType = 'Aviso' | 'Troca'

export interface Announcement {
  id: string
  title: string
  content: string
  type: AnnouncementType
  imageUrls: string[]
  audioUrls: string[]
  pdfUrls: string[]
  expiresAt?: string
  createdAt: string
  createdBy: string
  authorName?: string
  isRead: boolean
  viewers: AnnouncementViewer[]
}

export interface AnnouncementViewer {
  name: string
  at: string
  avatarUrl?: string | null
  isClaimed?: boolean
}

export interface CreateAnnouncementData {
  title: string
  content: string
  type: AnnouncementType
  expiresAt: Date | null
  imageFiles?: File[] | null
  audioFiles?: File[] | null
  pdfFiles?: File[] | null
}
export interface UpdateAnnouncementData {
  title?: string
  content?: string
  expiresAt?: string | Date | null
  imageFiles?: File[] | null
  imageUrls?: string[]
  audioFiles?: File[] | null
  audioUrls?: string[]
  pdfFiles?: File[] | null
  pdfUrls?: string[]
}
