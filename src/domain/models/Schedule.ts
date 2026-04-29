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
  readerId?: string
  memberId?: string
  originalReaderId?: string
  isConfirmed: boolean
  isSwapRequested: boolean
  createdAt: string
  // Virtual fields populated by repository
  reader?: {
    fullName: string
    avatarUrl: string | null
  } | null
  member?: {
    fullName: string
  } | null
  readerName?: string
  avatarUrl?: string | null
  originalReader?: {
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
  memberId: string
}
