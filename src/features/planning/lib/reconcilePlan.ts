import type { PlanState } from "./planState"
import type { PlanMass } from "./types"

export interface ReconcileNotice {
  kind: "changed" | "removed" | "published" | "invalid-state"
  dates: string[]
}

const KIND_ORDER: ReconcileNotice["kind"][] = ["changed", "removed", "published", "invalid-state"]

function byDateTime(a: PlanMass, b: PlanMass): number {
  return a.date.localeCompare(b.date) || a.time.localeCompare(b.time) || a.key.localeCompare(b.key)
}

/**
 * Reconcilia o planejamento guardado com as missas reais do mês (já convertidas por `massToPlan`).
 * Regras (spec 5.6): vale a versão real quando a revisão difere; real sumida sai do plano;
 * publicadas entram sempre, somente leitura, e vencem a guardada; rascunho real novo entra normalmente.
 * `storedWasInvalid` = havia algo guardado, mas `parsePlanState` o recusou.
 */
export function reconcilePlan(
  stored: PlanState | null,
  real: PlanMass[],
  storedWasInvalid = false,
): { masses: PlanMass[]; removedMasses: PlanMass[]; suggested: boolean; notices: ReconcileNotice[] } {
  const noticeDates: Record<"changed" | "removed" | "published", Set<string>> = {
    changed: new Set(),
    removed: new Set(),
    published: new Set(),
  }
  const realById = new Map<string, PlanMass>()
  const realBySlot = new Map<string, PlanMass>()
  for (const r of real) {
    if (r.id) realById.set(r.id, r)
    const slotKey = `${r.date}|${r.time}`
    const prev = realBySlot.get(slotKey)
    if (!prev || (r.wasPublished && !prev.wasPublished)) realBySlot.set(slotKey, r)
  }

  const keptStored: PlanMass[] = []
  const keptIds = new Set<string>()
  for (const s of stored?.masses ?? []) {
    if (s.wasPublished) continue
    if (s.id) {
      const r = realById.get(s.id)
      if (!r) noticeDates.removed.add(s.date)
      else if (r.wasPublished) noticeDates.published.add(r.date)
      else if (r.scheduleRevision !== s.scheduleRevision) noticeDates.changed.add(r.date)
      else if (!keptIds.has(s.id)) {
        keptIds.add(s.id)
        keptStored.push(s)
      }
      continue
    }
    const conflict = realBySlot.get(`${s.date}|${s.time}`)
    if (conflict) noticeDates[conflict.wasPublished ? "published" : "changed"].add(s.date)
    else keptStored.push(s)
  }

  // Remoção guardada só vale se o rascunho real ainda existe, não é publicado e a revisão é a mesma;
  // se a revisão difere, vale a versão real (a remoção cai e a missa real volta ao plano com aviso).
  const removedSeen = new Set<string>()
  const removedMasses = (stored?.removedMasses ?? []).filter((m) => {
    if (!m.id || removedSeen.has(m.id)) return false
    const r = realById.get(m.id)
    if (!r || r.wasPublished) return false
    if (r.scheduleRevision !== m.scheduleRevision) {
      noticeDates.changed.add(r.date)
      return false
    }
    removedSeen.add(m.id)
    return true
  })

  // Reais entram, exceto rascunhos cuja versão guardada foi mantida ou que o usuário removeu.
  const realIncluded = real.filter((r) => r.wasPublished || !r.id || !(keptIds.has(r.id) || removedSeen.has(r.id)))
  const taken = new Set(realIncluded.map((r) => r.key))
  const storedUnique = keptStored.map((s) => {
    let key = s.key
    for (let n = 2; taken.has(key); n++) key = `${s.key}~${n}`
    taken.add(key)
    return key === s.key ? s : { ...s, key }
  })
  const masses = [...realIncluded, ...storedUnique].sort(byDateTime)

  const notices: ReconcileNotice[] = []
  for (const kind of KIND_ORDER) {
    if (kind === "invalid-state") {
      if (storedWasInvalid && !stored) notices.push({ kind, dates: [] })
    } else if (noticeDates[kind].size > 0) {
      notices.push({ kind, dates: [...noticeDates[kind]].sort() })
    }
  }

  return { masses, removedMasses, suggested: stored?.suggested ?? false, notices }
}
