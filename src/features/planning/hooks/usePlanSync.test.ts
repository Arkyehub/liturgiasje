import { act, renderHook } from "@testing-library/react"
import { usePlanSync } from "./usePlanSync"
import { PlanError } from "@/domain/models/SchedulePlan"
import type { PlanDocument, PlanOpenResult } from "@/domain/models/SchedulePlan"

const mockUc = {
  open: jest.fn(),
  get: jest.fn(),
  save: jest.fn(),
  reopen: jest.fn(),
}

jest.mock("@/main/factories/usecases/plans", () => ({
  makeOpenPlan: () => ({ execute: (...a: unknown[]) => mockUc.open(...a) }),
  makeGetPlan: () => ({ execute: (...a: unknown[]) => mockUc.get(...a) }),
  makeSavePlan: () => ({ execute: (...a: unknown[]) => mockUc.save(...a) }),
  makeReopenPlan: () => ({ execute: (...a: unknown[]) => mockUc.reopen(...a) }),
}))

const SESSION_KEY = "planejamento:session"

const plan = (revision = 1, extra: Partial<PlanDocument> = {}): PlanDocument => ({
  id: "plan-1",
  monthReference: "2026-12",
  ownerProfileId: "owner-1",
  ownerName: "Coordenador Teste",
  isMine: true,
  status: "em_andamento",
  createdAt: "2026-11-01T00:00:00Z",
  updatedAt: "2026-11-01T00:00:00Z",
  expiresAt: "2027-01-01T00:00:00Z",
  copiedFromName: null,
  concludedAt: null,
  hasContent: true, ownerHasSettings: false,
  revision,
  state: { masses: [] },
  ...extra,
})

const opened = (mode: PlanOpenResult["mode"], revision = 1): PlanOpenResult => ({
  mode,
  plan: plan(revision),
})

const MINE = { kind: "mine", month: "2026-12" } as const
const OTHER = { kind: "other", planId: "plan-1" } as const

const tick = async (ms: number) => {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms)
  })
}
const flush = () => tick(0)

const deferred = <T,>() => {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const mountEdit = async (revision = 1) => {
  mockUc.open.mockResolvedValue(opened("edit", revision))
  const hook = renderHook(() => usePlanSync(MINE))
  await flush()
  expect(hook.result.current.mode).toBe("edit")
  return hook
}

beforeEach(() => {
  jest.useFakeTimers()
  jest.clearAllMocks()
  window.sessionStorage.clear()
  mockUc.get.mockResolvedValue(plan(1))
})

afterEach(() => {
  jest.useRealTimers()
  jest.restoreAllMocks()
})

describe("usePlanSync - abertura", () => {
  it("target null fica idle e não chama nada", async () => {
    const { result } = renderHook(() => usePlanSync(null))
    await tick(60000)
    expect(result.current.mode).toBe("idle")
    expect(result.current.plan).toBeNull()
    Object.values(mockUc).forEach(fn => expect(fn).not.toHaveBeenCalled())
  })

  it("já ocioso (sem plano aberto) expõe um session_id não vazio para a lista de planejamentos", async () => {
    const { result } = renderHook(() => usePlanSync(null))
    await tick(0)
    expect(result.current.mode).toBe("idle")
    expect(result.current.sessionId).not.toBe("")
  })

  it.each(["edit", "concluded"] as const)("mine abre com o session_id e expõe %s", async mode => {
    mockUc.open.mockResolvedValue(opened(mode, 4))
    const { result } = renderHook(() => usePlanSync(MINE))
    expect(result.current.mode).toBe("loading")
    await flush()
    expect(mockUc.open).toHaveBeenCalledTimes(1)
    expect(mockUc.open).toHaveBeenCalledWith("2026-12", result.current.sessionId)
    expect(result.current.sessionId).toMatch(/\S+/)
    expect(result.current.mode).toBe(mode)
    expect(result.current.plan?.revision).toBe(4)
  })

  it("reutiliza o session_id da aba (sessionStorage) em um novo hook", async () => {
    mockUc.open.mockResolvedValue(opened("edit"))
    const first = renderHook(() => usePlanSync(MINE))
    await flush()
    const id = first.result.current.sessionId
    expect(window.sessionStorage.getItem(SESSION_KEY)).toBe(id)
    first.unmount()
    const second = renderHook(() => usePlanSync(MINE))
    await flush()
    expect(second.result.current.sessionId).toBe(id)
    expect(mockUc.open).toHaveBeenLastCalledWith("2026-12", id)
  })

  it("usa um id em memória quando o sessionStorage lança", async () => {
    jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked")
    })
    jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked")
    })
    mockUc.open.mockResolvedValue(opened("edit"))
    const { result } = renderHook(() => usePlanSync(MINE))
    await flush()
    expect(result.current.sessionId).toMatch(/\S+/)
    expect(result.current.mode).toBe("edit")
    const second = renderHook(() => usePlanSync(MINE))
    await flush()
    expect(second.result.current.sessionId).toBe(result.current.sessionId)
    expect(mockUc.open.mock.calls.every(c => c[1] === result.current.sessionId)).toBe(true)
  })

  it("unavailable na abertura vai para unavailable e não repete", async () => {
    mockUc.open.mockRejectedValue(new PlanError("unavailable"))
    const { result } = renderHook(() => usePlanSync(MINE))
    await tick(120000)
    expect(result.current.mode).toBe("unavailable")
    expect(mockUc.open).toHaveBeenCalledTimes(1)
  })

  it("outro erro na abertura vai para error com mensagem", async () => {
    mockUc.open.mockRejectedValue(new PlanError("forbidden"))
    const { result } = renderHook(() => usePlanSync(MINE))
    await flush()
    expect(result.current.mode).toBe("error")
    expect(result.current.error).toMatch(/permissão/)
  })

  it("kind other usa GetPlan e fica readonly", async () => {
    mockUc.get.mockResolvedValue(plan(3, { isMine: false }))
    const { result } = renderHook(() => usePlanSync(OTHER))
    await flush()
    expect(mockUc.open).not.toHaveBeenCalled()
    expect(mockUc.get).toHaveBeenCalledWith("plan-1")
    expect(result.current.mode).toBe("readonly")
    expect(result.current.plan?.revision).toBe(3)
  })
})


