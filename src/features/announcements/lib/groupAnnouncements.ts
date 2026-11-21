export const PUBLISH_PIN_MS = 30_000

interface GroupableAnnouncement {
  id: string
  isRead?: boolean
  isPublished?: boolean
}

/**
 * Separa os recados entre os que ficam à mostra e os que vão para o grupo "já lidos".
 * Só recado PUBLICADO e lido pode ir para o grupo. Rascunhos nunca entram nele, e um recado
 * recém-publicado pelo admin fica fora do grupo enquanto estiver "fixado" (pinnedIds).
 */
export function groupAnnouncements<T extends GroupableAnnouncement>(
  announcements: T[],
  isLoggedIn: boolean,
  pinnedIds: ReadonlySet<string> = new Set()
): { visible: T[]; read: T[] } {
  const visible: T[] = []
  const read: T[] = []
  for (const ann of announcements) {
    const groupable =
      isLoggedIn && !!ann.isRead && ann.isPublished !== false && !pinnedIds.has(ann.id)
    ;(groupable ? read : visible).push(ann)
  }
  return { visible, read }
}
