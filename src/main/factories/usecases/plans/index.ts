import { ListPlans, OpenPlan, GetPlan, CopyPlan, SavePlan, HeartbeatPlan, ReleasePlan, ConcludePlan, ReopenPlan, DiscardPlan } from "@/domain/usecases/plans"
import { SupabaseSchedulePlanRepository } from "@/data/repositories/SupabaseSchedulePlanRepository"

const repository = new SupabaseSchedulePlanRepository()

export const makeListPlans = () => new ListPlans(repository)
export const makeOpenPlan = () => new OpenPlan(repository)
export const makeGetPlan = () => new GetPlan(repository)
export const makeCopyPlan = () => new CopyPlan(repository)
export const makeSavePlan = () => new SavePlan(repository)
export const makeHeartbeatPlan = () => new HeartbeatPlan(repository)
export const makeReleasePlan = () => new ReleasePlan(repository)
export const makeConcludePlan = () => new ConcludePlan(repository)
export const makeReopenPlan = () => new ReopenPlan(repository)
export const makeDiscardPlan = () => new DiscardPlan(repository)