describe("usePlanSync - gravação", () => {
  it("save envia request_id novo e a revisão atual; depois usa a devolvida", async () => {
    const { result } = await mountEdit(5)
    mockUc.save.mockResolvedValueOnce(6).mockResolvedValueOnce(7)
    act(() => result.current.save({ v: 1 }))
    await flush()
    act(() => result.current.save({ v: 2 }))
    await flush()
    expect(mockUc.save).toHaveBeenCalledTimes(2)
    const [a, b] = mockUc.save.mock.calls
    expect(a.slice(0, 2)).toEqual(["plan-1", result.current.sessionId])
    expect(a[3]).toBe(5)
    expect(a[4]).toEqual({ v: 1 })
    expect(b[3]).toBe(6)
    expect(b[4]).toEqual({ v: 2 })
    expect(a[2]).toEqual(expect.any(String))
    expect(b[2]).not.toBe(a[2])
  })

  it("status vai de saving para saved", async () => {
    const { result } = await mountEdit()
    const d = deferred<number>()
    mockUc.save.mockReturnValue(d.promise)
    expect(result.current.status).toBe("idle")
    act(() => result.current.save({ v: 1 }))
    expect(result.current.status).toBe("saving")
    await act(async () => {
      d.resolve(2)
    })
    await flush()
    expect(result.current.status).toBe("saved")
  })

  it("fila de uma por vez e só a última pendente é enviada, em ordem", async () => {
    const { result } = await mountEdit(1)
    let running = 0
    let maxRunning = 0
    const first = deferred<number>()
    mockUc.save.mockImplementation(async (...args: unknown[]) => {
      running++
      maxRunning = Math.max(maxRunning, running)
      try {
        if (args[4] && (args[4] as { v: number }).v === 1) return await first.promise
        return 3
      } finally {
        running--
      }
    })
    act(() => {
      result.current.save({ v: 1 })
      result.current.save({ v: 2 })
      result.current.save({ v: 3 })
      result.current.save({ v: 4 })
    })
    await flush()
    expect(mockUc.save).toHaveBeenCalledTimes(1)
    expect(mockUc.save.mock.calls[0][4]).toEqual({ v: 1 })
    await act(async () => {
      first.resolve(2)
    })
    await flush()
    expect(mockUc.save).toHaveBeenCalledTimes(2)
    expect(mockUc.save.mock.calls[1][4]).toEqual({ v: 4 })
    expect(mockUc.save.mock.calls[1][3]).toBe(2)
    expect(maxRunning).toBe(1)
    expect(result.current.status).toBe("saved")
  })

  it("save fora de edit é ignorado", async () => {
    mockUc.open.mockResolvedValue(opened("readonly"))
    const { result } = renderHook(() => usePlanSync(MINE))
    await flush()
    act(() => result.current.save({ v: 1 }))
    await flush()
    expect(mockUc.save).not.toHaveBeenCalled()
  })

  it("falha de rede repete 3 vezes (2 s, 5 s, 5 s) com o MESMO request_id e então failed", async () => {
    const { result } = await mountEdit(1)
    mockUc.save.mockRejectedValue(new Error("rede"))
    act(() => result.current.save({ v: 1 }))
    await flush()
    expect(mockUc.save).toHaveBeenCalledTimes(1)
    await tick(1999)
    expect(mockUc.save).toHaveBeenCalledTimes(1)
    await tick(1)
    expect(mockUc.save).toHaveBeenCalledTimes(2)
    await tick(4999)
    expect(mockUc.save).toHaveBeenCalledTimes(2)
    await tick(1)
    expect(mockUc.save).toHaveBeenCalledTimes(3)
    expect(result.current.status).toBe("saving")
    await tick(5000)
    expect(mockUc.save).toHaveBeenCalledTimes(4)
    expect(result.current.status).toBe("failed")
    await tick(60000)
    expect(mockUc.save).toHaveBeenCalledTimes(4)
    const ids = new Set(mockUc.save.mock.calls.map(c => c[2]))
    expect(ids.size).toBe(1)
    expect(mockUc.save.mock.calls.every(c => c[3] === 1)).toBe(true)
    expect(result.current.mode).toBe("edit")
  })

  it("em failed novos save são ignorados até retrySave, que reenvia com o mesmo request_id", async () => {
    const { result } = await mountEdit(1)
    mockUc.save.mockRejectedValue(new Error("rede"))
    act(() => result.current.save({ v: 1 }))
    await flush()
    await tick(2000 + 5000 + 5000)
    expect(result.current.status).toBe("failed")
    const failedId = mockUc.save.mock.calls[0][2]
    const before = mockUc.save.mock.calls.length

    act(() => result.current.save({ v: 2 }))
    await tick(60000)
    expect(mockUc.save).toHaveBeenCalledTimes(before)

    mockUc.save.mockReset()
    mockUc.save.mockResolvedValue(2)
    act(() => result.current.retrySave())
    await flush()
    expect(mockUc.save).toHaveBeenCalledTimes(1)
    expect(mockUc.save.mock.calls[0][2]).toBe(failedId)
    expect(mockUc.save.mock.calls[0][4]).toEqual({ v: 1 })
    expect(result.current.status).toBe("saved")
    act(() => result.current.save({ v: 3 }))
    await flush()
    expect(mockUc.save.mock.calls[1][4]).toEqual({ v: 3 })
    expect(mockUc.save.mock.calls[1][3]).toBe(2)
  })

  it("sucesso após uma repetição vira saved", async () => {
    const { result } = await mountEdit(1)
    mockUc.save.mockRejectedValueOnce(new Error("rede")).mockResolvedValueOnce(2)
    act(() => result.current.save({ v: 1 }))
    await flush()
    await tick(2000)
    expect(result.current.status).toBe("saved")
    expect(mockUc.save).toHaveBeenCalledTimes(2)
  })

  it("plan_too_large falha sem repetir", async () => {
    const { result } = await mountEdit(1)
    mockUc.save.mockRejectedValue(new PlanError("plan_too_large"))
    act(() => result.current.save({ v: 1 }))
    await tick(60000)
    expect(mockUc.save).toHaveBeenCalledTimes(1)
    expect(result.current.status).toBe("failed")
    expect(result.current.mode).toBe("edit")
  })
})


