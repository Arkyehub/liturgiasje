import { SupabaseAnnouncementRepository } from "./SupabaseAnnouncementRepository"
import { supabase } from "@/shared/api/supabase"

jest.mock("@/shared/api/supabase", () => ({
  supabase: {
    from: jest.fn(),
    storage: {
      from: jest.fn()
    },
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } })
    }
  }
}))

describe("SupabaseAnnouncementRepository", () => {
  let repository: SupabaseAnnouncementRepository

  beforeEach(() => {
    repository = new SupabaseAnnouncementRepository()
    jest.clearAllMocks()
  })

  it("should create an announcement with PDFs", async () => {
    const mockFile = new File(["pdf content"], "test.pdf", { type: "application/pdf" })
    const data = {
      title: "Teste",
      content: "Conteúdo",
      type: "Aviso" as const,
      expiresAt: new Date(),
      pdfFiles: [mockFile]
    }

    const mockUpload = jest.fn().mockResolvedValue({ error: null })
    const mockGetPublicUrl = jest.fn().mockReturnValue({ data: { publicUrl: 'http://test.pdf' } })
    
    ;(supabase.storage.from as jest.Mock).mockReturnValue({
      upload: mockUpload,
      getPublicUrl: mockGetPublicUrl
    })

    ;(supabase.from as jest.Mock).mockReturnValue({
      insert: jest.fn().mockResolvedValue({ error: null })
    })

    // Mock global fetch for push notification
    global.fetch = jest.fn().mockResolvedValue({ ok: true })

    await repository.create(data)

    expect(supabase.storage.from).toHaveBeenCalledWith('announcement_media')
    expect(mockUpload).toHaveBeenCalled()
    expect(supabase.from).toHaveBeenCalledWith('announcements')
  })

  it("should cleanup PDFs when deleting an announcement", async () => {
    const annId = "ann-1"
    const mockPdfUrl = "http://storage.com/storage/v1/object/public/announcement_media/announcements/pdfs/test.pdf"

    ;(supabase.from as jest.Mock).mockImplementation((table) => {
      if (table === 'announcements') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({ 
            data: { 
              id: annId, 
              pdf_urls: [mockPdfUrl] 
            }, 
            error: null 
          }),
          delete: jest.fn().mockReturnThis()
        }
      }
      return { delete: jest.fn().mockReturnThis(), eq: jest.fn().mockResolvedValue({ error: null }) }
    })

    const mockRemove = jest.fn().mockResolvedValue({ error: null })
    ;(supabase.storage.from as jest.Mock).mockReturnValue({
      remove: mockRemove
    })

    await repository.delete(annId)

    expect(mockRemove).toHaveBeenCalledWith(['announcements/pdfs/test.pdf'])
  })
})
