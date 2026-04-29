import { Announcement, CreateAnnouncementData, UpdateAnnouncementData } from "../models/Announcement"

export interface AnnouncementRepository {
  create(data: CreateAnnouncementData): Promise<void>
  list(userId?: string): Promise<Announcement[]>
  delete(id: string): Promise<void>
  markAsRead(announcementId: string, userId: string): Promise<void>
  update(id: string, data: UpdateAnnouncementData): Promise<void>
}