describe("usePlanSync - conflito de revisão (outro aparelho gravou antes)", () => {
  it("adota o documento do servidor, continua em edit, conta as edições perdidas e não repete", async () => {
    const { result } = await mountEdit(1)
    mockUc.save.mockRejectedValue(new PlanError("plan_revision_conflict"))
    mockUc.get.mockResolvedValue(plan(5, { state: { masses: ["remoto"] } }))
    act(() => result.current.save({ v: 1 }))
    await tick(60000)
    expect(mockUc.get).toHaveBeenCalledWith("plan-1")
    expect(mockUc.save).toHaveBeenCalledTimes(1)
    expect(result.current.mode).toBe("edit")
    expect(result.current.plan?.revision).toBe(5)
    expect(result.current.plan?.state).toEqual({ masses: ["remoto"] })
    expect(result.current.status).toBe("idle")
    expect(result.current.externalChange).toMatchObject({ concluded: false, lost: 1 })
  })

  it("depois do conflito a próxima gravação usa a revisão do servidor", async () => {
    const { result } = await mountEdit(1)
    mockUc.save.mockRejectedValueOnce(new PlanError("plan_revision_conflict")).mockResolvedValue(6)
    mockUc.get.mockResolvedValue(plan(5))
    act(() => result.current.save({ v: 1 }))
    await flush()
    act(() => result.current.save({ v: 2 }))
    await flush()
    expect(mockUc.save).toHaveBeenCalledTimes(2)
    expect(mockUc.save.mock.calls[1][3]).toBe(5)
    expect(result.current.status).toBe("saved")
  })

  it("edições feitas enquanto relê o servidor são descartadas (o documento do servidor vence)", async () => {
    const { result } = await mountEdit(1)
    const slow = deferred<PlanDocument>()
    mockUc.save.mockRejectedValue(new PlanError("plan_revision_conflict"))
    mockUc.get.mockReturnValue(slow.promise)
    act(() => result.current.save({ v: 1 }))
    await flush()
    act(() => result.current.save({ v: 2 }))
    await act(async () => {
      slow.resolve(plan(5))
    })
    await tick(60000)
    expect(mockUc.save).toHaveBeenCalledTimes(1)
    expect(result.current.plan?.revision).toBe(5)
  })

  it("plan_expired e plan_not_found vão para error sem repetir", async () => {
    for (const code of ["plan_expired", "plan_not_found"] as const) {
      const { result } = await mountEdit(1)
      mockUc.save.mockReset()
      mockUc.save.mockRejectedValue(new PlanError(code))
      act(() => result.current.save({ v: 1 }))
      await tick(60000)
      expect(result.current.mode).toBe("error")
      expect(result.current.error).toBeTruthy()
      expect(mockUc.save).toHaveBeenCalledTimes(1)
    }
  })

  it("plan_concluded na gravação vai a concluded e recarrega", async () => {
    const { result } = await mountEdit(1)
    mockUc.save.mockRejectedValue(new PlanError("plan_concluded"))
    mockUc.get.mockResolvedValue(plan(7, { status: "concluido" }))
    act(() => result.current.save({ v: 1 }))
    await tick(60000)
    expect(result.current.mode).toBe("concluded")
    expect(result.current.plan?.revision).toBe(7)
    expect(mockUc.save).toHaveBeenCalledTimes(1)
    expect(result.current.externalChange).toMatchObject({ concluded: true, lost: 1 })
  })
})

