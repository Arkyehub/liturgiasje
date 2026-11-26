import type { Profile } from "@/domain/models/Profile"

export type RoleCode = "C" | "1L" | "2L" | "L" | "P"
export type RoleGroup = "C" | "R" | "P" // R = 1L, 2L, L (leitura)

export function roleGroup(role: string): RoleGroup | null {
  switch (role) {
    case "C":
      return "C"
    case "1L":
    case "2L":
    case "L":
      return "R"
    case "P":
      return "P"
    default:
      return null
  }
}

export interface PlanReader {
  id: string
  fullName: string
  createdAt: string
  dayPreferences: Record<string, string[]>
}

export interface PlanSlot {
  id?: string
  role: RoleCode
  profileId: string // "" = vazia
  locked: boolean
  /** Há um pedido de troca pendente nesta vaga (spec §11): fica travada e destacada. */
  isSwapRequested?: boolean
  warning?: "outside-preference"
  reason?: string
}

export interface PlanMass {
  key: string
  id?: string
  scheduleRevision?: number
  date: string // yyyy-MM-dd
  time: string // HH:mm
  description: string
  wasPublished: boolean
  readOnly: boolean
  slots: PlanSlot[]
}

export interface ReaderStats {
  readerId: string
  monthlyAverage: number
  scheduled: number
  takeovers: number
  passed: number
  roleShare: Record<RoleGroup, number>
}

export interface SuggestInput {
  masses: PlanMass[]
  readers: PlanReader[]
  stats: Record<string, ReaderStats>
  unavailable: Record<string, string[]> // data → profileIds
}

export interface PlanSummary {
  totalSlots: number
  filled: number
  empty: number
  outsidePreference: number
  locked: number
}

/** Elegível = perfil ativo (não arquivado), com ou sem conta vinculada: quem não usa o app também é escalado pelos coordenadores. */
export function eligibleReaders(profiles: Profile[]): PlanReader[] {
  return profiles
    .filter((p) => !p.archivedAt)
    .map((p) => ({
      id: p.id,
      fullName: p.fullName,
      createdAt: p.createdAt,
      dayPreferences: p.preferences?.day_preferences ?? {},
    }))
}
