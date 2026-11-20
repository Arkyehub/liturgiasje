import { timingSafeEqual } from "node:crypto"

/** Compara dois textos em tempo constante (segredos, tokens). Só para uso em código de servidor. */
export function safeEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

/** Confere o cabeçalho `Authorization: Bearer <segredo>` das rotas de cron. */
export function hasValidCronSecret(request: Request, secret: string | undefined): boolean {
  if (!secret) return false
  return safeEqual(request.headers.get("authorization"), `Bearer ${secret}`)
}
