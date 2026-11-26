export interface UnavailableRepository {
  listByProfile(profileId: string): Promise<string[]>
  listManyByDate(date: string): Promise<string[]>
  listForRange(fromDate: string, toDate: string): Promise<Record<string, string[]>>
  toggleDate(profileId: string, date: string): Promise<{ action: 'added' | 'removed' }>
}
