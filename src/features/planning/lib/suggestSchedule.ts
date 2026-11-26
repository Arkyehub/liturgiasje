import { MASS_PREFERENCE_DAYS, preferenceKeyForWeekday, preferredTimesForDate } from "@/features/profile/lib/massPreferences"
import {
  roleGroup,
  type PlanMass,
  type PlanReader,
  type PlanSlot,
  type PlanSummary,
  type RoleCode,
  type SuggestInput,
} from "./types"

/*
 * Lâmpada: sugestão de escala.
 *
 * Regras duras (nunca quebradas): indisponibilidade na data, um leitor por missa,
 * vagas travadas e missas readOnly intocadas (mas contam na carga, na meta e no espaçamento).
 *
 * Regras suaves = um custo global (menor é melhor), somado por leitor:
 *   - equilíbrio: W_BALANCE·(carga − meta)²  + W_OVER por vaga acima de ⌈meta⌉
 *     meta = vagas do mês ÷ leitores elegíveis, deslocada (±MAX_AVG_BIAS) pela média
 *     mensal do leitor em relação à do grupo (abaixo da média ⇒ meta um pouco maior)
 *   - preferência: W_PREF_MISS por vaga em dia/horário de preferência que o leitor não marcou
 *   - afinidade: W_AFFINITY·(1 − proporção do grupo de função)
 *   - distribuição: W_SAME_DAY por missa extra no mesmo dia; W_WEEKEND por par de fins de
 *     semana seguidos
 * A rodada gulosa escolhe, para cada vaga (da mais restrita para a menos), o candidato de
 * menor custo marginal; a rodada de melhoria aplica transferências e trocas que baixam o custo.
 */

const W_BALANCE = 10
const W_OVER = 40
const W_PREF_MISS = 30
const W_AFFINITY = 4
const W_SAME_DAY = 35
const W_WEEKEND = 6
/** < 0,5 para que a diferença de metas entre dois leitores fique < 1 e o spread ≤ 1 se mantenha. */
const MAX_AVG_BIAS = 0.4
const EPS = 1e-9
const MAX_SWEEPS = 200

const ROLE_LABEL: Record<RoleCode, string> = {
  C: "Comentarista",
  "1L": "1ª Leitura",
  "2L": "2ª Leitura",
  L: "Leitura",
  P: "Preces",
}

/** Dia sequencial (UTC) e dia da semana de uma data yyyy-MM-dd, sem efeito de fuso/horário de verão. */
function dayNumber(date: string): number {
  return Math.floor(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10))) / 86400000)
}

/** Identificador do fim de semana (dia do domingo) ou null se não é sábado/domingo. */
function weekendId(date: string): number | null {
  const n = dayNumber(date)
  const weekday = (n + 4) % 7 // 1970-01-01 foi quinta (4)
  if (weekday === 0) return n
  if (weekday === 6) return n + 1
  return null
}

/** O dia/horário da missa é um dos que o leitor pode marcar como preferência. */
function isPreferenceSlot(mass: PlanMass): boolean {
  const key = preferenceKeyForWeekday((dayNumber(mass.date) + 4) % 7)
  if (key === null) return false
  return MASS_PREFERENCE_DAYS.some((d) => d.key === key && d.times.includes(mass.time))
}

interface Cell {
  massIdx: number
  slotIdx: number
  mass: PlanMass
  role: RoleCode
  date: string
  weekend: number | null
  prefSlot: boolean
  locked: boolean
}

interface Ctx {
  input: SuggestInput
  readerById: Map<string, PlanReader>
  target: Map<string, number>
  groupTarget: number
  unavailable: Map<string, Set<string>>
  /** leitor → células atribuídas (travadas + sugeridas) */
  byReader: Map<string, Cell[]>
  /** massIdx → leitores presentes */
  inMass: Map<number, Set<string>>
}

function prefers(reader: PlanReader, cell: Cell): boolean {
  return preferredTimesForDate(reader.dayPreferences, cell.date).includes(cell.mass.time)
}

function cellCost(ctx: Ctx, reader: PlanReader, cell: Cell): number {
  let c = 0
  if (cell.prefSlot && !prefers(reader, cell)) c += W_PREF_MISS
  const group = roleGroup(cell.role)
  const share = group ? (ctx.input.stats[reader.id]?.roleShare?.[group] ?? 0) : 0
  c += W_AFFINITY * (1 - share)
  return c
}

/** Custo total de um leitor com um conjunto de células. */
function readerCost(ctx: Ctx, readerId: string, cells: Cell[]): number {
  const reader = ctx.readerById.get(readerId)
  if (!reader) return 0
  const t = ctx.target.get(readerId) ?? ctx.groupTarget
  const load = cells.length
  let c = W_BALANCE * (load - t) * (load - t) + W_OVER * Math.max(0, load - Math.ceil(t - EPS))
  const perDay = new Map<string, number>()
  const weekends = new Set<number>()
  for (const cell of cells) {
    c += cellCost(ctx, reader, cell)
    perDay.set(cell.date, (perDay.get(cell.date) ?? 0) + 1)
    if (cell.weekend !== null) weekends.add(cell.weekend)
  }
  for (const n of perDay.values()) c += W_SAME_DAY * (n - 1)
  for (const w of weekends) if (weekends.has(w + 7)) c += W_WEEKEND
  return c
}