describe("usePlanSync - checagem de mudanças de outro aparelho (30 s e foco)", () => {
  it("em edit, sem gravação pendente, aplica a versão mais nova e avisa", async () => {
    const { result } = await mountEdit(1)
    expect(result.current.externalChange).toBeNull()
    mockUc.get.mockResolvedValue(plan(4, { state: { masses: ["outro"] } }))
    await tick(29000)
    expect(mockUc.get).not.toHaveBeenCalled()
    await tick(1000)
    expect(mockUc.get).toHaveBeenCalledWith("plan-1")
    expect(result.current.mode).toBe("edit")
    expect(result.current.plan?.revision).toBe(4)
    expect(result.current.externalChange).toMatchObject({ concluded: false, lost: 0 })
    mockUc.save.mockResolvedValue(5)
    act(() => result.current.save({ v: 1 }))
    await flush()
    expect(mockUc.save.mock.calls[0][3]).toBe(4)
  })

  it("mesma revisão (incluindo as gravações desta aba): não troca o documento nem avisa", async () => {
    const { result } = await mountEdit(1)
    mockUc.save.mockResolvedValue(2)
    act(() => result.current.save({ v: 1 }))
    await flush()
    const before = result.current.plan
    mockUc.get.mockResolvedValue(plan(2))
    await tick(30000)
    expect(mockUc.get).toHaveBeenCalledTimes(1)
    expect(result.current.plan).toBe(before)
    expect(result.current.externalChange).toBeNull()
  })

  it("não checa com gravação pendente ou falha: o conflito de revisão resolve na gravação", async () => {
    const { result } = await mountEdit(1)
    const slow = deferred<number>()
    mockUc.save.mockReturnValue(slow.promise)
    act(() => result.current.save({ v: 1 }))
    await flush()
    await tick(90000)
    expect(mockUc.get).not.toHaveBeenCalled()
    await act(async () => {
      slow.resolve(2)
    })
    await flush()
    await tick(30000)
    expect(mockUc.get).toHaveBeenCalledTimes(1)
  })

  it("com a aba oculta não checa; ao voltar a ficar visível checa de imediato", async () => {
    await mountEdit(1)
    const state = jest.spyOn(document, "visibilityState", "get").mockReturnValue("hidden")
    await tick(120000)
    expect(mockUc.get).not.toHaveBeenCalled()
    state.mockReturnValue("visible")
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"))
    })
    await flush()
    expect(mockUc.get).toHaveBeenCalledTimes(1)
  })

  it("outro aparelho concluiu o planejamento: passa a concluded e avisa", async () => {
    const { result } = await mountEdit(1)
    mockUc.get.mockResolvedValue(plan(3, { status: "concluido", concludedAt: "2026-11-26T12:00:00Z" }))
    await tick(30000)
    expect(result.current.mode).toBe("concluded")
    expect(result.current.plan?.status).toBe("concluido")
    expect(result.current.externalChange).toMatchObject({ concluded: true, lost: 0 })
  })

  it("não dispara outra leitura enquanto uma está em andamento", async () => {
    await mountEdit(1)
    const slow = deferred<PlanDocument>()
    mockUc.get.mockReturnValue(slow.promise)
    await tick(30000)
    await tick(60000)
    expect(mockUc.get).toHaveBeenCalledTimes(1)
  })

  it("falha na leitura periódica mantém o plano e continua tentando", async () => {
    const { result } = await mountEdit(1)
    mockUc.get.mockRejectedValue(new Error("rede"))
    await tick(30000)
    await tick(30000)
    expect(mockUc.get).toHaveBeenCalledTimes(2)
    expect(result.current.mode).toBe("edit")
    expect(result.current.plan?.revision).toBe(1)
  })

  it("kind other: readonly, atualiza o plano quando a revisão muda", async () => {
    mockUc.get.mockResolvedValue(plan(3, { isMine: false }))
    const { result } = renderHook(() => usePlanSync(OTHER))
    await flush()
    mockUc.get.mockClear()
    mockUc.get.mockResolvedValue(plan(3, { isMine: false }))
    await tick(30000)
    expect(result.current.plan?.revision).toBe(3)
    mockUc.get.mockResolvedValue(plan(4, { isMine: false }))
    await tick(30000)
    expect(result.current.plan?.revision).toBe(4)
    expect(result.current.mode).toBe("readonly")
  })

  it("concluded acompanha por polling a revisão do documento", async () => {
    mockUc.open.mockResolvedValue(opened("concluded", 2))
    const { result } = renderHook(() => usePlanSync(MINE))
    await flush()
    mockUc.get.mockResolvedValue(plan(6, { status: "concluido" }))
    await tick(30000)
    expect(result.current.plan?.revision).toBe(6)
    expect(result.current.mode).toBe("concluded")
  })
})

