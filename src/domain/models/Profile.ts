export interface Profile {
  id: string
  authUserId?: string | null // Link to auth.users.id
  fullName: string
  email?: string | null
  avatarUrl?: string | null
  role: 'admin' | 'reader'
  whatsapp?: string
  birthDate?: string
  preferences?: {
    day_preferences?: Record<string, string[]>
  }
  claimedAt?: string
  lastSeenAt?: string
  createdAt: string
  updatedAt: string
}

export interface BirthdayInfo {
  id: string
  fullName: string
  avatarUrl?: string | null
  birthDate: string
  isActive?: boolean // true se authUserId estiver preenchido
}

export type CreateProfileData = Omit<Profile, 'id' | 'createdAt' | 'updatedAt'>
