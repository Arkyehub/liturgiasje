/** @jest-environment node */
import nextConfig from "./next.config"

type Rule = { source: string; headers: { key: string; value: string }[] }

async function headersFor() {
  const rules = (await nextConfig.headers!()) as Rule[]
  const all = rules.find((r) => r.source === "/:path*")!
  return { rules, map: Object.fromEntries(all.headers.map((h) => [h.key, h.value])) }
}

test("every page gets the basic security headers", async () => {
  const { map } = await headersFor()
  expect(map["X-Content-Type-Options"]).toBe("nosniff")
  expect(map["X-Frame-Options"]).toBe("DENY")
  expect(map["Content-Security-Policy"]).toBe("frame-ancestors 'none'")
  expect(map["Referrer-Policy"]).toBe("strict-origin-when-cross-origin")
})

test("the microphone and camera stay available (audio recording and photo upload)", async () => {
  const { map } = await headersFor()
  expect(map["Permissions-Policy"]).toContain("microphone=(self)")
  expect(map["Permissions-Policy"]).toContain("camera=(self)")
  expect(map["Permissions-Policy"]).toContain("geolocation=()")
})

test("the full CSP is report-only so it cannot block the app", async () => {
  const { map } = await headersFor()
  const csp = map["Content-Security-Policy-Report-Only"]
  for (const needed of ["https://accounts.google.com", "https://*.supabase.co", "wss://*.supabase.co", "https://va.vercel-scripts.com", "object-src 'none'"]) {
    expect(csp).toContain(needed)
  }
  // a política imposta (sem Report-Only) só pode conter frame-ancestors
  expect(map["Content-Security-Policy"]).not.toContain("script-src")
})

test("service worker and manifest keep their cache rules", async () => {
  const { rules } = await headersFor()
  expect(rules.find((r) => r.source === "/sw.js")!.headers.map((h) => h.key)).toEqual(["Cache-Control", "Service-Worker-Allowed"])
  expect(rules.find((r) => r.source === "/manifest.json")).toBeTruthy()
})
