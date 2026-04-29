"use client"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { Label } from "@/shared/ui/label"
import { Textarea } from "@/shared/ui/textarea"
import { Switch } from "@/shared/ui/switch"
import { Calendar } from "@/shared/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { CalendarIcon, Loader2, Image as ImageIcon, Music, X, Mic, Square } from "lucide-react"
import { cn } from "@/shared/lib/utils"

interface AnnouncementFormProps {
  initialData?: {
    id: string;
    title: string;
    content: string;
    expires_at?: string;
    image_url?: string;
    image_urls?: string[];
    audio_url?: string;
    audio_urls?: string[];
  }
  onSave: (data: { 
    id?: string;
    title: string; 
    content: string; 
    expires_at: Date | null;
    imageFiles?: File[] | null;
    image_urls?: string[];
    audioFiles?: File[] | null;
    audio_urls?: string[];
  }) => Promise<void>
  onClose: () => void
}

export function AnnouncementForm({ initialData, onSave, onClose }: AnnouncementFormProps) {
  const [title, setTitle] = useState(initialData?.title || "")
  const [content, setContent] = useState(initialData?.content || "")
  const [hasExpiration, setHasExpiration] = useState(!!initialData?.expires_at)
  const [expirationDate, setExpirationDate] = useState<Date | undefined>(
    initialData?.expires_at ? new Date(initialData.expires_at) : undefined
  )
  const [imageFiles, setImageFiles] = useState<File[]>([])
  const [existingImages, setExistingImages] = useState<string[]>(initialData?.image_urls || (initialData?.image_url ? [initialData.image_url] : []))
  
  const [audioFiles, setAudioFiles] = useState<File[]>([])
  const [existingAudios, setExistingAudios] = useState<string[]>(initialData?.audio_urls || (initialData?.audio_url ? [initialData.audio_url] : []))
  
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  const canAddMoreImages = (existingImages.length + imageFiles.length) < 3
  const canAddMoreAudios = (existingAudios.length + audioFiles.length) < 3

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title || !content) return

    setIsSubmitting(true)
    try {
      await onSave({
        id: initialData?.id,
        title,
        content,
        expires_at: hasExpiration ? (expirationDate || null) : null,
        imageFiles: imageFiles.length > 0 ? imageFiles : null,
        image_urls: existingImages,
        audioFiles: audioFiles.length > 0 ? audioFiles : null,
        audio_urls: existingAudios
      })
      onClose()
    } catch (error) {
      console.error("Erro ao salvar aviso:", error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    const remainingSlots = 3 - (existingImages.length + imageFiles.length)
    if (files.length > 0) {
      setImageFiles(prev => [...prev, ...files.slice(0, remainingSlots)])
    }
  }

  const handleAudioChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    const remainingSlots = 3 - (existingAudios.length + audioFiles.length)
    if (files.length > 0) {
      setAudioFiles(prev => [...prev, ...files.slice(0, remainingSlots)])
    }
  }

  const removeExistingImage = (url: string) => {
    setExistingImages(prev => prev.filter(u => u !== url))
  }

  const removeNewImage = (index: number) => {
    setImageFiles(prev => prev.filter((_, i) => i !== index))
  }

  const removeExistingAudio = (url: string) => {
    setExistingAudios(prev => prev.filter(u => u !== url))
  }

  const removeNewAudio = (index: number) => {
    setAudioFiles(prev => prev.filter((_, i) => i !== index))
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        } 
      })
      
      // Tentar usar um bitrate maior se o navegador suportar
      const options = { audioBitsPerSecond: 128000 }
      const mediaRecorder = new MediaRecorder(stream, options)
      mediaRecorderRef.current = mediaRecorder
      chunksRef.current = []

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(chunksRef.current, { type: mediaRecorder.mimeType })
        const fileExt = mediaRecorder.mimeType.includes('mp4') ? 'mp4' : 'webm'
        const file = new File([audioBlob], `gravacao-${Date.now()}.${fileExt}`, { type: mediaRecorder.mimeType })
        
        setAudioFiles(prev => {
          const remainingSlots = 3 - (existingAudios.length + prev.length)
          if (remainingSlots > 0) return [...prev, file]
          return prev
        })

        // Parar todos os tracks do stream
        stream.getTracks().forEach(track => track.stop())
      }

      mediaRecorder.start()
      setIsRecording(true)
      setRecordingTime(0)
      
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1)
      }, 1000)

    } catch (err) {
      console.error("Erro ao acessar microfone:", err)
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  return (
    <form onSubmit={handleSubmit} className="space-y-6 pt-4 text-stone-900">
      <div className="space-y-2">
        <Label htmlFor="title" className="text-stone-700">Título do Aviso</Label>
        <Input
          id="title"
          placeholder="Ex: Reunião Geral"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          className="border-stone-600 focus-visible:ring-stone-400 font-medium"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="content" className="text-stone-700">Conteúdo</Label>
        <Textarea
          id="content"
          placeholder="Descreva o aviso aqui..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
          required
          className="min-h-[120px] border-stone-600 focus-visible:ring-stone-400 font-medium"
        />
      </div>

      <div className="space-y-3">
        <Label className="text-stone-700">Imagens (Até 3)</Label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {/* Imagens Existentes */}
          {existingImages.map((url, idx) => (
            <div key={`existing-img-${idx}`} className="relative group aspect-square rounded-lg border-2 border-stone-100 overflow-hidden bg-stone-50">
              <img src={url} alt="Anexo" className="w-full h-full object-cover" />
              <button 
                onClick={(e) => { e.preventDefault(); removeExistingImage(url); }}
                className="absolute top-1 right-1 rounded-full bg-red-500 p-1 text-white shadow-sm opacity-90 hover:opacity-100 transition-opacity"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}

          {/* Novas Imagens */}
          {imageFiles.map((file, idx) => (
            <div key={`new-img-${idx}`} className="relative group aspect-square rounded-lg border-2 border-green-200 overflow-hidden bg-green-50/30">
              <img src={URL.createObjectURL(file)} alt="Preview" className="w-full h-full object-cover" />
              <button 
                onClick={(e) => { e.preventDefault(); removeNewImage(idx); }}
                className="absolute top-1 right-1 rounded-full bg-stone-800 p-1 text-white shadow-sm opacity-90 hover:opacity-100 transition-opacity"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}

          {/* Botão de Adicionar Imagem */}
          {canAddMoreImages && (
            <div className="relative aspect-square">
              <input
                type="file"
                id="image-upload"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleImageChange}
              />
              <Label
                htmlFor="image-upload"
                className="flex flex-col items-center justify-center h-full w-full rounded-lg border-2 border-dashed border-stone-500 bg-white cursor-pointer transition-all hover:bg-stone-50"
              >
                <ImageIcon className="h-6 w-6 text-stone-600" />
                <span className="text-[10px] text-stone-600 font-black mt-1 uppercase tracking-wider">Adicionar</span>
              </Label>
            </div>
          )}
        </div>
      </div>

      {/* Upload de Áudio */}
      <div className="space-y-3">
        <Label className="text-stone-700">Áudios (Até 3)</Label>
        <div className="space-y-2">
          {/* Áudios Existentes */}
          {existingAudios.map((url, idx) => (
            <div key={`existing-audio-${idx}`} className="flex items-center justify-between gap-3 rounded-lg border-2 border-stone-100 p-3 bg-stone-50">
              <div className="flex items-center gap-2 overflow-hidden">
                <Music className="h-5 w-5 text-stone-400" />
                <span className="text-xs font-medium truncate text-stone-700">
                  Áudio salvo {idx + 1}
                </span>
              </div>
              <button 
                onClick={(e) => { e.preventDefault(); removeExistingAudio(url); }}
                className="rounded-full bg-stone-800 p-1 text-white hover:bg-stone-900 transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}

          {/* Novos Áudios */}
          {audioFiles.map((file, idx) => (
            <div key={`new-audio-${idx}`} className="flex items-center justify-between gap-3 rounded-lg border-2 border-green-200 p-3 bg-green-50/30">
              <div className="flex items-center gap-2 overflow-hidden">
                <Music className="h-5 w-5 text-green-600" />
                <span className="text-xs font-medium truncate text-stone-700">
                  {file.name}
                </span>
              </div>
              <button 
                onClick={(e) => { e.preventDefault(); removeNewAudio(idx); }}
                className="rounded-full bg-stone-800 p-1 text-white hover:bg-stone-900 transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}

          {/* Botões de Ação de Áudio */}
          {canAddMoreAudios && (
            <div className="flex gap-2">
              {/* Botão de Gravar */}
              <button
                type="button"
                onClick={isRecording ? stopRecording : startRecording}
                className={cn(
                  "flex items-center justify-center w-14 h-14 rounded-lg border-2 border-stone-800 transition-all active:scale-95",
                  isRecording ? "bg-red-50 border-red-500" : "bg-white"
                )}
                title={isRecording ? "Parar Gravação" : "Gravar Áudio"}
              >
                {isRecording ? (
                  <div className="flex flex-col items-center">
                    <Square className="h-5 w-5 text-red-500 fill-red-500" />
                    <span className="text-[10px] font-black text-red-500 mt-0.5">{formatTime(recordingTime)}</span>
                  </div>
                ) : (
                  <Mic className="h-6 w-6 text-red-500" />
                )}
              </button>

              {/* Botão de Adicionar Arquivo */}
              <div className="flex-1 relative">
                <input
                  type="file"
                  id="audio-upload"
                  accept="audio/*"
                  multiple
                  className="hidden"
                  onChange={handleAudioChange}
                />
                <Label
                  htmlFor="audio-upload"
                  className="flex items-center justify-center gap-2 h-full rounded-lg border-2 border-dashed border-stone-500 bg-white cursor-pointer transition-all hover:bg-stone-50"
                >
                  <Music className="h-5 w-5 text-stone-600" />
                  <span className="text-[10px] text-stone-600 font-black uppercase tracking-wider">Adicionar Áudio</span>
                </Label>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-4 rounded-lg border border-stone-100 bg-stone-50/50 p-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="text-stone-800">Data de Expiração</Label>
            <p className="text-[10px] text-stone-500">O aviso sumirá automaticamente após esta data</p>
          </div>
          <Switch
            checked={hasExpiration}
            onCheckedChange={setHasExpiration}
          />
        </div>

        {hasExpiration && (
          <div className="pt-2 animate-in fade-in slide-in-from-top-1">
            <Popover>
              <PopoverTrigger
                render={
                  <Button 
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-bold border-stone-600",
                      !expirationDate && "text-stone-500"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {expirationDate ? format(expirationDate, "PPP", { locale: ptBR }) : <span>Selecione a data</span>}
                  </Button>
                }
              />
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={expirationDate}
                  onSelect={setExpirationDate}
                  initialFocus
                  locale={ptBR}
                  disabled={(date) => date < new Date()}
                />
              </PopoverContent>
            </Popover>
          </div>
        )}
      </div>

      <div className="flex gap-3 pt-2">
        <Button
          type="button"
          variant="ghost"
          className="flex-1 text-stone-500 hover:bg-stone-100"
          onClick={onClose}
          disabled={isSubmitting}
        >
          Cancelar
        </Button>
        <Button
          type="submit"
          disabled={isSubmitting}
          className="flex-1 bg-stone-800 hover:bg-stone-900 text-white"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Salvando...
            </>
          ) : (
            initialData ? "Salvar Alterações" : "Publicar Aviso"
          )}
        </Button>
      </div>
    </form>
  )
}
