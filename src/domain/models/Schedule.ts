export interface Mass {
  scheduleRevision?: number
  id: string
  date: string
  time: string
  specialDescription?: string
  monthReference: string
  isPublished: boolean
  slots: ScheduleSlot[]
  liturgicalColor?: string
}

export interface ScheduleSlot {
  id: string
  massId: string
  role: string
  profileId: string
  originalProfileId?: string
  isConfirmed: boolean
  isSwapRequested: boolean
  createdAt: string
  // Campos virtuais populados pelo repositório
  profile?: {
    fullName: string
    avatarUrl: string | null
    archivedAt?: string | null
    authUserId?: string | null
  } | null
  previousAssignments?: { fullName: string; occurredAt: string; archived: boolean }[]
  readerName?: string
  avatarUrl?: string | null
  isActive?: boolean // se tem conta vinculada
  originalProfile?: {
    archivedAt?: string | null
    fullName: string
    avatarUrl: string | null
  } | null
}

export interface SwapRequest extends ScheduleSlot {
  mass: {
    date: string
    time: string
    specialDescription?: string
  }
}
export interface CreateMassData {
  expectedRevision?: number
  date: string
  time: string
  specialDescription?: string
  monthReference: string
}

export interface CreateSlotData {
  id?: string
  role: string
  profileId: string
}

export interface ScheduleBatchEntry { massId?: string; massData: CreateMassData; slots: CreateSlotData[] }
export interface RemovedMass { id: string; expectedRevision?: number }
