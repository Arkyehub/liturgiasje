import { GetUserProfile, CreateUserProfile, UpdateUserProfile, UploadUserAvatar, UpdateUserRole, ListBirthdays } from "@/domain/usecases/user"
import { ListUnavailableByUser, ToggleUnavailableDate } from "@/domain/usecases/user/unavailable"
import { SupabaseUserRepository } from "@/data/repositories/SupabaseUserRepository"
import { SupabaseUnavailableRepository } from "@/data/repositories/SupabaseUnavailableRepository"

const userRepository = new SupabaseUserRepository()
const unavailableRepository = new SupabaseUnavailableRepository()

export const makeGetUserProfile = () => new GetUserProfile(userRepository)
export const makeCreateUserProfile = () => new CreateUserProfile(userRepository)
export const makeUpdateUserProfile = () => new UpdateUserProfile(userRepository)
export const makeUploadUserAvatar = () => new UploadUserAvatar(userRepository)
export const makeUpdateUserRole = () => new UpdateUserRole(userRepository)
export const makeListBirthdays = () => new ListBirthdays(userRepository)

export const makeListUnavailableByUser = () => new ListUnavailableByUser(unavailableRepository)
export const makeToggleUnavailableDate = () => new ToggleUnavailableDate(unavailableRepository)
