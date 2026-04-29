import { UserRepository } from "../../repositories/UserRepository"
import { UserProfile, BirthdayInfo } from "../../models/UserProfile"

export class GetUserProfile {
  constructor(private readonly userRepository: UserRepository) {}
  async execute(userId: string): Promise<UserProfile | null> {
    return this.userRepository.getProfile(userId)
  }
}

export class CreateUserProfile {
  constructor(private readonly userRepository: UserRepository) {}
  async execute(profile: Partial<UserProfile>): Promise<UserProfile> {
    return this.userRepository.createProfile(profile)
  }
}

export class UpdateUserProfile {
  constructor(private readonly userRepository: UserRepository) {}
  async execute(userId: string, profile: Partial<UserProfile>): Promise<UserProfile> {
    return this.userRepository.updateProfile(userId, profile)
  }
}

export class UploadUserAvatar {
  constructor(private readonly userRepository: UserRepository) {}
  async execute(userId: string, file: Blob): Promise<string> {
    return this.userRepository.uploadAvatar(userId, file)
  }
}

export class UpdateUserRole {
  constructor(private readonly userRepository: UserRepository) {}
  async execute(userId: string, role: 'admin' | 'reader'): Promise<UserProfile> {
    return this.userRepository.updateRole(userId, role)
  }
}

export class ListBirthdays {
  constructor(private readonly userRepository: UserRepository) {}
  async execute(): Promise<BirthdayInfo[]> {
    return this.userRepository.listBirthdays()
  }
}
