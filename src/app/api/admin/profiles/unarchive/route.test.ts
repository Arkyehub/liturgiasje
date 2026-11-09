/** @jest-environment node */
import { POST } from './route'
import { createClient } from '@/shared/api/supabaseServer'
jest.mock('@/shared/api/supabaseServer', () => ({ createClient: jest.fn() }))
const id = 'd06cc4d3-3c86-4abe-a9b8-ec7bb390da30'
const request = (profileId: unknown) => new Request('http://localhost', {method:'POST',body:JSON.stringify({profileId})})
describe('unarchive endpoint', () => {
 beforeEach(() => jest.resetAllMocks())
 it('rejects invalid identifiers without calling the database', async () => {
   expect((await POST(request('invalid'))).status).toBe(400)
   expect(createClient).not.toHaveBeenCalled()
 })
 it('requires authentication', async () => {
   ;(createClient as jest.Mock).mockResolvedValue({auth:{getUser:async()=>({data:{user:null},error:null})}})
   expect((await POST(request(id))).status).toBe(401)
 })
 it('delegates to the transactional database function', async () => {
   const rpc=jest.fn().mockResolvedValue({data:'unarchived',error:null})
   ;(createClient as jest.Mock).mockResolvedValue({auth:{getUser:async()=>({data:{user:{id:'actor'}},error:null})},rpc})
   expect((await POST(request(id))).status).toBe(200)
   expect(rpc).toHaveBeenCalledWith('unarchive_member',{target_profile_id:id})
 })
 it('denies unauthorized requests', async () => {
   ;(createClient as jest.Mock).mockResolvedValue({auth:{getUser:async()=>({data:{user:{id:'actor'}},error:null})},rpc:async()=>({error:{code:'42501'}})})
   expect((await POST(request(id))).status).toBe(403)
 })
 it.each([['not_archived', null, 200], [null, {code:'P0002'}, 404], [null, {code:'XX000'}, 500]])('handles database result %s', async (data, error, status) => {
   ;(createClient as jest.Mock).mockResolvedValue({auth:{getUser:async()=>({data:{user:{id:'actor'}},error:null})},rpc:async()=>({data,error})})
   expect((await POST(request(id))).status).toBe(status)
 })
})
