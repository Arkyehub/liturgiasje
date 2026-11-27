import { GetPlannerSettings, SavePlannerSettings } from "."
import { PlannerSettingsRepository } from "@/domain/repositories/PlannerSettingsRepository"
import { DEFAULT_LAMP_RULES } from "@/domain/models/PlannerSettings"

const repo = { get: jest.fn(), save: jest.fn() }
const repository = repo as unknown as PlannerSettingsRepository
beforeEach(() => jest.clearAllMocks())

test("GetPlannerSettings delega ao repositório", async () => {
  repo.get.mockResolvedValue("r")
  expect(await new GetPlannerSettings(repository).execute()).toBe("r")
})

test("SavePlannerSettings delega com os dois argumentos", async () => {
  repo.save.mockResolvedValue("r")
  const masses = [{ weekday: 0, time: "09:00", roles: ["C" as const] }]
  expect(await new SavePlannerSettings(repository).execute(masses, DEFAULT_LAMP_RULES)).toBe("r")
  expect(repo.save).toHaveBeenCalledWith(masses, DEFAULT_LAMP_RULES)
})