describe("usePlanSync - desmonte (envio final sem reserva)", () => {
  it("desmonte durante a espera de repetição faz uma tentativa (mesmo request_id) e mata a fila", async () => {
    const { result, unmount } = await mountEdit(1)
    mockUc.save.mockRejectedValue(new Error("rede"))
    act(() => result.current.save({ v: 1 }))
    await flush()
    unmount()
    await flush()
    expect(mockUc.save).toHaveBeenCalledTimes(2)
    expect(mockUc.save.mock.calls[1][2]).toBe(mockUc.save.mock.calls[0][2])
    await tick(120000)
    expect(mockUc.save).toHaveBeenCalledTimes(2)
  })

  it("desmonte com gravação em andamento envia o pendente uma vez", async () => {
    const { result, unmount } = await mountEdit(1)
    const first = deferred<number>()
    mockUc.save.mockReturnValueOnce(first.promise).mockResolvedValue(3)
    act(() => result.current.save({ v: 1 }))
    await flush()
    act(() => result.current.save({ v: 2 }))
    unmount()
    await act(async () => {
      first.resolve(2)
    })
    await flush()
    expect(mockUc.save).toHaveBeenCalledTimes(2)
    expect(mockUc.save.mock.calls[1][4]).toEqual({ v: 2 })
    await tick(120000)
    expect(mockUc.save).toHaveBeenCalledTimes(2)
  })

  it("erro do envio final é engolido, sem rejeição não tratada", async () => {
    const { result, unmount } = await mountEdit()
    const unhandled = jest.fn()
    process.on("unhandledRejection", unhandled)
    mockUc.save.mockRejectedValue(new Error("rede"))
    act(() => result.current.save({ v: 1 }))
    await flush()
    expect(() => unmount()).not.toThrow()
    await flush()
    jest.useRealTimers()
    await new Promise(r => window.setTimeout(r, 0))
    process.off("unhandledRejection", unhandled)
    expect(unhandled).not.toHaveBeenCalled()
  })

  it("o desmonte limpa timers e o listener de visibilidade", async () => {
    const { unmount } = await mountEdit(1)
    expect(jest.getTimerCount()).toBeGreaterThan(0)
    unmount()
    expect(jest.getTimerCount()).toBe(0)
    jest.spyOn(document, "visibilityState", "get").mockReturnValue("visible")
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"))
    })
    await tick(120000)
    expect(mockUc.get).not.toHaveBeenCalled()
  })
})

