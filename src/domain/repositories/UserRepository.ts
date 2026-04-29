import { UserProfile, BirthdayInfo } from "../models/UserProfile"

export interface UserRepository {
  getProfile(userId: string): Promise<UserProfile | null>
  createProfile(profile: Partial<UserProfile>): Promise<UserProfile>
  updateProfile(userId: string, profile: Partial<UserProfile>): Promise<UserProfile>
  uploadAvatar(userId: string, file: Blob): Promise<string>
  updateRole(userId: string, role: 'admin' | 'reader'): Promise<UserProfile>
  listBirthdays(): Promise<BirthdayInfo[]>
}
