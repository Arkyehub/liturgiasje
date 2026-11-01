import { ArchiveProfile } from './index'
import { ProfileRepository } from '../../repositories/ProfileRepository'

describe('ArchiveProfile', () => {
  it('delegates the requested profile to the repository and propagates failures', async () => {
    const archive = jest.fn().mockRejectedValue(new Error('denied'))
    const action = new ArchiveProfile({ archive } as unknown as ProfileRepository)
    await expect(action.execute('member-id')).rejects.toThrow('denied')
    expect(archive).toHaveBeenCalledWith('member-id')
  })
})
