import { AnnouncementRepository } from "../repositories/AnnouncementRepository"
import { Announcement } from "../models/Announcement"

export class GetAnnouncements {
  constructor(private readonly announcementRepository: AnnouncementRepository) {}

  async execute(userId?: string): Promise<Announcement[]> {
    return this.announcementRepository.list(userId)
  }
}
