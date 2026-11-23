// Domínio oficial do app em Production. O login com Google (PKCE) guarda um cookie no domínio onde o
// usuário clicou em "Entrar"; se a volta cair em outro domínio, o cookie não existe e o login falha.
// Por isso, em Production, qualquer outro domínio deve ser redirecionado ao oficial ANTES do login.
export const CANONICAL_HOST = 'liturgiasje.vercel.app'

/** Retorna a URL no domínio oficial, ou null se não é preciso redirecionar. */
export function canonicalRedirectUrl(
  vercelEnv: string | undefined,
  host: string | null | undefined,
  pathWithSearch: string,
): string | null {
  if (vercelEnv !== 'production') return null // Preview, dev e testes mantêm o próprio domínio
  if (!host || host.toLowerCase() === CANONICAL_HOST) return null
  const path = pathWithSearch.startsWith('/') && !pathWithSearch.startsWith('//') ? pathWithSearch : '/'
  return `https://${CANONICAL_HOST}${path}`
}
