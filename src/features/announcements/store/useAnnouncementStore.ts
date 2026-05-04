import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

interface AnnouncementStore {
  isFormOpen: boolean
  editingId: string | null
  title: string
  content: string
  hasExpiration: boolean
  expirationDate: string | null
  setIsFormOpen: (open: boolean) => void
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
      isFormOpen: false,
      editingId: null,
      title: '',
      content: '',
      hasExpiration: false,
      expirationDate: null,
      setIsFormOpen: (isFormOpen) => set({ isFormOpen }),
      setEditingId: (editingId) => set({ editingId }),
      setTitle: (title) => set({ title }),
      setContent: (content) => set({ content }),
      setHasExpiration: (hasExpiration) => set({ hasExpiration }),
      setExpirationDate: (date) => set({ expirationDate: date ? date.toISOString() : null }),
      clearDraft: () => set({ 
        isFormOpen: false,
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
