import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

interface AnnouncementStore {
  editingId: string | null
  title: string
  content: string
  hasExpiration: boolean
  expirationDate: string | null
  setEditingId: (id: string | null) => void
  setTitle: (title: string) => void
  setContent: (content: string) => void
  setHasExpiration: (has: boolean) => void
  setExpirationDate: (date: Date | null) => void
  clearDraft: () => void
}

export const useAnnouncementStore = create<AnnouncementStore>()(
  persist(
    (set) => ({
      editingId: null,
      title: '',
      content: '',
      hasExpiration: false,
      expirationDate: null,
      setEditingId: (editingId) => set({ editingId }),
      setTitle: (title) => set({ title }),
      setContent: (content) => set({ content }),
      setHasExpiration: (hasExpiration) => set({ hasExpiration }),
      setExpirationDate: (date) => set({ expirationDate: date ? date.toISOString() : null }),
      clearDraft: () => set({ 
        editingId: null, 
        title: '', 
        content: '', 
        hasExpiration: false, 
        expirationDate: null 
      }),
    }),
    {
      name: 'announcement-form-draft',
      storage: createJSONStorage(() => localStorage),
    }
  )
)
