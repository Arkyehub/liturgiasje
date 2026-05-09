import { UnavailableRepository } from "../../repositories/UnavailableRepository"

export class ListUnavailableByProfile {
  constructor(private readonly repository: UnavailableRepository) {}
  async execute(profileId: string): Promise<string[]> {
    return this.repository.listByProfile(profileId)
  }
}

export class ToggleUnavailableDate {
  constructor(private readonly repository: UnavailableRepository) {}
  async execute(profileId: string, date: string): Promise<{ action: 'added' | 'removed' }> {
    return this.repository.toggleDate(profileId, date)
  }
}

export class ListUnavailableByDate {
  constructor(private readonly repository: UnavailableRepository) {}
  async execute(date: string): Promise<string[]> {
    return this.repository.listManyByDate(date)
  }
}
