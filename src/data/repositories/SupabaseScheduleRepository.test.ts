import { SupabaseScheduleRepository } from "./SupabaseScheduleRepository"
import { supabase } from "@/shared/api/supabase"

jest.mock("@/shared/api/supabase", () => ({
  supabase: {
    from: jest.fn()
  }
}))

describe("SupabaseScheduleRepository", () => {
  let repository: SupabaseScheduleRepository

  beforeEach(() => {
    repository = new SupabaseScheduleRepository()
    jest.clearAllMocks()
  })

  const mockSupabaseChain = (data: any = [], error: any = null) => {
    const chain = {
      select: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      then: jest.fn((resolve) => resolve({ data, error })),
    }
    // Para suportar await direto no encadeamento
    return chain as any
  }

  it("should delete mass and its slots", async () => {
    const massId = "mass-1"
    
    const mockFrom = supabase.from as jest.Mock
    mockFrom.mockImplementation((table) => {
      if (table === 'schedule_slots') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockResolvedValue({ data: [], error: null }), // Nenhum slot encontrado
          delete: jest.fn().mockReturnThis(),
          in: jest.fn().mockResolvedValue({ error: null })
        }
      }
      return {
        delete: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ error: null })
      }
    })

    await repository.deleteMass(massId)

    expect(mockFrom).toHaveBeenCalledWith('schedule_slots')
    expect(mockFrom).toHaveBeenCalledWith('masses')
  })

  it("should delete related announcements before deleting slots", async () => {
    const massId = "mass-1"
    const slotId = "slot-1"
    
    const mockFrom = supabase.from as jest.Mock
    mockFrom.mockImplementation((table) => {
      if (table === 'schedule_slots') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockResolvedValue({ data: [{ id: slotId }], error: null }),
          delete: jest.fn().mockReturnThis(),
          in: jest.fn().mockResolvedValue({ error: null })
        }
      }
      if (table === 'announcements') {
        return {
          delete: jest.fn().mockReturnThis(),
          in: jest.fn().mockResolvedValue({ error: null })
        }
      }
      return {
        delete: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ error: null })
      }
    })

    await repository.deleteMass(massId)

    expect(mockFrom).toHaveBeenCalledWith('announcements')
    expect(mockFrom).toHaveBeenCalledWith('schedule_slots')
    expect(mockFrom).toHaveBeenCalledWith('masses')
  })

  it("should check if mass exists for a given date", async () => {
    const date = "2026-04-29"
    const mockFrom = supabase.from as jest.Mock
    mockFrom.mockImplementation((table) => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({ 
        data: [{ id: '1', date, time: '07:00:00', is_published: true }], 
        error: null 
      })
    }))

    const result = await repository.checkMassExists(date)

    expect(mockFrom).toHaveBeenCalledWith('masses')
    expect(result).toHaveLength(1)
    expect(result[0].time).toBe('07:00:00')
  })

  it("should update status for multiple masses", async () => {
    const massIds = ["1", "2"]
    const mockFrom = supabase.from as jest.Mock
    mockFrom.mockImplementation(() => ({
      update: jest.fn().mockReturnThis(),
      in: jest.fn().mockResolvedValue({ error: null })
    }))

    await repository.updateMassesStatus(massIds, true)

    expect(mockFrom).toHaveBeenCalledWith('masses')
  })

  it("should confirm a slot", async () => {
    const slotId = "slot-1"
    const userId = "user-1"
    const mockFrom = supabase.from as jest.Mock
    mockFrom.mockImplementation(() => ({
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ 
        data: { id: slotId, is_confirmed: true, reader_id: userId }, 
        error: null 
      })
    }))

    const result = await repository.confirmSlot(slotId, userId)

    expect(mockFrom).toHaveBeenCalledWith('schedule_slots')
    expect(result.isConfirmed).toBe(true)
  })

  it("should request a swap", async () => {
    const slotId = "slot-1"
    const mockFrom = supabase.from as jest.Mock
    mockFrom.mockImplementation(() => ({
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({ error: null })
    }))

    // Mock global fetch for push notification
    global.fetch = jest.fn().mockResolvedValue({ ok: true })

    await repository.requestSwap(slotId)

    expect(mockFrom).toHaveBeenCalledWith('schedule_slots')
    expect(global.fetch).toHaveBeenCalled()
  })

  it("should list upcoming schedules for a user globally", async () => {
    const userId = "user-1"
    const memberId = "member-1"
    const mockFrom = supabase.from as jest.Mock
    
    const mockChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      or: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      then: jest.fn((resolve) => resolve({ 
        data: [
          {
            id: 'slot-1',
            role: '1L',
            is_confirmed: false,
            mass: {
              id: 'mass-1',
              date: '2026-06-01',
              time: '08:00:00',
              is_published: true
            }
          }
        ], 
        error: null 
      }))
    }

    mockFrom.mockReturnValue(mockChain)

    const result = await repository.listUpcomingForUser(userId, memberId)

    expect(mockFrom).toHaveBeenCalledWith('schedule_slots')
    expect(result).toHaveLength(1)
    expect(result[0].date).toBe('2026-06-01')
  })
})
