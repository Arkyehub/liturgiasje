export interface UnavailableRepository {
  listByUser(userId: string): Promise<string[]>
  listManyByDate(date: string): Promise<string[]>
  toggleDate(userId: string, date: string): Promise<{ action: 'added' | 'removed' }>
}
