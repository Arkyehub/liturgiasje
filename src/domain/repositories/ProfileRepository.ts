import { Profile, BirthdayInfo, CreateProfileData } from "../models/Profile"

export interface ProfileRepository {
  getById(id: string): Promise<Profile | null>
  getByAuthId(authId: string): Promise<Profile | null>
  listAll(): Promise<Profile[]>
  search(query: string, onlyPending?: boolean): Promise<Profile[]>
  create(data: CreateProfileData): Promise<Profile>
  update(id: string, data: Partial<Profile>): Promise<Profile>
  delete(id: string): Promise<void>
  claim(profileId: string, authUserId: string): Promise<Profile>
  uploadAvatar(id: string, file: Blob): Promise<string>
  listBirthdays(): Promise<BirthdayInfo[]>
}
