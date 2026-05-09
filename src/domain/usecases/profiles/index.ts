import { ProfileRepository } from "../../repositories/ProfileRepository"
import { Profile, BirthdayInfo, CreateProfileData } from "../../models/Profile"

export class GetProfileById {
  constructor(private readonly repository: ProfileRepository) {}
  async execute(id: string): Promise<Profile | null> {
    return this.repository.getById(id)
  }
}

export class GetProfileByAuthId {
  constructor(private readonly repository: ProfileRepository) {}
  async execute(authId: string): Promise<Profile | null> {
    return this.repository.getByAuthId(authId)
  }
}

export class ListProfiles {
  constructor(private readonly repository: ProfileRepository) {}
  async execute(): Promise<Profile[]> {
    return this.repository.listAll()
  }
}

export class SearchProfiles {
  constructor(private readonly repository: ProfileRepository) {}
  async execute(query: string, onlyPending?: boolean): Promise<Profile[]> {
    return this.repository.search(query, onlyPending)
  }
}

export class CreateProfile {
  constructor(private readonly repository: ProfileRepository) {}
  async execute(data: CreateProfileData): Promise<Profile> {
    return this.repository.create(data)
  }
}

export class UpdateProfile {
  constructor(private readonly repository: ProfileRepository) {}
  async execute(id: string, data: Partial<Profile>): Promise<Profile> {
    return this.repository.update(id, data)
  }
}

export class DeleteProfile {
  constructor(private readonly repository: ProfileRepository) {}
  async execute(id: string): Promise<void> {
    return this.repository.delete(id)
  }
}

export class ClaimProfile {
  constructor(private readonly repository: ProfileRepository) {}
  async execute(profileId: string, authUserId: string): Promise<Profile> {
    return this.repository.claim(profileId, authUserId)
  }
}

export class UploadAvatar {
  constructor(private readonly repository: ProfileRepository) {}
  async execute(id: string, file: Blob): Promise<string> {
    return this.repository.uploadAvatar(id, file)
  }
}

export class ListBirthdays {
  constructor(private readonly repository: ProfileRepository) {}
  async execute(): Promise<BirthdayInfo[]> {
    return this.repository.listBirthdays()
  }
}
