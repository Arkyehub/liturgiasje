import { ScheduleRepository } from "../../repositories/ScheduleRepository"
import { Mass, ScheduleSlot, SwapRequest, CreateMassData, CreateSlotData } from "../../models/Schedule"

export class ListSchedulesForMonth {
  constructor(private readonly scheduleRepository: ScheduleRepository) {}
  async execute(date: Date, isAdmin?: boolean): Promise<Mass[]> {
    return this.scheduleRepository.listForMonth(date, isAdmin)
  }
}

export class ConfirmScheduleSlot {
  constructor(private readonly scheduleRepository: ScheduleRepository) {}
  async execute(slotId: string, userId: string): Promise<ScheduleSlot> {
    return this.scheduleRepository.confirmSlot(slotId, userId)
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

export class GetMembersUsage {
  constructor(private readonly scheduleRepository: ScheduleRepository) {}
  async execute(monthReference: string): Promise<Record<string, number>> {
    return this.scheduleRepository.getMembersUsage(monthReference)
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
  async execute(slotId: string, newReaderId: string, newMemberId?: string): Promise<void> {
    return this.scheduleRepository.acceptSwap(slotId, newReaderId, newMemberId)
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
