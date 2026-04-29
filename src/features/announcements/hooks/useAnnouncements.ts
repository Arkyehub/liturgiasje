import { useState, useCallback } from "react"
import { Announcement } from "@/domain/models/Announcement"
import { 
  makeListAnnouncements, 
  makeCreateAnnouncement, 
  makeDeleteAnnouncement, 
  makeMarkAnnouncementAsRead, 
  makeUpdateAnnouncement 
} from "@/main/factories/usecases/announcements"
import { toast } from "sonner"

export function useAnnouncements() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(false)

  const loadAnnouncements = useCallback(async (userId?: string, silent = false) => {
    try {
      if (!silent) setLoading(true)
      const data = await makeListAnnouncements().execute(userId)
      setAnnouncements(data)
    } catch (error) {
      console.error(error)
      toast.error("Erro ao carregar avisos")
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  const createAnnouncement = async (data: any) => {
    await makeCreateAnnouncement().execute(data)
  }

  const updateAnnouncement = async (id: string, data: any) => {
    await makeUpdateAnnouncement().execute(id, data)
  }

  const deleteAnnouncement = async (id: string) => {
    await makeDeleteAnnouncement().execute(id)
  }

  const markAsRead = async (id: string, userId: string) => {
    await makeMarkAnnouncementAsRead().execute(id, userId)
  }

  return {
    announcements,
    loading,
    loadAnnouncements,
    createAnnouncement,
    updateAnnouncement,
    deleteAnnouncement,
    markAsRead
  }
}
