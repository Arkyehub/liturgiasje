export interface UnavailableRepository {
  listByProfile(profileId: string): Promise<string[]>
  listManyByDate(date: string): Promise<string[]>
  toggleDate(profileId: string, date: string): Promise<{ action: 'added' | 'removed' }>
}
