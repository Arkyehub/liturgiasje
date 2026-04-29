export interface Member {
  id: string
  fullName: string
  whatsapp?: string
  isClaimed: boolean
  claimedBy?: string
  createdAt: string
  claimedUser?: {
    avatarUrl: string | null
    role?: 'admin' | 'reader'
    preferences?: {
      day_preferences?: Record<string, string[]>
    }
  }
}
