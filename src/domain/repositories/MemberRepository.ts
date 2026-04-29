import { Member } from "../models/Member"

export interface MemberRepository {
  listAll(): Promise<Member[]>
  search(query: string): Promise<Member[]>
  create(data: Omit<Member, 'id' | 'createdAt'>): Promise<Member>
  update(id: string, data: Partial<Member>): Promise<Member>
  delete(id: string): Promise<void>
  claim(memberId: string, userId: string): Promise<Member>
  getByUserId(userId: string): Promise<Member | null>
}
