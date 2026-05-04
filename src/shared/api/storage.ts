import { supabase } from "./supabase"

export interface UploadOptions {
  bucket?: string
  path?: string
  contentType?: string
}

export const storageService = {
  /**
   * Faz upload de um arquivo para o Supabase Storage e retorna a URL pública.
   */
  async uploadFile(file: File | Blob, options: UploadOptions = {}): Promise<string> {
    const bucket = options.bucket || 'announcement_media'
    const path = options.path || `uploads/${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
    
    // Determinar content-type se não fornecido
    const uploadOptions: any = { upsert: true }
    if (options.contentType) {
      uploadOptions.contentType = options.contentType
    } else if (file instanceof File) {
      uploadOptions.contentType = file.type
    }

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(path, file, uploadOptions)

    if (uploadError) throw uploadError

    const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(path)
    
    // Adicionar timestamp para evitar cache em alguns browsers se necessário
    return `${publicUrl}?t=${Date.now()}`
  },

  /**
   * Remove arquivos do storage.
   */
  async removeFiles(paths: string[], bucket: string = 'announcement_media'): Promise<void> {
    if (paths.length === 0) return
    const { error } = await supabase.storage.from(bucket).remove(paths)
    if (error) throw error
  }
}
