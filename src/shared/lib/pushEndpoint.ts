/** Serviços de push dos navegadores. O servidor só envia notificações para estes destinos. */
const PUSH_HOST_SUFFIXES = [
  "fcm.googleapis.com", // Chrome, Edge, Brave, Opera e Android
  "push.services.mozilla.com", // Firefox
  "push.apple.com", // Safari/iOS (web.push.apple.com)
  "notify.windows.com", // Edge/Windows legado (WNS)
]

const BASE64URL = /^[A-Za-z0-9_-]+={0,2}$/

export function isAllowedPushEndpoint(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== "string" || endpoint.length > 2048) return false
  let url: URL
  try {
    url = new URL(endpoint)
  } catch {
    return false
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return false
  const host = url.hostname.toLowerCase()
  return PUSH_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith("." + suffix))
}

/** Valida o formato de uma assinatura Web Push (endpoint permitido e chaves em base64url). */
export function isValidPushSubscription(subscription: unknown): boolean {
  if (!subscription || typeof subscription !== "object") return false
  const { endpoint, keys } = subscription as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }
  if (!isAllowedPushEndpoint(endpoint)) return false
  const p256dh = keys?.p256dh
  const auth = keys?.auth
  return (
    typeof p256dh === "string" && typeof auth === "string" &&
    p256dh.length >= 40 && p256dh.length <= 200 && BASE64URL.test(p256dh) &&
    auth.length >= 10 && auth.length <= 64 && BASE64URL.test(auth)
  )
}
