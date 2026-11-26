import { act, renderHook } from "@testing-library/react"
import { usePlanSync } from "./usePlanSync"
import { PlanError } from "@/domain/models/SchedulePlan"
import type { PlanDocument, PlanOpenResult } from "@/domain/models/SchedulePlan"

const mockUc = {
  open: jest.fn(),
  get: jest.fn(),
  save: jest.fn(),
  heartbeat: jest.fn(),
  release: jest.fn(),
  reopen: jest.fn(),
}

jest.mock("@/main/factories/usecases/plans", () => ({
  makeOpenPlan: () => ({ execute: (...a: unknown[]) => mockUc.open(...a) }),
  makeGetPlan: () => ({ execute: (...a: unknown[]) => mockUc.get(...a) }),
  makeSavePlan: () => ({ execute: (...a: unknown[]) => mockUc.save(...a) }),
  makeHeartbeatPlan: () => ({ execute: (...a: unknown[]) => mockUc.heartbeat(...a) }),
  makeReleasePlan: () => ({ execute: (...a: unknown[]) => mockUc.release(...a) }),
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
  openElsewhere: false,
  revision,
  state: { masses: [] },
  ...extra,
})

const opened = (mode: PlanOpenResult["mode"], revision = 1): PlanOpenResult => ({
  mode,
  holderLastSeen: mode === "readonly" ? "2026-11-26T10:00:00Z" : null,
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
  mockUc.release.mockResolvedValue(undefined)
  mockUc.heartbeat.mockResolvedValue(undefined)
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

  it.each(["edit", "readonly", "concluded"] as const)("mine abre com o session_id e expõe %s", async mode => {
    mockUc.open.mockResolvedValue(opened(mode, 4))
    const { result } = renderHook(() => usePlanSync(MINE))
    expect(result.current.mode).toBe("loading")
    await flush()
    expect(mockUc.open).toHaveBeenCalledTimes(1)
    expect(mockUc.open).toHaveBeenCalledWith("2026-12", result.current.sessionId)
    expect(result.current.sessionId).toMatch(/\S+/)
    expect(result.current.mode).toBe(mode)
    expect(result.current.plan?.revision).toBe(4)
    expect(result.current.holderLastSeen).toBe(mode === "readonly" ? "2026-11-26T10:00:00Z" : null)
  })

  it("reutiliza o session_id da aba (sessionStorage) em um novo hook", async () => {
    mockUc.open.mockResolvedValue(opened("readonly"))
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
    mockUc.open.mockResolvedValue(opened("readonly"))
    const { result } = renderHook(() => usePlanSync(MINE))
    await flush()
    expect(result.current.sessionId).toMatch(/\S+/)
    expect(result.current.mode).toBe("readonly")
    const second = renderHook(() => usePlanSync(MINE))
    await flush()
    expect(second.result.current.sessionId).toBe(result.current.sessionId)
    result.current.reopen()
    await flush()
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

describe("usePlanSync - heartbeat", () => {
  it("em edit bate a cada 30 s", async () => {
    const { result } = await mountEdit()
    expect(mockUc.heartbeat).not.toHaveBeenCalled()
    await tick(29999)
    expect(mockUc.heartbeat).not.toHaveBeenCalled()
    await tick(1)
    expect(mockUc.heartbeat).toHaveBeenCalledTimes(1)
    expect(mockUc.heartbeat).toHaveBeenCalledWith("plan-1", result.current.sessionId)
    await tick(30000)
    expect(mockUc.heartbeat).toHaveBeenCalledTimes(2)
  })

  it("não bate em readonly", async () => {
    mockUc.open.mockResolvedValue(opened("readonly"))
    renderHook(() => usePlanSync(MINE))
    await tick(120000)
    expect(mockUc.heartbeat).not.toHaveBeenCalled()
  })

  it("bate de imediato quando a aba volta a ficar visível", async () => {
    await mountEdit()
    jest.spyOn(document, "visibilityState", "get").mockReturnValue("visible")
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"))
    })
    expect(mockUc.heartbeat).toHaveBeenCalledTimes(1)
  })

  it("não bate ao ocultar a aba", async () => {
    await mountEdit()
    jest.spyOn(document, "visibilityState", "get").mockReturnValue("hidden")
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"))
    })
    expect(mockUc.heartbeat).not.toHaveBeenCalled()
  })

  it("plan_lock_lost no heartbeat vira readonly e o heartbeat para", async () => {
    const { result } = await mountEdit()
    mockUc.heartbeat.mockRejectedValue(new PlanError("plan_lock_lost"))
    await tick(30000)
    expect(result.current.mode).toBe("readonly")
    await tick(120000)
    expect(mockUc.heartbeat).toHaveBeenCalledTimes(1)
  })

  it("outros erros de heartbeat não derrubam a edição", async () => {
    const { result } = await mountEdit()
    mockUc.heartbeat.mockRejectedValue(new Error("rede"))
    await tick(60000)
    expect(result.current.mode).toBe("edit")
    expect(mockUc.heartbeat).toHaveBeenCalledTimes(2)
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

describe("usePlanSync - reserva perdida e conflitos", () => {
  it("plan_lock_lost: readonly, lostChanges conta os save não aplicados e nenhuma nova gravação", async () => {
    const { result } = await mountEdit(1)
    const first = deferred<number>()
    mockUc.save.mockReturnValue(first.promise)
    mockUc.get.mockResolvedValue(plan(9, { isMine: true }))
    act(() => {
      result.current.save({ v: 1 })
      result.current.save({ v: 2 })
      result.current.save({ v: 3 })
    })
    await flush()
    await act(async () => {
      first.reject(new PlanError("plan_lock_lost"))
    })
    await flush()
    expect(result.current.mode).toBe("readonly")
    expect(result.current.lostChanges).toBe(3)
    expect(mockUc.get).toHaveBeenCalledWith("plan-1")
    expect(result.current.plan?.revision).toBe(9)
    expect(mockUc.save).toHaveBeenCalledTimes(1)
    act(() => result.current.save({ v: 4 }))
    await tick(60000)
    expect(mockUc.save).toHaveBeenCalledTimes(1)
  })

  it("reserva perdida não chama ReleasePlan", async () => {
    const { result, unmount } = await mountEdit(1)
    mockUc.save.mockRejectedValue(new PlanError("plan_lock_lost"))
    act(() => result.current.save({ v: 1 }))
    await flush()
    unmount()
    expect(mockUc.release).not.toHaveBeenCalled()
  })

  it("nenhuma gravação durante a espera de repetição depois de perder a reserva", async () => {
    const { result } = await mountEdit(1)
    mockUc.save.mockRejectedValue(new Error("rede"))
    act(() => result.current.save({ v: 1 }))
    await flush()
    expect(mockUc.save).toHaveBeenCalledTimes(1)
    mockUc.heartbeat.mockRejectedValue(new PlanError("plan_lock_lost"))
    jest.spyOn(document, "visibilityState", "get").mockReturnValue("visible")
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"))
    })
    expect(result.current.mode).toBe("readonly")
    await tick(120000)
    expect(mockUc.save).toHaveBeenCalledTimes(1)
    expect(result.current.lostChanges).toBe(1)
  })

  it("plan_revision_conflict: recarrega com GetPlan, vai a readonly e não repete", async () => {
    const { result } = await mountEdit(1)
    mockUc.save.mockRejectedValue(new PlanError("plan_revision_conflict"))
    mockUc.get.mockResolvedValue(plan(8))
    act(() => result.current.save({ v: 1 }))
    await tick(60000)
    expect(mockUc.save).toHaveBeenCalledTimes(1)
    expect(mockUc.get).toHaveBeenCalledWith("plan-1")
    expect(result.current.mode).toBe("readonly")
    expect(result.current.plan?.revision).toBe(8)
    expect(result.current.lostChanges).toBe(1)
  })

  it("plan_expired vira error com a mensagem e não repete", async () => {
    const { result } = await mountEdit(1)
    mockUc.save.mockRejectedValue(new PlanError("plan_expired"))
    act(() => result.current.save({ v: 1 }))
    await tick(60000)
    expect(mockUc.save).toHaveBeenCalledTimes(1)
    expect(result.current.mode).toBe("error")
    expect(result.current.error).toBe("Este planejamento expirou.")
  })
})

describe("usePlanSync - plan_not_found", () => {
  it("plan_not_found ao gravar vira error com mensagem clara e não repete", async () => {
    const { result } = await mountEdit(1)
    mockUc.save.mockRejectedValue(new PlanError("plan_not_found"))
    act(() => result.current.save({ v: 1 }))
    await tick(60000)
    expect(mockUc.save).toHaveBeenCalledTimes(1)
    expect(result.current.mode).toBe("error")
    expect(result.current.error).toBe("Planejamento não encontrado.")
    expect(result.current.status).toBe("idle")
  })
})

describe("usePlanSync - leitura de outro plano", () => {
  it("repete a leitura a cada 20 s e só atualiza plan se a revisão mudou", async () => {
    mockUc.get.mockResolvedValue(plan(3))
    const { result } = renderHook(() => usePlanSync(OTHER))
    await flush()
    const first = result.current.plan
    mockUc.get.mockResolvedValue(plan(3))
    await tick(19999)
    expect(mockUc.get).toHaveBeenCalledTimes(1)
    await tick(1)
    expect(mockUc.get).toHaveBeenCalledTimes(2)
    expect(result.current.plan).toBe(first)
    mockUc.get.mockResolvedValue(plan(4))
    await tick(20000)
    expect(mockUc.get).toHaveBeenCalledTimes(3)
    expect(result.current.plan?.revision).toBe(4)
    expect(result.current.plan).not.toBe(first)
  })

  it("não dispara outra leitura enquanto uma está em andamento", async () => {
    mockUc.get.mockResolvedValueOnce(plan(3))
    const { result } = renderHook(() => usePlanSync(OTHER))
    await flush()
    const slow = deferred<PlanDocument>()
    mockUc.get.mockReturnValue(slow.promise)
    await tick(20000)
    await tick(40000)
    expect(mockUc.get).toHaveBeenCalledTimes(2)
    await act(async () => {
      slow.resolve(plan(5))
    })
    await flush()
    expect(result.current.plan?.revision).toBe(5)
  })

  it("readonly de mine também acompanha por polling", async () => {
    mockUc.open.mockResolvedValue(opened("readonly", 2))
    const { result } = renderHook(() => usePlanSync(MINE))
    await flush()
    mockUc.get.mockResolvedValue(plan(6))
    await tick(20000)
    expect(mockUc.get).toHaveBeenCalledTimes(1)
    expect(result.current.plan?.revision).toBe(6)
  })

  it("falha na leitura periódica mantém o plano e continua tentando", async () => {
    mockUc.get.mockResolvedValueOnce(plan(3))
    const { result } = renderHook(() => usePlanSync(OTHER))
    await flush()
    mockUc.get.mockRejectedValue(new Error("rede"))
    await tick(40000)
    expect(mockUc.get).toHaveBeenCalledTimes(3)
    expect(result.current.mode).toBe("readonly")
    expect(result.current.plan?.revision).toBe(3)
  })
})

describe("usePlanSync - release e reopen", () => {
  it("release chama ReleasePlan uma vez, mesmo repetido e depois do desmonte", async () => {
    const { result, unmount } = await mountEdit()
    act(() => result.current.release())
    act(() => result.current.release())
    expect(mockUc.release).toHaveBeenCalledTimes(1)
    expect(mockUc.release).toHaveBeenCalledWith("plan-1", result.current.sessionId)
    unmount()
    expect(mockUc.release).toHaveBeenCalledTimes(1)
  })

  it("o desmonte em edit libera uma vez", async () => {
    const { unmount } = await mountEdit()
    unmount()
    expect(mockUc.release).toHaveBeenCalledTimes(1)
  })

  it("o desmonte em readonly não libera", async () => {
    mockUc.open.mockResolvedValue(opened("readonly"))
    const { unmount } = renderHook(() => usePlanSync(MINE))
    await flush()
    unmount()
    expect(mockUc.release).not.toHaveBeenCalled()
  })

  it("erro do ReleasePlan (e do envio final) é engolido, sem rejeição não tratada", async () => {
    const { result } = await mountEdit()
    const unhandled = jest.fn()
    process.on("unhandledRejection", unhandled)
    mockUc.release.mockRejectedValue(new Error("rede"))
    mockUc.save.mockRejectedValue(new Error("rede"))
    act(() => result.current.save({ v: 1 }))
    await flush()
    expect(() => act(() => result.current.release())).not.toThrow()
    await flush()
    jest.useRealTimers()
    await new Promise(r => window.setTimeout(r, 0))
    process.off("unhandledRejection", unhandled)
    expect(unhandled).not.toHaveBeenCalled()
    expect(mockUc.release).toHaveBeenCalledTimes(1)
  })

  it("release em edit para o heartbeat", async () => {
    const { result } = await mountEdit()
    act(() => result.current.release())
    await tick(120000)
    expect(mockUc.heartbeat).not.toHaveBeenCalled()
  })

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

  it("reopen em readonly (mine) tenta OpenPlan de novo e vira edit se obtiver a reserva", async () => {
    mockUc.open.mockResolvedValueOnce(opened("readonly", 2)).mockResolvedValueOnce(opened("edit", 5))
    const { result } = renderHook(() => usePlanSync(MINE))
    await flush()
    expect(result.current.mode).toBe("readonly")
    await act(async () => {
      await result.current.reopen()
    })
    expect(mockUc.open).toHaveBeenCalledTimes(2)
    expect(mockUc.reopen).not.toHaveBeenCalled()
    expect(result.current.mode).toBe("edit")
    expect(result.current.lostChanges).toBe(0)
  })

  it("reopen em readonly que continua sem reserva permanece readonly", async () => {
    mockUc.open.mockResolvedValue(opened("readonly", 2))
    const { result } = renderHook(() => usePlanSync(MINE))
    await flush()
    await act(async () => {
      await result.current.reopen()
    })
    expect(result.current.mode).toBe("readonly")
  })

  it("reopen em kind other não faz nada", async () => {
    const { result } = renderHook(() => usePlanSync(OTHER))
    await flush()
    await act(async () => {
      await result.current.reopen()
    })
    expect(mockUc.open).not.toHaveBeenCalled()
    expect(mockUc.reopen).not.toHaveBeenCalled()
  })
})

describe("usePlanSync - época da fila (perda de reserva, reopen, release)", () => {
  const visible = async () => {
    jest.spyOn(document, "visibilityState", "get").mockReturnValue("visible")
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"))
    })
  }

  it("perda da reserva durante a espera de repetição + reopen não reenvia o job antigo", async () => {
    const { result } = await mountEdit(1)
    mockUc.save.mockRejectedValue(new Error("rede"))
    act(() => result.current.save({ v: "antigo" }))
    await flush()
    expect(mockUc.save).toHaveBeenCalledTimes(1)
    mockUc.heartbeat.mockRejectedValue(new PlanError("plan_lock_lost"))
    await visible()
    expect(result.current.mode).toBe("readonly")
    mockUc.open.mockResolvedValue(opened("edit", 5))
    mockUc.heartbeat.mockResolvedValue(undefined)
    await act(async () => {
      await result.current.reopen()
    })
    expect(result.current.mode).toBe("edit")
    await tick(120000)
    expect(mockUc.save).toHaveBeenCalledTimes(1)
    // a fila nova funciona logo (pump não ficou preso) e usa a revisão reaberta
    mockUc.save.mockReset()
    mockUc.save.mockResolvedValue(6)
    act(() => result.current.save({ v: "novo" }))
    await flush()
    expect(mockUc.save).toHaveBeenCalledTimes(1)
    expect(mockUc.save.mock.calls[0][3]).toBe(5)
    expect(mockUc.save.mock.calls[0][4]).toEqual({ v: "novo" })
  })

  it("resposta tardia de gravação antiga não sobrescreve a revisão depois do reopen", async () => {
    const { result } = await mountEdit(1)
    const late = deferred<number>()
    mockUc.save.mockReturnValueOnce(late.promise)
    act(() => result.current.save({ v: "antigo" }))
    await flush()
    mockUc.heartbeat.mockRejectedValue(new PlanError("plan_lock_lost"))
    await visible()
    mockUc.open.mockResolvedValue(opened("edit", 5))
    await act(async () => {
      await result.current.reopen()
    })
    await act(async () => {
      late.resolve(2)
    })
    await flush()
    mockUc.save.mockResolvedValue(6)
    act(() => result.current.save({ v: "novo" }))
    await flush()
    expect(mockUc.save.mock.calls[1][3]).toBe(5)
  })

  it("plan_expired durante a repetição para a fila", async () => {
    const { result } = await mountEdit(1)
    mockUc.save.mockRejectedValueOnce(new Error("rede")).mockRejectedValue(new PlanError("plan_expired"))
    act(() => result.current.save({ v: 1 }))
    await flush()
    await tick(2000)
    expect(result.current.mode).toBe("error")
    await tick(120000)
    expect(mockUc.save).toHaveBeenCalledTimes(2)
  })

  it("plan_concluded na gravação vai a concluded, recarrega e não repete nem libera", async () => {
    const { result, unmount } = await mountEdit(1)
    mockUc.save.mockRejectedValue(new PlanError("plan_concluded"))
    mockUc.get.mockResolvedValue(plan(7, { status: "concluido" }))
    act(() => result.current.save({ v: 1 }))
    await tick(60000)
    expect(result.current.mode).toBe("concluded")
    expect(result.current.plan?.revision).toBe(7)
    expect(mockUc.save).toHaveBeenCalledTimes(1)
    unmount()
    expect(mockUc.release).not.toHaveBeenCalled()
  })

  it("plan_revision_conflict libera a reserva (uma vez) e não grava mais", async () => {
    const { result, unmount } = await mountEdit(1)
    mockUc.save.mockRejectedValue(new PlanError("plan_revision_conflict"))
    act(() => result.current.save({ v: 1 }))
    await tick(60000)
    expect(mockUc.release).toHaveBeenCalledTimes(1)
    expect(mockUc.save).toHaveBeenCalledTimes(1)
    unmount()
    expect(mockUc.release).toHaveBeenCalledTimes(1)
  })

  it("save durante a espera de repetição é coalescido e enviado depois da repetição", async () => {
    const { result } = await mountEdit(1)
    mockUc.save.mockRejectedValueOnce(new Error("rede")).mockResolvedValue(2)
    act(() => result.current.save({ v: "A" }))
    await flush()
    act(() => {
      result.current.save({ v: "B" })
      result.current.save({ v: "C" })
    })
    await tick(1999)
    expect(mockUc.save).toHaveBeenCalledTimes(1)
    await tick(1)
    await flush()
    expect(mockUc.save).toHaveBeenCalledTimes(3)
    const [first, retry, last] = mockUc.save.mock.calls
    expect(retry[2]).toBe(first[2])
    expect(retry[4]).toEqual({ v: "A" })
    expect(last[4]).toEqual({ v: "C" })
    expect(last[3]).toBe(2)
    expect(result.current.status).toBe("saved")
  })

  it("release envia uma vez o estado mais recente (esperando a gravação em rede) e então libera", async () => {
    const { result } = await mountEdit(1)
    const first = deferred<number>()
    mockUc.save.mockReturnValueOnce(first.promise).mockResolvedValue(3)
    act(() => {
      result.current.save({ v: 1 })
    })
    await flush()
    act(() => {
      result.current.save({ v: 2 })
      result.current.save({ v: 3 })
    })
    act(() => result.current.release())
    expect(mockUc.release).not.toHaveBeenCalled()
    await act(async () => {
      first.resolve(2)
    })
    await flush()
    expect(mockUc.save).toHaveBeenCalledTimes(2)
    expect(mockUc.save.mock.calls[1][3]).toBe(2)
    expect(mockUc.save.mock.calls[1][4]).toEqual({ v: 3 })
    expect(mockUc.release).toHaveBeenCalledTimes(1)
    expect(mockUc.save.mock.invocationCallOrder[1]).toBeLessThan(mockUc.release.mock.invocationCallOrder[0])
    act(() => result.current.save({ v: 4 }))
    await tick(120000)
    expect(mockUc.save).toHaveBeenCalledTimes(2)
    expect(mockUc.release).toHaveBeenCalledTimes(1)
  })

  it("release durante a espera de repetição faz uma tentativa (mesmo request_id) e mata a fila", async () => {
    const { result } = await mountEdit(1)
    mockUc.save.mockRejectedValue(new Error("rede"))
    act(() => result.current.save({ v: 1 }))
    await flush()
    act(() => result.current.release())
    await flush()
    expect(mockUc.save).toHaveBeenCalledTimes(2)
    expect(mockUc.save.mock.calls[1][2]).toBe(mockUc.save.mock.calls[0][2])
    expect(mockUc.release).toHaveBeenCalledTimes(1)
    await tick(120000)
    expect(mockUc.save).toHaveBeenCalledTimes(2)
    expect(mockUc.release).toHaveBeenCalledTimes(1)
  })

  it("desmonte com gravação em andamento envia o pendente uma vez e libera", async () => {
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
    expect(mockUc.release).toHaveBeenCalledTimes(1)
    await tick(120000)
    expect(mockUc.save).toHaveBeenCalledTimes(2)
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
    expect(mockUc.heartbeat).not.toHaveBeenCalled()
  })
})

describe("usePlanSync - troca de alvo", () => {
  type Props = { t: Parameters<typeof usePlanSync>[0] }

  it("mine -> other -> null: libera uma vez, zera o estado e não vaza o plano antigo", async () => {
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
    expect(mockUc.release).toHaveBeenCalledTimes(1)
    expect(mockUc.release).toHaveBeenCalledWith("plan-1", result.current.sessionId)
    expect(result.current.plan).toBeNull()
    expect(result.current.status).toBe("idle")
    expect(result.current.mode).toBe("loading")
    await flush()
    expect(result.current.mode).toBe("readonly")
    expect(result.current.plan?.id).toBe("plan-2")

    rerender({ t: null })
    expect(result.current.mode).toBe("idle")
    expect(result.current.plan).toBeNull()
    expect(mockUc.release).toHaveBeenCalledTimes(1)
    await tick(120000)
    expect(mockUc.get).toHaveBeenCalledTimes(1)
    expect(mockUc.heartbeat).not.toHaveBeenCalled()
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
    await tick(120000)
    expect(mockUc.heartbeat).not.toHaveBeenCalled()
    expect(mockUc.release).not.toHaveBeenCalled()
  })
})

describe("usePlanSync - markConcluded", () => {
  it("vira concluded, relê o documento e não envia mais nada nem libera a reserva", async () => {
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
    expect(mockUc.heartbeat).not.toHaveBeenCalled()
    expect(mockUc.release).not.toHaveBeenCalled()
    unmount()
    await flush()
    expect(mockUc.release).not.toHaveBeenCalled()
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
