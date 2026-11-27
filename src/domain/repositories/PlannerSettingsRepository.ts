import { LampRules, PlannerSettings, StandardMass } from "../models/PlannerSettings"

export interface PlannerSettingsRepository {
  get(): Promise<PlannerSettings>
  save(standardMasses: StandardMass[], lampRules: LampRules): Promise<PlannerSettings>
}