describe("usePlanSync - reopen", () => {
  it("reopen em concluded chama ReopenPlan e passa a edit", async () => {
    mockUc.open.mockResolvedValue(opened("concluded", 2))
    mockUc.reopen.mockResolvedValue(opened("edit", 3))
    const { result } = renderHook(() => usePlanSync(MINE))
    await flush()
    expect(result.current.mode).toBe("concluded")
    await act(async () => {
      await result.current.reopen()
    })
    expect(mockUc.reopen).toHaveBeenCalledWith("plan-1", result.current.sessionId)
    expect(result.current.mode).toBe("edit")
    expect(result.current.plan?.revision).toBe(3)
    mockUc.save.mockResolvedValue(4)
    act(() => result.current.save({ v: 1 }))
    await flush()
    expect(mockUc.save.mock.calls[0][3]).toBe(3)
  })

  it("falha ao reabrir guarda a mensagem e mantém concluded", async () => {
    mockUc.open.mockResolvedValue(opened("concluded", 2))
    mockUc.reopen.mockRejectedValue(new PlanError("forbidden"))
    const { result } = renderHook(() => usePlanSync(MINE))
    await flush()
    await act(async () => {
      await result.current.reopen()
    })
    expect(result.current.mode).toBe("concluded")
    expect(result.current.error).toMatch(/permissão/)
  })

  it("reopen em kind other não faz nada", async () => {
    mockUc.get.mockResolvedValue(plan(3, { isMine: false }))
    const { result } = renderHook(() => usePlanSync(OTHER))
    await flush()
    await act(async () => {
      await result.current.reopen()
    })
    expect(mockUc.reopen).not.toHaveBeenCalled()
    expect(mockUc.open).not.toHaveBeenCalled()
    expect(result.current.mode).toBe("readonly")
  })
})

