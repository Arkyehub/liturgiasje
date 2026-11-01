export function scheduleErrorMessage(error: unknown, fallback: string): string {
  const message = typeof error === 'object' && error !== null && 'message' in error ? String(error.message) : ''
  if (message.includes('schedule_conflict')) return 'A escala foi alterada. Atualize a página e tente novamente.'
  if (['slot_has_assignment_history', 'mass_has_assignment_history', 'announcement_has_assignment_history'].some(code => message.includes(code))) {
    return 'Não é possível remover esta celebração ou vaga porque ela possui histórico de atribuições.'
  }
  return fallback
}
