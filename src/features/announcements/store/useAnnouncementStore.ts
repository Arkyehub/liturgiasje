import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

interface AnnouncementStore {
  isFormOpen: boolean
  editingId: string | null
  title: string
  content: string
  hasExpiration: boolean
  expirationDate: string | null
  imageUrls: string[]
  audioUrls: string[]
  pdfUrls: string[]
  setIsFormOpen: (open: boolean) => void
  setEditingId: (id: string | null) => void
  setTitle: (title: string) => void
  setContent: (content: string) => void
  setHasExpiration: (has: boolean) => void
  setExpirationDate: (date: Date | null) => void
  setImageUrls: (urls: string[] | ((prev: string[]) => string[])) => void
  setAudioUrls: (urls: string[] | ((prev: string[]) => string[])) => void
  setPdfUrls: (urls: string[] | ((prev: string[]) => string[])) => void
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
      imageUrls: [],
      audioUrls: [],
      pdfUrls: [],
      setIsFormOpen: (isFormOpen) => set({ isFormOpen }),
      setEditingId: (editingId) => set({ editingId }),
      setTitle: (title) => set({ title }),
      setContent: (content) => set({ content }),
      setHasExpiration: (hasExpiration) => set({ hasExpiration }),
      setExpirationDate: (date) => set({ expirationDate: date ? date.toISOString() : null }),
      setImageUrls: (urls) => set((state) => ({ 
        imageUrls: typeof urls === 'function' ? urls(state.imageUrls) : urls 
      })),
      setAudioUrls: (urls) => set((state) => ({ 
        audioUrls: typeof urls === 'function' ? urls(state.audioUrls) : urls 
      })),
      setPdfUrls: (urls) => set((state) => ({ 
        pdfUrls: typeof urls === 'function' ? urls(state.pdfUrls) : urls 
      })),
      clearDraft: () => set({ 
        isFormOpen: false,
        editingId: null, 
        title: '', 
        content: '', 
        hasExpiration: false, 
        expirationDate: null,
        imageUrls: [],
        audioUrls: [],
        pdfUrls: []
      }),
    }),
    {
      name: 'announcement-form-draft',
      storage: createJSONStorage(() => localStorage),
    }
  )
)
