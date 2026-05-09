import { 
  GetProfileById, 
  GetProfileByAuthId, 
  ListProfiles, 
  SearchProfiles, 
  CreateProfile, 
  UpdateProfile, 
  DeleteProfile, 
  ClaimProfile, 
  UploadAvatar, 
  ListBirthdays 
} from "@/domain/usecases/profiles"
import { 
  ListUnavailableByProfile, 
  ToggleUnavailableDate, 
  ListUnavailableByDate 
} from "@/domain/usecases/profiles/unavailable"
import { SupabaseProfileRepository } from "@/data/repositories/SupabaseProfileRepository"
import { SupabaseUnavailableRepository } from "@/data/repositories/SupabaseUnavailableRepository"

const profileRepository = new SupabaseProfileRepository()
const unavailableRepository = new SupabaseUnavailableRepository()

export const makeGetProfileById = () => new GetProfileById(profileRepository)
export const makeGetProfileByAuthId = () => new GetProfileByAuthId(profileRepository)
export const makeListProfiles = () => new ListProfiles(profileRepository)
export const makeSearchProfiles = () => new SearchProfiles(profileRepository)
export const makeCreateProfile = () => new CreateProfile(profileRepository)
export const makeUpdateProfile = () => new UpdateProfile(profileRepository)
export const makeDeleteProfile = () => new DeleteProfile(profileRepository)
export const makeClaimProfile = () => new ClaimProfile(profileRepository)
export const makeUploadAvatar = () => new UploadAvatar(profileRepository)
export const makeListBirthdays = () => new ListBirthdays(profileRepository)

export const makeListUnavailableByProfile = () => new ListUnavailableByProfile(unavailableRepository)
export const makeToggleUnavailableDate = () => new ToggleUnavailableDate(unavailableRepository)
export const makeListUnavailableByDate = () => new ListUnavailableByDate(unavailableRepository)
