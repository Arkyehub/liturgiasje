import { AnnouncementRepository } from "../../repositories/AnnouncementRepository"
import { CreateAnnouncementData, UpdateAnnouncementData, Announcement } from "../../models/Announcement"

export class CreateAnnouncement {
  constructor(private readonly announcementRepository: AnnouncementRepository) {}
  async execute(data: CreateAnnouncementData): Promise<void> {
    return this.announcementRepository.create(data)
  }
}

export class DeleteAnnouncement {
  constructor(private readonly announcementRepository: AnnouncementRepository) {}
  async execute(id: string): Promise<void> {
    return this.announcementRepository.delete(id)
  }
}

export class ListAnnouncements {
  constructor(private readonly announcementRepository: AnnouncementRepository) {}
  async execute(profileId?: string): Promise<Announcement[]> {
    return this.announcementRepository.list(profileId)
  }
}

export class MarkAnnouncementAsRead {
  constructor(private readonly announcementRepository: AnnouncementRepository) {}
  async execute(announcementId: string, profileId: string): Promise<void> {
    return this.announcementRepository.markAsRead(announcementId, profileId)
  }
}

export class UpdateAnnouncement {
  constructor(private readonly announcementRepository: AnnouncementRepository) {}
  async execute(id: string, data: UpdateAnnouncementData): Promise<void> {
    return this.announcementRepository.update(id, data)
  }
}
