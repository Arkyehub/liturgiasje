import { supabase } from "@/shared/api/supabase"
import { PlanDocument, PlanError, PlanErrorCode, PlanListItem, PlanOpenResult } from "@/domain/models/SchedulePlan"
import { SchedulePlanRepository } from "@/domain/repositories/SchedulePlanRepository"

const KNOWN_CODES: PlanErrorCode[] = [
  "forbidden", "invalid_arguments", "plan_not_found", "plan_lock_lost", "plan_revision_conflict",
  "plan_concluded", "plan_expired", "plan_too_large", "plan_exists", "plan_in_use"
]

function toPlanError(error: unknown): PlanError {
  const source = typeof error === "object" && error !== null ? (error as { code?: unknown; message?: unknown }) : {}
  const message = typeof source.message === "string" ? source.message : ""
  const known = KNOWN_CODES.find(code => message.includes(code))
  if (known) return new PlanError(known, error)
  if (
    source.code === "PGRST202" ||
    message.includes("Could not find the function") ||
    /function\s+(public\.)?plan_\w+.*does not exist/.test(message)
  ) {
    return new PlanError("unavailable", error)
  }
  return new PlanError("unknown", error)
}

export class SupabaseSchedulePlanRepository implements SchedulePlanRepository {
  private async call<T>(fn: string, args: Record<string, unknown>): Promise<T | null> {
    const { data, error } = await supabase.rpc(fn, args)
    if (error) throw toPlanError(error)
    return (data ?? null) as T | null
  }

  async list(months: string[]): Promise<PlanListItem[]> {
    return (await this.call<PlanListItem[]>("plan_list", { p_months: months })) ?? []
  }

  async open(month: string, session: string): Promise<PlanOpenResult> {
    return (await this.call<PlanOpenResult>("plan_open", { p_month: month, p_session: session })) as PlanOpenResult
  }

  async get(planId: string): Promise<PlanDocument | null> {
    return this.call<PlanDocument>("plan_get", { p_plan_id: planId })
  }

  async copy(sourceId: string, session: string, overwrite: boolean): Promise<PlanDocument> {
    return (await this.call<PlanDocument>("plan_copy", { p_source: sourceId, p_session: session, p_overwrite: overwrite })) as PlanDocument
  }

  async save(planId: string, session: string, requestId: string, expectedRevision: number, state: unknown): Promise<number> {
    const revision = await this.call<number | string>("plan_save", {
      p_plan_id: planId,
      p_session: session,
      p_request_id: requestId,
      p_expected_revision: expectedRevision,
      p_state: state
    })
    return Number(revision)
  }

  async heartbeat(planId: string, session: string): Promise<void> {
    await this.call("plan_heartbeat", { p_plan_id: planId, p_session: session })
  }

  async release(planId: string, session: string): Promise<void> {
    await this.call("plan_release", { p_plan_id: planId, p_session: session })
  }

  async conclude(planId: string, session: string): Promise<void> {
    await this.call("plan_conclude", { p_plan_id: planId, p_session: session })
  }

  async reopen(planId: string, session: string): Promise<PlanOpenResult> {
    return (await this.call<PlanOpenResult>("plan_reopen", { p_plan_id: planId, p_session: session })) as PlanOpenResult
  }

  async discard(planId: string): Promise<void> {
    await this.call("plan_discard", { p_plan_id: planId })
  }
}
