import { PlannerSettingsRepository } from "../../repositories/PlannerSettingsRepository"
import { LampRules, PlannerSettings, StandardMass } from "../../models/PlannerSettings"

export class GetPlannerSettings {
  constructor(private readonly repository: PlannerSettingsRepository) {}
  async execute(): Promise<PlannerSettings> {
    return this.repository.get()
  }
}

export class SavePlannerSettings {
  constructor(private readonly repository: PlannerSettingsRepository) {}
  async execute(standardMasses: StandardMass[], lampRules: LampRules): Promise<PlannerSettings> {
    return this.repository.save(standardMasses, lampRules)
  }
}