function cellsOf(ctx: Ctx, readerId: string): Cell[] {
  return ctx.byReader.get(readerId) ?? []
}

function canTake(ctx: Ctx, readerId: string, cell: Cell, ignoreInMass?: string): boolean {
  if (ctx.unavailable.get(cell.date)?.has(readerId)) return false
  const present = ctx.inMass.get(cell.massIdx)
  if (present?.has(readerId) && readerId !== ignoreInMass) return false
  return true
}

function compareReaders(a: PlanReader, b: PlanReader): number {
  return a.fullName.localeCompare(b.fullName, "pt-BR") || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
}

function assign(ctx: Ctx, readerId: string, cell: Cell): void {
  const list = ctx.byReader.get(readerId)
  if (list) list.push(cell)
  else ctx.byReader.set(readerId, [cell])
  const present = ctx.inMass.get(cell.massIdx)
  if (present) present.add(readerId)
  else ctx.inMass.set(cell.massIdx, new Set([readerId]))
}

function unassign(ctx: Ctx, readerId: string, cell: Cell): void {
  ctx.byReader.set(
    readerId,
    cellsOf(ctx, readerId).filter((c) => c !== cell)
  )
  ctx.inMass.get(cell.massIdx)?.delete(readerId)
}

function formatNumber(n: number): string {
  return (Math.round(n * 10) / 10).toLocaleString("pt-BR")
}

function buildReason(ctx: Ctx, reader: PlanReader, cell: Cell): string {
  const parts: string[] = []
  if (cell.prefSlot) parts.push(prefers(reader, cell) ? "Preferência neste horário" : "Fora da preferência (sem opção melhor)")
  const load = cellsOf(ctx, reader.id).length
  parts.push(`${load} ${load === 1 ? "leitura" : "leituras"} no mês (meta ${formatNumber(ctx.groupTarget)})`)
  const stats = ctx.input.stats[reader.id]
  const avg = stats?.monthlyAverage
  const groupAvg = groupAverage(ctx.input)
  if (avg !== undefined && avg < groupAvg - 0.5) parts.push("média abaixo do grupo")
  const group = roleGroup(cell.role)
  if (group && (stats?.roleShare?.[group] ?? 0) >= 0.5) parts.push(`costuma fazer ${ROLE_LABEL[cell.role]}`)
  return parts.join(" · ")
}

function groupAverage(input: SuggestInput): number {
  const values = input.readers.map((r) => input.stats[r.id]?.monthlyAverage).filter((v): v is number => v !== undefined)
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0
}

