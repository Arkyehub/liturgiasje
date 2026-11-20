/** @jest-environment node */
import { safeEqual, hasValidCronSecret } from "./safeCompare"

const req = (authorization?: string) => new Request("http://localhost", { headers: authorization ? { authorization } : {} })

test("safeEqual compares texts and rejects different lengths", () => {
  expect(safeEqual("abc", "abc")).toBe(true)
  expect(safeEqual("abc", "abd")).toBe(false)
  expect(safeEqual("abc", "abcd")).toBe(false)
  expect(safeEqual(null, "abc")).toBe(false)
  expect(safeEqual(undefined, undefined)).toBe(false)
})

test("hasValidCronSecret requires the configured secret and the exact Bearer header", () => {
  expect(hasValidCronSecret(req("Bearer s3cret"), "s3cret")).toBe(true)
  expect(hasValidCronSecret(req("Bearer outro"), "s3cret")).toBe(false)
  expect(hasValidCronSecret(req("s3cret"), "s3cret")).toBe(false)
  expect(hasValidCronSecret(req(), "s3cret")).toBe(false)
  expect(hasValidCronSecret(req("Bearer undefined"), undefined)).toBe(false) // sem segredo configurado, sempre nega
  expect(hasValidCronSecret(req("Bearer "), "")).toBe(false)
})
