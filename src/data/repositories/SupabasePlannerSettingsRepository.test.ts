import { SupabasePlannerSettingsRepository } from "./SupabasePlannerSettingsRepository"
import { DEFAULT_LAMP_RULES, SettingsError } from "@/domain/models/PlannerSettings"
import { supabase } from "@/shared/api/supabase"
jest.mock("@/shared/api/supabase", () => ({ supabase: { rpc: jest.fn() } }))

const rpc = supabase.rpc as jest.Mock
const repo = new SupabasePlannerSettingsRepository()
beforeEach(() => jest.clearAllMocks())

test("get chama planner_settings_get e normaliza a resposta", async () => {
  rpc.mockResolvedValue({
    data: { standardMasses: [{ weekday: 2, time: "19:00", roles: ["C", "L"] }], lampRules: { balance: false }, hasCustom: true },
    error: null,
  })
  const s = await repo.get()
  expect(rpc).toHaveBeenCalledWith("planner_settings_get", {})
  expect(s.standardMasses).toEqual([{ weekday: 2, time: "19:00", roles: ["C", "L"] }])
  expect(s.lampRules).toEqual({ ...DEFAULT_LAMP_RULES, balance: false })
})

test("resposta nula vira o padrão", async () => {
  rpc.mockResolvedValue({ data: null, error: null })
  expect(await repo.get()).toEqual({ standardMasses: [], lampRules: DEFAULT_LAMP_RULES, hasCustom: false })
})

test("save envia p_standard_masses e p_lamp_rules", async () => {
  rpc.mockResolvedValue({ data: { standardMasses: [], lampRules: {}, hasCustom: false }, error: null })
  await repo.save([{ weekday: 0, time: "09:00", roles: ["C"] }], DEFAULT_LAMP_RULES)
  expect(rpc).toHaveBeenCalledWith("planner_settings_save", {
    p_standard_masses: [{ weekday: 0, time: "09:00", roles: ["C"] }],
    p_lamp_rules: DEFAULT_LAMP_RULES,
  })
})

test.each(["forbidden", "invalid_settings", "settings_too_large"])("mapeia o erro %s", async (code) => {
  rpc.mockResolvedValue({ data: null, error: { message: code, code: "P0001" } })
  const error = await repo.get().catch((e) => e)
  expect(error).toBeInstanceOf(SettingsError)
  expect(error.code).toBe(code)
})

test.each([
  [{ code: "PGRST202", message: "x" }],
  [{ message: "Could not find the function public.planner_settings_get" }],
  [{ code: "42883", message: "function public.planner_settings_save(jsonb, jsonb) does not exist" }],
])("função ausente vira unavailable", async (error) => {
  rpc.mockResolvedValue({ data: null, error })
  await expect(repo.get()).rejects.toMatchObject({ code: "unavailable" })
})

test("erro qualquer vira unknown", async () => {
  rpc.mockResolvedValue({ data: null, error: { message: "boom" } })
  await expect(repo.save([], DEFAULT_LAMP_RULES)).rejects.toMatchObject({ code: "unknown" })
})
