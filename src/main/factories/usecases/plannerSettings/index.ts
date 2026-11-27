import { GetPlannerSettings, SavePlannerSettings } from "@/domain/usecases/plannerSettings"
import { SupabasePlannerSettingsRepository } from "@/data/repositories/SupabasePlannerSettingsRepository"

const repository = new SupabasePlannerSettingsRepository()

export const makeGetPlannerSettings = () => new GetPlannerSettings(repository)
export const makeSavePlannerSettings = () => new SavePlannerSettings(repository)
