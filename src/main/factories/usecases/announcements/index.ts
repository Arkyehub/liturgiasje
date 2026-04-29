import { ListAnnouncements, CreateAnnouncement, DeleteAnnouncement, MarkAnnouncementAsRead, UpdateAnnouncement } from "@/domain/usecases/announcements"
import { SupabaseAnnouncementRepository } from "@/data/repositories/SupabaseAnnouncementRepository"

const repository = new SupabaseAnnouncementRepository()

export const makeListAnnouncements = () => new ListAnnouncements(repository)
export const makeCreateAnnouncement = () => new CreateAnnouncement(repository)
export const makeDeleteAnnouncement = () => new DeleteAnnouncement(repository)
export const makeMarkAnnouncementAsRead = () => new MarkAnnouncementAsRead(repository)
export const makeUpdateAnnouncement = () => new UpdateAnnouncement(repository)
