export interface UserProfile {
  id: string
  email: string
  fullName: string
  avatarUrl?: string | null
  role: 'admin' | 'reader'
  whatsapp?: string
  birthDate?: string
  preferences?: {
    day_preferences?: Record<string, string[]>
  }
  claimedAt?: string
  isSelfRegistered?: boolean
}

export interface BirthdayInfo {
  id: string
  fullName: string
  avatarUrl?: string | null
  birthDate: string
}
