/**
 * Aceita apenas caminhos internos como destino de redirecionamento (ex.: "/perfil?x=1").
 * Rejeita endereços absolutos, "//host", "/\\host" e o truque "@host" (que viraria "https://app@host").
 */
export function safeNextPath(next: string | null | undefined, fallback = "/"): string {
  if (!next || typeof next !== "string") return fallback
  if (!next.startsWith("/")) return fallback
  if (next.startsWith("//") || next.startsWith("/\\")) return fallback
  if (/[\u0000-\u001f\u007f]/.test(next)) return fallback
  try {
    // Precisa continuar na mesma origem depois de resolvida
    const base = "https://app.invalid"
    if (new URL(next, base).origin !== base) return fallback
  } catch {
    return fallback
  }
  return next
}
