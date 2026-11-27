import { SchedulePlanRepository } from "../../repositories/SchedulePlanRepository"
import { PlanDocument, PlanListItem, PlanOpenResult } from "../../models/SchedulePlan"

export class ListPlans {
  constructor(private readonly planRepository: SchedulePlanRepository) {}
  async execute(months: string[]): Promise<PlanListItem[]> {
    return this.planRepository.list(months)
  }
}

export class OpenPlan {
  constructor(private readonly planRepository: SchedulePlanRepository) {}
  async execute(month: string, session: string): Promise<PlanOpenResult> {
    return this.planRepository.open(month, session)
  }
}

export class GetPlan {
  constructor(private readonly planRepository: SchedulePlanRepository) {}
  async execute(planId: string): Promise<PlanDocument | null> {
    return this.planRepository.get(planId)
  }
}

export class CopyPlan {
  constructor(private readonly planRepository: SchedulePlanRepository) {}
  async execute(sourceId: string, session: string, overwrite: boolean, copySettings = false): Promise<PlanDocument> {
    return this.planRepository.copy(sourceId, session, overwrite, copySettings)
  }
}

export class SavePlan {
  constructor(private readonly planRepository: SchedulePlanRepository) {}
  async execute(planId: string, session: string, requestId: string, expectedRevision: number, state: unknown): Promise<number> {
    return this.planRepository.save(planId, session, requestId, expectedRevision, state)
  }
}

export class ConcludePlan {
  constructor(private readonly planRepository: SchedulePlanRepository) {}
  async execute(planId: string, session: string): Promise<void> {
    return this.planRepository.conclude(planId, session)
  }
}

export class ReopenPlan {
  constructor(private readonly planRepository: SchedulePlanRepository) {}
  async execute(planId: string, session: string): Promise<PlanOpenResult> {
    return this.planRepository.reopen(planId, session)
  }
}

export class DiscardPlan {
  constructor(private readonly planRepository: SchedulePlanRepository) {}
  async execute(planId: string): Promise<void> {
    return this.planRepository.discard(planId)
  }
}
