import { UnavailableRepository } from "../../repositories/UnavailableRepository"

export class ListUnavailableByUser {
  constructor(private readonly unavailableRepository: UnavailableRepository) {}
  async execute(userId: string): Promise<string[]> {
    return this.unavailableRepository.listByUser(userId)
  }
}

export class ToggleUnavailableDate {
  constructor(private readonly unavailableRepository: UnavailableRepository) {}
  async execute(userId: string, date: string): Promise<{ action: 'added' | 'removed' }> {
    return this.unavailableRepository.toggleDate(userId, date)
  }
}
