/** @jest-environment node */
import fs from "node:fs"
import path from "node:path"
import vm from "node:vm"

// Executa o public/sw.js de verdade em um ambiente isolado, com um `self` simulado.
function loadServiceWorker() {
  const handlers: Record<string, (event: unknown) => unknown> = {}
  const openWindow = jest.fn()
  const matchAll = jest.fn().mockResolvedValue([])
  const self = {
    location: { origin: "https://app.example.test" },
    addEventListener: (name: string, fn: (event: unknown) => unknown) => { handlers[name] = fn },
    clients: { matchAll, openWindow, claim: jest.fn() },
    skipWaiting: jest.fn(),
    registration: { showNotification: jest.fn() },
  }
  vm.runInNewContext(fs.readFileSync(path.join(process.cwd(), "public/sw.js"), "utf8"), { self, clients: self.clients, caches: {}, URL, console })
  return { handlers, openWindow }
}

async function click(url: string | undefined) {
  const { handlers, openWindow } = loadServiceWorker()
  let pending: Promise<unknown> = Promise.resolve()
  handlers.notificationclick({ notification: { close: jest.fn(), data: { url } }, waitUntil: (p: Promise<unknown>) => { pending = p } })
  await pending
  return openWindow
}

test("opens pages of the app itself", async () => {
  expect(await click("/perfil")).toHaveBeenCalledWith("https://app.example.test/perfil")
  expect(await click(undefined)).toHaveBeenCalledWith("https://app.example.test/")
})

test.each(["https://evil.test/phish", "//evil.test", "https://app.example.test.evil.test/"])(
  "never opens another site from a notification (%s)",
  async (url) => {
    expect(await click(url)).toHaveBeenCalledWith("https://app.example.test/")
  }
)
