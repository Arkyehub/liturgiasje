export type PlanStatus = "em_andamento" | "concluido"

export interface PlanListItem {
  id: string
  monthReference: string
  ownerProfileId: string
  ownerName: string
  isMine: boolean
  status: PlanStatus
  createdAt: string
  updatedAt: string
  expiresAt: string
  copiedFromName: string | null
  concludedAt: string | null
  /** O plano já foi gravado ao menos uma vez (state não nulo): só então pode ser copiado. */
  hasContent: boolean
  /** O dono tem configurações do planejamento com algo real (missas padrão ou regra desligada): pode-se oferecer copiá-las. */
  ownerHasSettings: boolean
}

export interface PlanDocument extends PlanListItem {
  revision: number
  state: unknown | null
}

export type PlanOpenMode = "edit" | "readonly" | "concluded"

export interface PlanOpenResult {
  mode: PlanOpenMode
  plan: PlanDocument
}

export type PlanErrorCode =
  | "forbidden"
  | "invalid_arguments"
  | "plan_not_found"
  | "plan_revision_conflict"
  | "plan_concluded"
  | "plan_expired"
  | "plan_too_large"
  | "plan_exists"
  | "unavailable"
  | "unknown"

export class PlanError extends Error {
  code: PlanErrorCode

  constructor(code: PlanErrorCode, cause?: unknown) {
    super(code, cause === undefined ? undefined : { cause })
    this.name = "PlanError"
    this.code = code
  }
}

const MESSAGES: Record<PlanErrorCode, string> = {
  forbidden: "Você não tem permissão para esta ação no planejamento.",
  invalid_arguments: "Dados inválidos para o planejamento.",
  plan_not_found: "Planejamento não encontrado.",
  plan_revision_conflict: "O planejamento foi alterado em outra sessão. Recarregue para continuar.",
  plan_concluded: "Este planejamento já foi concluído. Reabra-o para editar.",
  plan_expired: "Este planejamento expirou.",
  plan_too_large: "O planejamento ficou grande demais para ser salvo.",
  plan_exists: "Você já possui um planejamento para este mês.",
  unavailable: "Planejamento compartilhado indisponível neste ambiente.",
  unknown: "Não foi possível concluir a operação do planejamento. Tente novamente."
}

export function planErrorMessage(error: unknown): string {
  const code = error instanceof PlanError ? error.code : "unknown"
  return MESSAGES[code]
}
