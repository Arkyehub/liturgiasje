/** Nomes por extenso das funções litúrgicas (siglas usadas no banco). */
export const ROLE_NAMES: Record<string, string> = {
  C: "Comentarista",
  "1L": "1ª Leitura",
  "2L": "2ª Leitura",
  P: "Preces",
  L: "Leitura Única",
}

export function roleName(role: string): string {
  return ROLE_NAMES[role] || role
}
