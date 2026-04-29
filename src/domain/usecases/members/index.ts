import { MemberRepository } from "../../repositories/MemberRepository"
import { Member } from "../../models/Member"

export class ListMembers {
  constructor(private readonly memberRepository: MemberRepository) {}
  async execute(): Promise<Member[]> {
    return this.memberRepository.listAll()
  }
}

export class SearchMembers {
  constructor(private readonly memberRepository: MemberRepository) {}
  async execute(query: string): Promise<Member[]> {
    return this.memberRepository.search(query)
  }
}

export class CreateMember {
  constructor(private readonly memberRepository: MemberRepository) {}
  async execute(data: Omit<Member, 'id' | 'createdAt'>): Promise<Member> {
    return this.memberRepository.create(data)
  }
}

export class UpdateMember {
  constructor(private readonly memberRepository: MemberRepository) {}
  async execute(id: string, data: Partial<Member>): Promise<Member> {
    return this.memberRepository.update(id, data)
  }
}

export class DeleteMember {
  constructor(private readonly memberRepository: MemberRepository) {}
  async execute(id: string): Promise<void> {
    return this.memberRepository.delete(id)
  }
}

export class ClaimMember {
  constructor(private readonly memberRepository: MemberRepository) {}
  async execute(memberId: string, userId: string): Promise<Member> {
    return this.memberRepository.claim(memberId, userId)
  }
}

export class GetMemberByUserId {
  constructor(private readonly memberRepository: MemberRepository) {}
  async execute(userId: string): Promise<Member | null> {
    return this.memberRepository.getByUserId(userId)
  }
}
