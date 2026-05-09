import { Mass, ScheduleSlot, SwapRequest, CreateMassData, CreateSlotData } from "../models/Schedule"

export interface ScheduleRepository {
  listForMonth(date: Date, isAdmin?: boolean): Promise<Mass[]>
  confirmSlot(slotId: string, profileId: string): Promise<ScheduleSlot>
  requestSwap(slotId: string): Promise<void>
  cancelSwapRequest(slotId: string): Promise<void>
  getProfilesUsage(monthReference: string): Promise<Record<string, number>>
  createMassWithSlots(massData: CreateMassData, slots: CreateSlotData[]): Promise<Mass>
  publishMonth(monthReference: string): Promise<void>
  updateMass(massId: string, massData: CreateMassData, slots: CreateSlotData[]): Promise<void>
  listAllSwaps(): Promise<SwapRequest[]>
  deleteMass(massId: string): Promise<void>
  acceptSwap(slotId: string, newProfileId: string): Promise<void>
  checkMassExists(date: string): Promise<Mass[]>
  updateMassesStatus(massIds: string[], isPublished: boolean): Promise<void>
  listOccupiedDatesForMonth(monthReference: string): Promise<string[]>
  listUpcomingForUser(profileId: string): Promise<Mass[]>
}
