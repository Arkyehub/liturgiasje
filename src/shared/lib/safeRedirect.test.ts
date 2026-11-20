import { safeNextPath } from "./safeRedirect"

describe("safeNextPath", () => {
  it.each([
    ["/", "/"],
    ["/perfil", "/perfil"],
    ["/admin/membros?x=1#topo", "/admin/membros?x=1#topo"],
    ["/#slot-123", "/#slot-123"],
  ])("keeps the internal path %s", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected)
  })

  it.each([
    "@evil.test",
    "//evil.test",
    "/\\evil.test",
    "https://evil.test",
    "http://evil.test/x",
    "javascript:alert(1)",
    "perfil",
    "/\nhttps://evil.test",
    "",
    null,
    undefined,
  ])("falls back to / for %j", (input) => {
    expect(safeNextPath(input as string | null | undefined)).toBe("/")
  })

  it("never lets the final URL leave the origin", () => {
    const origin = "https://app.example.test"
    for (const next of ["@evil.test", "//evil.test", "/\\evil.test", "/ok"]) {
      expect(new URL(`${origin}${safeNextPath(next)}`).origin).toBe(origin)
    }
  })

  it("uses a custom fallback", () => {
    expect(safeNextPath("//x", "/home")).toBe("/home")
  })
})
