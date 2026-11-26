import type { PlanMass, PlanSlot, RoleCode } from "./types"

/** Documento guardado no servidor: só missas NÃO publicadas ficam em `masses` (as publicadas vêm sempre da realidade). */
export interface PlanState {
  masses: PlanMass[]
  removedMasses: PlanMass[]
  suggested: boolean
}

export function serializePlanState(masses: PlanMass[], removedMasses: PlanMass[], suggested: boolean): PlanState {
  return {
    masses: masses.filter((m) => !m.wasPublished),
    removedMasses: [...removedMasses],
    suggested,
  }
}

const ROLES: ReadonlySet<string> = new Set<RoleCode>(["C", "1L", "2L", "L", "P"])
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

function optional(v: unknown, type: "string" | "number" | "boolean"): boolean {
  return v === undefined || typeof v === type
}

function isSlot(v: unknown): v is PlanSlot {
  if (!isObject(v)) return false
  return (
    typeof v.role === "string" &&
    ROLES.has(v.role) &&
    typeof v.profileId === "string" &&
    typeof v.locked === "boolean" &&
    optional(v.id, "string") &&
    optional(v.isSwapRequested, "boolean") &&
    (v.warning === undefined || v.warning === "outside-preference") &&
    optional(v.reason, "string")
  )
}

function isMass(v: unknown): v is PlanMass {
  if (!isObject(v)) return false
  return (
    typeof v.key === "string" &&
    optional(v.id, "string") &&
    (v.scheduleRevision === undefined || (typeof v.scheduleRevision === "number" && Number.isFinite(v.scheduleRevision))) &&
    typeof v.date === "string" &&
    DATE_RE.test(v.date) &&
    typeof v.time === "string" &&
    typeof v.description === "string" &&
    typeof v.wasPublished === "boolean" &&
    typeof v.readOnly === "boolean" &&
    Array.isArray(v.slots) &&
    v.slots.every(isSlot)
  )
}

/** Validador estrito: qualquer campo faltando ou de tipo errado devolve `null` (nunca lança). */
export function parsePlanState(raw: unknown): PlanState | null {
  if (!isObject(raw)) return null
  const { masses, removedMasses, suggested } = raw
  if (typeof suggested !== "boolean") return null
  if (!Array.isArray(masses) || !masses.every(isMass)) return null
  if (!Array.isArray(removedMasses) || !removedMasses.every(isMass)) return null
  // Uma missa não pode estar ao mesmo tempo no plano e na lista de removidas.
  const removedIds = new Set(removedMasses.flatMap((m) => (m.id ? [m.id] : [])))
  if (masses.some((m) => m.id && removedIds.has(m.id))) return null
  return { masses, removedMasses, suggested }
}
