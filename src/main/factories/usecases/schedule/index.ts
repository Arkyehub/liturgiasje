import { ListSchedulesForMonth, ConfirmScheduleSlot, RequestScheduleSwap, CancelScheduleSwap, GetMembersUsage, CreateMassWithSlots, PublishScheduleMonth, UpdateMass, ListAllSwaps, DeleteMass, AcceptScheduleSwap, CheckMassExists } from "@/domain/usecases/schedule"
import { SupabaseScheduleRepository } from "@/data/repositories/SupabaseScheduleRepository"

const repository = new SupabaseScheduleRepository()

export const makeListSchedulesForMonth = () => new ListSchedulesForMonth(repository)
export const makeConfirmScheduleSlot = () => new ConfirmScheduleSlot(repository)
export const makeRequestScheduleSwap = () => new RequestScheduleSwap(repository)
export const makeCancelScheduleSwap = () => new CancelScheduleSwap(repository)
export const makeGetMembersUsage = () => new GetMembersUsage(repository)
export const makeCreateMassWithSlots = () => new CreateMassWithSlots(repository)
export const makePublishScheduleMonth = () => new PublishScheduleMonth(repository)
export const makeUpdateMass = () => new UpdateMass(repository)
export const makeListAllSwaps = () => new ListAllSwaps(repository)
export const makeDeleteMass = () => new DeleteMass(repository)
export const makeAcceptScheduleSwap = () => new AcceptScheduleSwap(repository)
export const makeCheckMassExists = () => new CheckMassExists(repository)