describe("usePlanSync - troca de alvo", () => {
  type Props = { t: Parameters<typeof usePlanSync>[0] }

  it("mine -> other -> null: zera o estado e não vaza o plano antigo", async () => {
    mockUc.open.mockResolvedValue(opened("edit", 1))
    mockUc.get.mockResolvedValue(plan(9, { id: "plan-2", isMine: false }))
    const { result, rerender } = renderHook(({ t }: Props) => usePlanSync(t), { initialProps: { t: MINE } as Props })
    await flush()
    expect(result.current.plan?.id).toBe("plan-1")
    mockUc.save.mockResolvedValue(2)
    act(() => result.current.save({ v: 1 }))
    await flush()
    expect(result.current.status).toBe("saved")

    rerender({ t: { kind: "other", planId: "plan-2" } })
    expect(result.current.plan).toBeNull()
    expect(result.current.status).toBe("idle")
    expect(result.current.mode).toBe("loading")
    await flush()
    expect(result.current.mode).toBe("readonly")
    expect(result.current.plan?.id).toBe("plan-2")

    rerender({ t: null })
    expect(result.current.mode).toBe("idle")
    expect(result.current.plan).toBeNull()
    await tick(120000)
    expect(mockUc.get).toHaveBeenCalledTimes(1)
  })

  it("resultado de abertura de um alvo antigo é ignorado", async () => {
    const slow = deferred<PlanOpenResult>()
    mockUc.open.mockReturnValue(slow.promise)
    mockUc.get.mockResolvedValue(plan(9, { id: "plan-2", isMine: false }))
    const { result, rerender } = renderHook(({ t }: Props) => usePlanSync(t), { initialProps: { t: MINE } as Props })
    await flush()
    rerender({ t: { kind: "other", planId: "plan-2" } })
    await flush()
    await act(async () => {
      slow.resolve(opened("edit", 1))
    })
    await flush()
    expect(result.current.mode).toBe("readonly")
    expect(result.current.plan?.id).toBe("plan-2")
  })
})

describe("usePlanSync - markConcluded", () => {
  it("vira concluded, relê o documento e não envia mais nada", async () => {
    const { result, unmount } = await mountEdit(1)
    mockUc.get.mockResolvedValue(plan(5, { status: "concluido", concludedAt: "2026-11-26T12:00:00Z" }))
    await act(async () => {
      await result.current.markConcluded()
    })
    expect(mockUc.get).toHaveBeenCalledWith("plan-1")
    expect(result.current.mode).toBe("concluded")
    expect(result.current.plan?.revision).toBe(5)
    expect(result.current.plan?.status).toBe("concluido")
    expect(result.current.status).toBe("idle")

    act(() => result.current.save({ v: 1 }))
    await tick(120000)
    expect(mockUc.save).not.toHaveBeenCalled()
    unmount()
    await flush()
    expect(mockUc.save).not.toHaveBeenCalled()
  })

  it("mata a fila: gravação pendente não é enviada depois", async () => {
    const { result } = await mountEdit(1)
    const slow = deferred<number>()
    mockUc.save.mockReturnValue(slow.promise)
    act(() => result.current.save({ v: 1 }))
    await flush()
    act(() => result.current.save({ v: 2 }))
    await act(async () => {
      await result.current.markConcluded()
    })
    await act(async () => {
      slow.resolve(2)
    })
    await tick(60000)
    expect(mockUc.save).toHaveBeenCalledTimes(1)
    expect(result.current.mode).toBe("concluded")
    expect(result.current.status).toBe("idle")
  })

  it("falha ao reler ainda conclui, mantendo o documento anterior", async () => {
    const { result } = await mountEdit(1)
    mockUc.get.mockRejectedValue(new Error("rede"))
    await act(async () => {
      await result.current.markConcluded()
    })
    expect(result.current.mode).toBe("concluded")
    expect(result.current.plan?.revision).toBe(1)
  })

  it("fora do modo edit não faz nada", async () => {
    mockUc.get.mockResolvedValue(plan(9, { id: "plan-1", isMine: false }))
    const { result } = renderHook(() => usePlanSync(OTHER))
    await flush()
    mockUc.get.mockClear()
    await act(async () => {
      await result.current.markConcluded()
    })
    expect(mockUc.get).not.toHaveBeenCalled()
    expect(result.current.mode).toBe("readonly")
  })
})
