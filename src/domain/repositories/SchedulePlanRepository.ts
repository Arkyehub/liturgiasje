import { PlanDocument, PlanListItem, PlanOpenResult } from "../models/SchedulePlan"

export interface SchedulePlanRepository {
  list(months: string[]): Promise<PlanListItem[]>
  open(month: string, session: string): Promise<PlanOpenResult>
  get(planId: string): Promise<PlanDocument | null>
  copy(sourceId: string, session: string, overwrite: boolean): Promise<PlanDocument>
  save(planId: string, session: string, requestId: string, expectedRevision: number, state: unknown): Promise<number>
  conclude(planId: string, session: string): Promise<void>
  reopen(planId: string, session: string): Promise<PlanOpenResult>
  discard(planId: string): Promise<void>
}
