import { roleGroup, eligibleReaders } from "./types"
import type { Profile } from "@/domain/models/Profile"

const base = { email: null, role: "reader" as const, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" }

describe("roleGroup", () => {
  it("agrupa funções", () => {
    expect(roleGroup("1L")).toBe("R")
    expect(roleGroup("2L")).toBe("R")
    expect(roleGroup("L")).toBe("R")
    expect(roleGroup("C")).toBe("C")
    expect(roleGroup("P")).toBe("P")
    expect(roleGroup("X")).toBeNull()
  })
})

describe("eligibleReaders", () => {
  it("devolve só ativos com conta vinculada", () => {
    const profiles: Profile[] = [
      { ...base, id: "a", fullName: "Ativo", authUserId: "u1", preferences: { day_preferences: { "0": ["09:00"] } } },
      { ...base, id: "b", fullName: "Arquivado", authUserId: "u2", archivedAt: "2026-02-01T00:00:00Z" },
      { ...base, id: "c", fullName: "SemConta", authUserId: null },
      { ...base, id: "d", fullName: "Admin", role: "admin", authUserId: "u4" },
    ]
    const r = eligibleReaders(profiles)
    expect(r.map((x) => x.id)).toEqual(["a", "d"])
    expect(r[0].dayPreferences).toEqual({ "0": ["09:00"] })
    expect(r[1].dayPreferences).toEqual({})
    expect(r[0].createdAt).toBe("2026-01-01T00:00:00Z")
  })
})
