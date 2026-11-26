import type { SlotHistoryRow } from "@/domain/models/Schedule"
import { roleGroup, type PlanReader, type ReaderStats, type RoleGroup } from "./types"

const AVERAGE_WINDOW_MONTHS = 3
const AFFINITY_WINDOW_MONTHS = 12

/** Índice absoluto do mês a partir de uma string que começa com yyyy-MM. */
function monthIndex(value: string): number {
  return Number(value.slice(0, 4)) * 12 + (Number(value.slice(5, 7)) - 1)
}

/**
 * Estatísticas por leitor. "Leitura servida" = escalada cumprida + troca assumida;
 * vagas repassadas a outra pessoa não contam para quem passou.
 */
export function computeReaderStats(
  readers: PlanReader[],
  history: SlotHistoryRow[],
  month: Date,
): Record<string, ReaderStats> {
  const planned = month.getFullYear() * 12 + month.getMonth()
  const avgStart = planned - AVERAGE_WINDOW_MONTHS
  const affinityStart = planned - AFFINITY_WINDOW_MONTHS

  const result: Record<string, ReaderStats> = {}
  const windowMonths: Record<string, number> = {}
  for (const r of readers) {
    const joined = monthIndex(r.createdAt)
    windowMonths[r.id] = Math.max(0, planned - Math.max(avgStart, joined))
    result[r.id] = {
      readerId: r.id,
      monthlyAverage: 0,
      scheduled: 0,
      takeovers: 0,
      passed: 0,
      roleShare: { C: 0, R: 0, P: 0 },
    }
  }

  const affinityCount: Record<string, Record<RoleGroup, number>> = {}

  for (const h of history) {
    const idx = monthIndex(h.date)
    if (idx >= planned) continue
    const isTakeover = !!h.originalProfileId && h.originalProfileId !== h.profileId
    const inAverage = idx >= avgStart

    const taker = result[h.profileId]
    if (taker) {
      if (inAverage) {
        if (isTakeover) taker.takeovers++
        else taker.scheduled++
      }
      const group = roleGroup(h.role)
      if (group && idx >= affinityStart) {
        const c = (affinityCount[h.profileId] ??= { C: 0, R: 0, P: 0 })
        c[group]++
      }
    }
    if (isTakeover && inAverage) {
      const passer = result[h.originalProfileId as string]
      if (passer) passer.passed++
    }
  }

  let sum = 0
  let withMonths = 0
  for (const r of readers) {
    const s = result[r.id]
    const months = windowMonths[r.id]
    if (months > 0) {
      s.monthlyAverage = (s.scheduled + s.takeovers) / months
      sum += s.monthlyAverage
      withMonths++
    }
    const c = affinityCount[r.id]
    if (c) {
      const total = c.C + c.R + c.P
      if (total > 0) s.roleShare = { C: c.C / total, R: c.R / total, P: c.P / total }
    }
  }

  const groupAverage = withMonths > 0 ? sum / withMonths : 0
  for (const r of readers) {
    if (windowMonths[r.id] === 0) result[r.id].monthlyAverage = groupAverage
  }
  return result
}