export function suggestSchedule(input: SuggestInput): PlanMass[] {
  const readers = [...input.readers].sort(compareReaders)
  const readerById = new Map(readers.map((r) => [r.id, r]))

  const cells: Cell[] = []
  input.masses.forEach((mass, massIdx) => {
    // Missas readOnly entram como vagas fixas: contam na meta, na carga e no espaçamento,
    // mas nunca são re-sugeridas (o retorno as devolve intactas).
    const weekend = weekendId(mass.date)
    const prefSlot = isPreferenceSlot(mass)
    mass.slots.forEach((slot, slotIdx) => {
      cells.push({ massIdx, slotIdx, mass, role: slot.role, date: mass.date, weekend, prefSlot, locked: slot.locked || mass.readOnly })
    })
  })

  // Meta mensal: vagas (travadas inclusive) ÷ leitores elegíveis, deslocada pela média do leitor.
  const groupTarget = readers.length ? cells.length / readers.length : 0
  const gAvg = groupAverage(input)
  const target = new Map<string, number>()
  for (const r of readers) {
    const avg = input.stats[r.id]?.monthlyAverage ?? gAvg
    const rel = Math.max(-1, Math.min(1, (gAvg - avg) / Math.max(gAvg, 1)))
    target.set(r.id, groupTarget + MAX_AVG_BIAS * rel)
  }

  const unavailable = new Map<string, Set<string>>()
  for (const [date, ids] of Object.entries(input.unavailable)) unavailable.set(date, new Set(ids))

  const ctx: Ctx = { input, readerById, target, groupTarget, unavailable, byReader: new Map(), inMass: new Map() }

  // Travadas e missas readOnly contam na carga e ocupam o leitor na missa.
  for (const cell of cells) {
    const slot = cell.mass.slots[cell.slotIdx]
    if (cell.locked && slot.profileId) assign(ctx, slot.profileId, cell)
  }

  const open = cells.filter((c) => !c.locked)
  const candidateCount = (cell: Cell) => readers.filter((r) => canTake(ctx, r.id, cell)).length
  const order = open
    .map((cell) => ({ cell, n: candidateCount(cell) }))
    .sort(
      (a, b) =>
        a.n - b.n ||
        (a.cell.date < b.cell.date ? -1 : a.cell.date > b.cell.date ? 1 : 0) ||
        (a.cell.mass.time < b.cell.mass.time ? -1 : a.cell.mass.time > b.cell.mass.time ? 1 : 0) ||
        a.cell.massIdx - b.cell.massIdx ||
        a.cell.slotIdx - b.cell.slotIdx
    )
    .map((x) => x.cell)

  // (1)–(3) Rodada gulosa: menor custo marginal; empate pelo nome (readers já ordenados).
  const chosen = new Map<Cell, string>()
  for (const cell of order) {
    let best: string | null = null
    let bestDelta = Infinity
    for (const r of readers) {
      if (!canTake(ctx, r.id, cell)) continue
      const current = cellsOf(ctx, r.id)
      const delta = readerCost(ctx, r.id, [...current, cell]) - readerCost(ctx, r.id, current)
      if (delta < bestDelta - EPS) {
        bestDelta = delta
        best = r.id
      }
    }
    if (best) {
      assign(ctx, best, cell)
      chosen.set(cell, best)
    }
  }

  // (4) Rodada de melhoria: transferências e trocas entre pares que reduzem o custo.
  const filled = order.filter((c) => chosen.has(c))
  for (let sweep = 0; sweep < MAX_SWEEPS; sweep++) {
    let improved = false

    for (const cell of filled) {
      const from = chosen.get(cell) as string
      for (const r of readers) {
        if (r.id === from || !canTake(ctx, r.id, cell)) continue
        const fromCells = cellsOf(ctx, from)
        const toCells = cellsOf(ctx, r.id)
        const before = readerCost(ctx, from, fromCells) + readerCost(ctx, r.id, toCells)
        const after =
          readerCost(ctx, from, fromCells.filter((c) => c !== cell)) + readerCost(ctx, r.id, [...toCells, cell])
        if (after < before - EPS) {
          unassign(ctx, from, cell)
          assign(ctx, r.id, cell)
          chosen.set(cell, r.id)
          improved = true
          break
        }
      }
    }

    for (let i = 0; i < filled.length; i++) {
      for (let j = i + 1; j < filled.length; j++) {
        const a = filled[i]
        const b = filled[j]
        const ra = chosen.get(a) as string
        const rb = chosen.get(b) as string
        if (ra === rb) continue
        const sameMass = a.massIdx === b.massIdx
        if (!canTake(ctx, ra, b, sameMass ? ra : undefined) || !canTake(ctx, rb, a, sameMass ? rb : undefined)) continue
        const aCells = cellsOf(ctx, ra)
        const bCells = cellsOf(ctx, rb)
        const before = readerCost(ctx, ra, aCells) + readerCost(ctx, rb, bCells)
        const after =
          readerCost(ctx, ra, [...aCells.filter((c) => c !== a), b]) +
          readerCost(ctx, rb, [...bCells.filter((c) => c !== b), a])
        if (after < before - EPS) {
          unassign(ctx, ra, a)
          unassign(ctx, rb, b)
          assign(ctx, ra, b)
          assign(ctx, rb, a)
          chosen.set(a, rb)
          chosen.set(b, ra)
          improved = true
        }
      }
    }

    if (!improved) break
  }

  // (5) Resultado com aviso e motivo.
  const byPosition = new Map<string, Cell>()
  for (const cell of cells) byPosition.set(`${cell.massIdx}:${cell.slotIdx}`, cell)

  return input.masses.map((mass, massIdx) => {
    if (mass.readOnly) return mass
    const slots = mass.slots.map((slot, slotIdx): PlanSlot => {
      if (slot.locked) return slot
      const { warning: _w, reason: _r, ...rest } = slot
      void _w
      void _r
      const cell = byPosition.get(`${massIdx}:${slotIdx}`) as Cell
      const readerId = chosen.get(cell)
      if (!readerId) return { ...rest, profileId: "", reason: "Nenhum leitor disponível nesta data" }
      const reader = readerById.get(readerId) as PlanReader
      const out: PlanSlot = { ...rest, profileId: readerId, reason: buildReason(ctx, reader, cell) }
      if (cell.prefSlot && !prefers(reader, cell)) out.warning = "outside-preference"
      return out
    })
    return { ...mass, slots }
  })
}

export function summarizePlan(masses: PlanMass[]): PlanSummary {
  let totalSlots = 0
  let filled = 0
  let outsidePreference = 0
  let locked = 0
  for (const m of masses) {
    for (const s of m.slots) {
      totalSlots++
      if (s.profileId !== "") filled++
      if (s.warning === "outside-preference") outsidePreference++
      if (s.locked) locked++
    }
  }
  return { totalSlots, filled, empty: totalSlots - filled, outsidePreference, locked }
}
