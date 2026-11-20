/** Rótulos das funções litúrgicas (valores de `schedule_slots.role`). */
export const ROLE_LABELS_SHORT: Record<string, string> = {
  C: "Comentarista",
  "1L": "1ª Leitura",
  "2L": "2ª Leitura",
  P: "Preces",
  L: "Leitura Única",
}

export const ROLE_LABELS_LONG: Record<string, string> = {
  ...ROLE_LABELS_SHORT,
  "1L": "Primeira Leitura",
  "2L": "Segunda Leitura",
}

/** Nome da função; se for desconhecida, devolve o próprio código. `long` usa "Primeira/Segunda Leitura". */
export function roleLabel(role: string, long = false): string {
  return (long ? ROLE_LABELS_LONG : ROLE_LABELS_SHORT)[role] || role
}
