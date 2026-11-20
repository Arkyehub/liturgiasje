import { roleLabel } from "./roles"

test("short and long labels match what the app has always shown", () => {
  expect(roleLabel("1L")).toBe("1ª Leitura")
  expect(roleLabel("1L", true)).toBe("Primeira Leitura")
  expect(roleLabel("2L", true)).toBe("Segunda Leitura")
  expect(roleLabel("C")).toBe("Comentarista")
  expect(roleLabel("P", true)).toBe("Preces")
  expect(roleLabel("L")).toBe("Leitura Única")
})

test("unknown roles fall back to the code", () => {
  expect(roleLabel("X")).toBe("X")
})
