import type { RemovedMass, ScheduleBatchEntry } from "@/domain/models/Schedule"
import type { PlanMass } from "./types"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i

export function planToBatch(
  masses: PlanMass[],
  removed: PlanMass[]
): { entries: ScheduleBatchEntry[]; removed: RemovedMass[] } {
  const editable = masses.filter((m) => !m.readOnly)

  const entries: ScheduleBatchEntry[] = editable.map((m) => ({
    massId: m.id,
    massData: {
      expectedRevision: m.scheduleRevision,
      date: m.date,
      time: `${m.time}:00`,
      specialDescription: m.description,
      monthReference: m.date.slice(0, 7),
    },
    slots: m.slots.map((s) => ({
      id: s.id && UUID_RE.test(s.id) ? s.id : undefined,
      role: s.role,
      profileId: s.profileId,
    })),
  }))

  const removedOut: RemovedMass[] = removed
    .filter((m): m is PlanMass & { id: string } => !!m.id)
    .map((m) => ({ id: m.id, expectedRevision: m.scheduleRevision }))

  return { entries, removed: removedOut }
}
