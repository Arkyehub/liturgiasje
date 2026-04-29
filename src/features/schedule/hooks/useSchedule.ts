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
    await makeConfirmScheduleSlot().execute(slotId, userId)
  }

  const requestSwap = async (slotId: string) => {
    await makeRequestScheduleSwap().execute(slotId)
  }

  const cancelSwap = async (slotId: string) => {
    await makeCancelScheduleSwap().execute(slotId)
  }

  const acceptSwap = async (slotId: string, userId: string, memberId?: string) => {
    await makeAcceptScheduleSwap().execute(slotId, userId, memberId)
  }

  const deleteMass = async (massId: string) => {
    await makeDeleteMass().execute(massId)
  }

  const publishMonth = async (monthRef: string) => {
    await makePublishScheduleMonth().execute(monthRef)
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
