/** Funções fixas para todas as igrejas (iguais a `RoleCode` do planejamento). */
export type PlannerRoleCode = "C" | "1L" | "2L" | "L" | "P"

export const PLANNER_ROLES: PlannerRoleCode[] = ["C", "1L", "2L", "L", "P"]

/** Uma missa padrão: dia da semana (0 = domingo), horário "HH:mm" e funções. */
export interface StandardMass {
  weekday: number
  time: string
  roles: PlannerRoleCode[]
}

/** Regras suaves da lâmpada; as três regras duras não são configuráveis. Todas ligadas por padrão. */
export interface LampRules {
  balance: boolean
  preferences: boolean
  affinity: boolean
  sameDay: boolean
  weekends: boolean
  history: boolean
}

export const LAMP_RULE_KEYS: (keyof LampRules)[] = ["balance", "preferences", "affinity", "sameDay", "weekends", "history"]

export const DEFAULT_LAMP_RULES: LampRules = {
  balance: true,
  preferences: true,
  affinity: true,
  sameDay: true,
  weekends: true,
  history: true,
}

export interface PlannerSettings {
  standardMasses: StandardMass[]
  lampRules: LampRules
  /** Há algo real configurado (ao menos uma missa padrão ou uma regra desligada). */
  hasCustom: boolean
}

const TIME = /^([01][0-9]|2[0-3]):[0-5][0-9]$/

/** Lê a resposta do servidor sem confiar nela: lixo vira o padrão; chave ausente de regra = ligada. */
export function normalizeSettings(raw: unknown): PlannerSettings {
  const source = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {}
  const standardMasses: StandardMass[] = []
  if (Array.isArray(source.standardMasses)) {
    for (const item of source.standardMasses) {
      if (typeof item !== "object" || item === null) continue
      const m = item as Record<string, unknown>
      const weekday = typeof m.weekday === "number" && Number.isInteger(m.weekday) && m.weekday >= 0 && m.weekday <= 6 ? m.weekday : null
      const time = typeof m.time === "string" && TIME.test(m.time) ? m.time : null
      const roles = Array.isArray(m.roles)
        ? PLANNER_ROLES.filter((r) => (m.roles as unknown[]).includes(r))
        : []
      if (weekday === null || time === null || roles.length === 0) continue
      standardMasses.push({ weekday, time, roles })
    }
  }
  const rulesSource = typeof source.lampRules === "object" && source.lampRules !== null ? (source.lampRules as Record<string, unknown>) : {}
  const lampRules = { ...DEFAULT_LAMP_RULES }
  for (const key of LAMP_RULE_KEYS) {
    if (rulesSource[key] === false) lampRules[key] = false
  }
  const hasCustom = standardMasses.length > 0 || LAMP_RULE_KEYS.some((k) => !lampRules[k])
  return { standardMasses, lampRules, hasCustom }
}

export type SettingsErrorCode = "forbidden" | "invalid_settings" | "settings_too_large" | "unavailable" | "unknown"

export class SettingsError extends Error {
  code: SettingsErrorCode

  constructor(code: SettingsErrorCode, cause?: unknown) {
    super(code, cause === undefined ? undefined : { cause })
    this.name = "SettingsError"
    this.code = code
  }
}

const MESSAGES: Record<SettingsErrorCode, string> = {
  forbidden: "Você não tem permissão para alterar estas configurações.",
  invalid_settings: "Há algo inválido nas configurações. Confira os horários e as funções.",
  settings_too_large: "As configurações ficaram grandes demais para serem salvas.",
  unavailable: "Configurações indisponíveis neste ambiente.",
  unknown: "Não foi possível concluir a operação. Tente novamente.",
}

export function settingsErrorMessage(error: unknown): string {
  const code = error instanceof SettingsError ? error.code : "unknown"
  return MESSAGES[code]
}
