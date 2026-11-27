import type { ReaderStats, RoleCode, RoleGroup } from "./types"

/** Ordem das funções dentro de uma missa. */
export const ROLE_ORDER: Record<string, number> = { C: 0, "1L": 1, "2L": 2, L: 3, P: 4 }

export const ROLE_LABEL: Record<RoleCode, string> = {
  C: "Comentarista",
  "1L": "1ª Leitura",
  "2L": "2ª Leitura",
  L: "Leitura",
  P: "Preces",
}

export const GROUP_LABEL: Record<RoleGroup, string> = { C: "Comentarista", R: "Leitura", P: "Preces" }

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** Meta fracionária exibida arredondada: "3 a 4". */
export function targetLabel(target: number): string {
  if (!Number.isFinite(target) || target <= 0) return "—"
  const lo = Math.floor(target)
  const hi = Math.ceil(target)
  return lo === hi ? String(lo) : `${lo} a ${hi}`
}

/** Grupo de função que o leitor mais faz (null sem histórico). */
export function topRole(stats?: ReaderStats): { label: string; percent: number } | null {
  if (!stats) return null
  const [group, share] = (Object.entries(stats.roleShare) as [RoleGroup, number][]).sort((a, b) => b[1] - a[1])[0]
  return share > 0 ? { label: GROUP_LABEL[group], percent: Math.round(share * 100) } : null
}
