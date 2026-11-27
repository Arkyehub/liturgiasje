import { act, renderHook } from "@testing-library/react"
import { usePlannerSettings } from "./usePlannerSettings"
import { DEFAULT_LAMP_RULES, SettingsError } from "@/domain/models/PlannerSettings"

const mockGet = jest.fn()
const mockSave = jest.fn()
jest.mock("@/main/factories/usecases/plannerSettings", () => ({
  makeGetPlannerSettings: () => ({ execute: (...a: unknown[]) => mockGet(...a) }),
  makeSavePlannerSettings: () => ({ execute: (...a: unknown[]) => mockSave(...a) }),
}))
const mockToast = { warning: jest.fn() }
jest.mock("sonner", () => ({ toast: { warning: (...a: unknown[]) => mockToast.warning(...a) } }))

const custom = {
  standardMasses: [{ weekday: 2, time: "19:00", roles: ["C", "L"] as const }].map((m) => ({ ...m, roles: [...m.roles] })),
  lampRules: { ...DEFAULT_LAMP_RULES, balance: false },
  hasCustom: true,
}
const settle = () => act(async () => {})

beforeEach(() => jest.clearAllMocks())

test("começa carregando e expõe as configurações lidas", async () => {
  mockGet.mockResolvedValue(custom)
  const { result } = renderHook(() => usePlannerSettings())
  expect(result.current.status).toBe("loading")
  expect(result.current.standardMasses).toEqual([])
  await settle()
  expect(result.current.status).toBe("ready")
  expect(result.current.standardMasses).toEqual(custom.standardMasses)
  expect(result.current.lampRules.balance).toBe(false)
  expect(result.current.hasCustom).toBe(true)
  expect(mockGet).toHaveBeenCalledTimes(1)
})

test("função ausente no banco: padrões em silêncio, sem aviso", async () => {
  mockGet.mockRejectedValue(new SettingsError("unavailable"))
  const { result } = renderHook(() => usePlannerSettings())
  await settle()
  expect(result.current.status).toBe("unavailable")
  expect(result.current.standardMasses).toEqual([])
  expect(result.current.lampRules).toEqual(DEFAULT_LAMP_RULES)
  expect(result.current.error).toBeNull()
  expect(mockToast.warning).not.toHaveBeenCalled()
})

test("falha de leitura: padrões, mensagem e aviso na tela; reload tenta de novo", async () => {
  mockGet.mockRejectedValueOnce(new SettingsError("unknown")).mockResolvedValueOnce(custom)
  const { result } = renderHook(() => usePlannerSettings())
  await settle()
  expect(result.current.status).toBe("error")
  expect(result.current.error).toMatch(/Tente novamente/)
  expect(mockToast.warning).toHaveBeenCalledWith("Não foi possível ler suas regras; usando as regras padrão.")
  expect(result.current.lampRules).toEqual(DEFAULT_LAMP_RULES)
  act(() => result.current.reload())
  await settle()
  expect(result.current.status).toBe("ready")
  expect(result.current.error).toBeNull()
  expect(result.current.standardMasses).toEqual(custom.standardMasses)
})

test("save com sucesso devolve true e atualiza o estado", async () => {
  mockGet.mockResolvedValue({ standardMasses: [], lampRules: DEFAULT_LAMP_RULES, hasCustom: false })
  mockSave.mockResolvedValue(custom)
  const { result } = renderHook(() => usePlannerSettings())
  await settle()
  let ok = false
  await act(async () => {
    ok = await result.current.save(custom.standardMasses, custom.lampRules)
  })
  expect(ok).toBe(true)
  expect(mockSave).toHaveBeenCalledWith(custom.standardMasses, custom.lampRules)
  expect(result.current.standardMasses).toEqual(custom.standardMasses)
  expect(result.current.hasCustom).toBe(true)
})

test("save com erro devolve false, guarda a mensagem e mantém o que já estava", async () => {
  mockGet.mockResolvedValue(custom)
  mockSave.mockRejectedValue(new SettingsError("invalid_settings"))
  const { result } = renderHook(() => usePlannerSettings())
  await settle()
  let ok = true
  await act(async () => {
    ok = await result.current.save([], DEFAULT_LAMP_RULES)
  })
  expect(ok).toBe(false)
  expect(result.current.error).toMatch(/inválido/)
  expect(result.current.standardMasses).toEqual(custom.standardMasses)
  expect(result.current.status).toBe("ready")
})

test("uma leitura antiga que chega depois de uma gravação não sobrescreve os valores novos", async () => {
  let resolveStale: (v: unknown) => void = () => {}
  mockGet
    .mockResolvedValueOnce({ standardMasses: [], lampRules: DEFAULT_LAMP_RULES, hasCustom: false })
    .mockReturnValueOnce(new Promise((resolve) => { resolveStale = resolve }))
  const { result } = renderHook(() => usePlannerSettings())
  await settle()
  act(() => result.current.reload()) // leitura em andamento
  mockSave.mockResolvedValue(custom)
  await act(async () => {
    await result.current.save(custom.standardMasses, custom.lampRules)
  })
  expect(result.current.standardMasses).toEqual(custom.standardMasses)
  await act(async () => {
    resolveStale({ standardMasses: [], lampRules: DEFAULT_LAMP_RULES, hasCustom: false }) // dado de antes da gravação
  })
  expect(result.current.standardMasses).toEqual(custom.standardMasses)
  expect(result.current.status).toBe("ready")
})
