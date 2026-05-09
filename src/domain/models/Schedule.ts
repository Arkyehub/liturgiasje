export interface Mass {
  id: string
  date: string
  time: string
  specialDescription?: string
  monthReference: string
  isPublished: boolean
  slots: ScheduleSlot[]
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
    authUserId?: string | null
  } | null
  readerName?: string
  avatarUrl?: string | null
  isActive?: boolean // se tem conta vinculada
  originalProfile?: {
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
  date: string
  time: string
  specialDescription?: string
  monthReference: string
}

export interface CreateSlotData {
  role: string
  profileId: string
}
