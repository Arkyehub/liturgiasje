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

  const loadAnnouncements = useCallback(async (profileId?: string, silent = false) => {
    try {
      if (!silent) setLoading(true)
      const data = await makeListAnnouncements().execute(profileId)
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

  const markAsRead = async (id: string, profileId: string) => {
    await makeMarkAnnouncementAsRead().execute(id, profileId)
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
