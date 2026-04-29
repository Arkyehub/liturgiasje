import { ListMembers, SearchMembers, CreateMember, UpdateMember, DeleteMember, ClaimMember, GetMemberByUserId } from "@/domain/usecases/members"
import { SupabaseMemberRepository } from "@/data/repositories/SupabaseMemberRepository"

const repository = new SupabaseMemberRepository()

export const makeListMembers = () => new ListMembers(repository)
export const makeSearchMembers = () => new SearchMembers(repository)
export const makeCreateMember = () => new CreateMember(repository)
export const makeUpdateMember = () => new UpdateMember(repository)
export const makeDeleteMember = () => new DeleteMember(repository)
export const makeClaimMember = () => new ClaimMember(repository)
export const makeGetMemberByUserId = () => new GetMemberByUserId(repository)
