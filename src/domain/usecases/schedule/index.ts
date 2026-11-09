import { ScheduleRepository } from "../../repositories/ScheduleRepository"
import { MemberReading, Mass, ScheduleSlot, SwapRequest, CreateMassData, CreateSlotData, ScheduleBatchEntry, RemovedMass } from "../../models/Schedule"

export class ListSchedulesForMonth {
  constructor(private readonly scheduleRepository: ScheduleRepository) {}
  async execute(date: Date, isAdmin?: boolean): Promise<Mass[]> {
    return this.scheduleRepository.listForMonth(date, isAdmin)
  }
}

export class ConfirmScheduleSlot {
  constructor(private readonly scheduleRepository: ScheduleRepository) {}
  async execute(slotId: string, profileId: string): Promise<ScheduleSlot> {
    return this.scheduleRepository.confirmSlot(slotId, profileId)
  }
}

export class RequestScheduleSwap {
  constructor(private readonly scheduleRepository: ScheduleRepository) {}
  async execute(slotId: string): Promise<void> {
    return this.scheduleRepository.requestSwap(slotId)
  }
}

export class CancelScheduleSwap {
  constructor(private readonly scheduleRepository: ScheduleRepository) {}
  async execute(slotId: string): Promise<void> {
    return this.scheduleRepository.cancelSwapRequest(slotId)
  }
}

export class ListMemberReadings {
  constructor(private readonly scheduleRepository: ScheduleRepository) {}
  async execute(profileId: string): Promise<MemberReading[]> {
    return this.scheduleRepository.listReadingsByProfile(profileId)
  }
}

export class GetProfilesUsage {
  constructor(private readonly scheduleRepository: ScheduleRepository) {}
  async execute(monthReference: string): Promise<Record<string, number>> {
    return this.scheduleRepository.getProfilesUsage(monthReference)
  }
}

export class CreateMassWithSlots {
  constructor(private readonly scheduleRepository: ScheduleRepository) {}
  async execute(massData: CreateMassData, slots: CreateSlotData[]): Promise<Mass> {
    return this.scheduleRepository.createMassWithSlots(massData, slots)
  }
}

export class PublishScheduleMonth {
  constructor(private readonly scheduleRepository: ScheduleRepository) {}
  async execute(monthReference: string): Promise<void> {
    return this.scheduleRepository.publishMonth(monthReference)
  }
}

export class UpdateMass {
  constructor(private readonly scheduleRepository: ScheduleRepository) {}
  async execute(massId: string, massData: CreateMassData, slots: CreateSlotData[]): Promise<void> {
    return this.scheduleRepository.updateMass(massId, massData, slots)
  }
}

export class ListAllSwaps {
  constructor(private readonly scheduleRepository: ScheduleRepository) {}
  async execute(): Promise<SwapRequest[]> {
    return this.scheduleRepository.listAllSwaps()
  }
}

export class DeleteMass {
  constructor(private readonly scheduleRepository: ScheduleRepository) {}
  async execute(massId: string): Promise<void> {
    return this.scheduleRepository.deleteMass(massId)
  }
}

export class AcceptScheduleSwap {
  constructor(private readonly scheduleRepository: ScheduleRepository) {}
  async execute(slotId: string, newProfileId: string): Promise<void> {
    return this.scheduleRepository.acceptSwap(slotId, newProfileId)
  }
}

export class CheckMassExists {
  constructor(private readonly scheduleRepository: ScheduleRepository) {}
  async execute(date: string): Promise<Mass[]> {
    return this.scheduleRepository.checkMassExists(date)
  }
}

export class UpdateMassesStatus {
  constructor(private readonly scheduleRepository: ScheduleRepository) {}
  async execute(massIds: string[], isPublished: boolean): Promise<void> {
    return this.scheduleRepository.updateMassesStatus(massIds, isPublished)
  }
}

export class ListOccupiedDatesForMonth {
  constructor(private readonly scheduleRepository: ScheduleRepository) {}
  async execute(monthReference: string): Promise<string[]> {
    return this.scheduleRepository.listOccupiedDatesForMonth(monthReference)
  }
}

export class ListUpcomingSchedulesForUser {
  constructor(private readonly scheduleRepository: ScheduleRepository) {}
  async execute(profileId: string): Promise<Mass[]> {
    return this.scheduleRepository.listUpcomingForUser(profileId)
  }
}

export class SaveScheduleBatch {
  constructor(private readonly repository: ScheduleRepository) {}
  async execute(entries: ScheduleBatchEntry[], removed: RemovedMass[]): Promise<void> { return this.repository.saveScheduleBatch(entries, removed) }
}

export class DeleteMasses {
  constructor(private readonly repository: ScheduleRepository) {}
  async execute(ids: string[]): Promise<void> { return this.repository.deleteMasses(ids) }
}
