import { useState, useCallback } from "react"
import { Mass, SwapRequest } from "@/domain/models/Schedule"
import { 
  makeListSchedulesForMonth,
  makeConfirmScheduleSlot,
  makeRequestScheduleSwap,
  makeCancelScheduleSwap,
  makeListAllSwaps,
  makeDeleteMass,
  makeAcceptScheduleSwap,
  makePublishScheduleMonth,
  makeUpdateMassesStatus
} from "@/main/factories/usecases/schedule"
import { toast } from "sonner"

export function useSchedule() {
  const [schedule, setSchedule] = useState<Mass[]>([])
  const [swaps, setSwaps] = useState<SwapRequest[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingSwaps, setLoadingSwaps] = useState(false)

  const loadSchedule = useCallback(async (date: Date, isAdmin?: boolean, silent = false) => {
    try {
      if (!silent) setLoading(true)
      const data = await makeListSchedulesForMonth().execute(date, isAdmin)
      setSchedule(data)
    } catch (error) {
      console.error(error)
      toast.error("Erro ao carregar escala")
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  const loadSwaps = useCallback(async () => {
    try {
      setLoadingSwaps(true)
      const data = await makeListAllSwaps().execute()
      setSwaps(data)
    } catch (error) {
      console.error(error)
    } finally {
      setLoadingSwaps(false)
    }
  }, [])

  const confirmSlot = async (slotId: string, userId: string) => {
    // Atualização otimista da UI para dar feedback instantâneo ao usuário
    setSchedule(prev => prev.map(mass => ({
      ...mass,
      slots: mass.slots.map(s => s.id === slotId ? { ...s, isConfirmed: true, readerId: userId } : s)
    })))
    
    try {
      await makeConfirmScheduleSlot().execute(slotId, userId)
    } catch (error) {
      console.error("Erro ao confirmar slot:", error)
      throw error
    }
  }

  const requestSwap = async (slotId: string) => {
    // Atualização otimista
    setSchedule(prev => prev.map(mass => ({
      ...mass,
      slots: mass.slots.map(s => s.id === slotId ? { ...s, isSwapRequested: true } : s)
    })))
    
    try {
      await makeRequestScheduleSwap().execute(slotId)
    } catch (error) {
      console.error("Erro ao pedir troca:", error)
      throw error
    }
  }

  const cancelSwap = async (slotId: string) => {
    // Atualização otimista
    setSchedule(prev => prev.map(mass => ({
      ...mass,
      slots: mass.slots.map(s => s.id === slotId ? { ...s, isSwapRequested: false } : s)
    })))
    
    try {
      await makeCancelScheduleSwap().execute(slotId)
    } catch (error) {
      console.error("Erro ao cancelar troca:", error)
      throw error
    }
  }

  const acceptSwap = async (slotId: string, userId: string, memberId?: string) => {
    // Atualização otimista
    setSchedule(prev => prev.map(mass => ({
      ...mass,
      slots: mass.slots.map(s => s.id === slotId ? { ...s, isSwapRequested: false, isConfirmed: true, readerId: userId, memberId: memberId || s.memberId } : s)
    })))
    
    try {
      await makeAcceptScheduleSwap().execute(slotId, userId, memberId)
    } catch (error) {
      console.error("Erro ao assumir troca:", error)
      throw error
    }
  }

  const deleteMass = async (massId: string) => {
    await makeDeleteMass().execute(massId)
  }

  const publishMonth = async (monthReference: string) => {
    await makePublishScheduleMonth().execute(monthReference)
  }

  const updateMassesStatus = async (massIds: string[], isPublished: boolean) => {
    await makeUpdateMassesStatus().execute(massIds, isPublished)
  }
  
  return {
    schedule,
    swaps,
    loading,
    loadingSwaps,
    loadSchedule,
    loadSwaps,
    confirmSlot,
    requestSwap,
    cancelSwap,
    acceptSwap,
    deleteMass,
    publishMonth,
    updateMassesStatus
  }
}
