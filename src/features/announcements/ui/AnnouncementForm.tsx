"use client"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { Label } from "@/shared/ui/label"
import { Textarea } from "@/shared/ui/textarea"
import { Switch } from "@/shared/ui/switch"
import { Calendar } from "@/shared/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover"
import { format, isValid } from "date-fns"
import { ptBR } from "date-fns/locale"
import { CalendarIcon, Loader2, Image as ImageIcon, Music, X, Mic, Square, FileText } from "lucide-react"
import { cn } from "@/shared/lib/utils"

interface AnnouncementFormProps {
  initialData?: {
    id: string;
    title: string;
    content: string;
    expiresAt?: string;
    imageUrls?: string[];
    audioUrls?: string[];
    pdfUrls?: string[];
  }
  onSave: (data: { 
    id?: string;
    title: string; 
    content: string; 
    expiresAt: Date | null;
    imageFiles?: File[] | null;
    imageUrls?: string[];
    audioFiles?: File[] | null;
    audioUrls?: string[];
    pdfFiles?: File[] | null;
    pdfUrls?: string[];
  }) => Promise<void>
  onClose: () => void
}

export function AnnouncementForm({ initialData, onSave, onClose }: AnnouncementFormProps) {
  const [title, setTitle] = useState(initialData?.title || "")
  const [content, setContent] = useState(initialData?.content || "")
  const [hasExpiration, setHasExpiration] = useState(!!initialData?.expiresAt)
  const [expirationDate, setExpirationDate] = useState<Date | undefined>(
    initialData?.expiresAt ? new Date(initialData.expiresAt) : undefined
  )
  const [imageFiles, setImageFiles] = useState<File[]>([])
  const [existingImages, setExistingImages] = useState<string[]>(initialData?.imageUrls || [])
  
  const [audioFiles, setAudioFiles] = useState<File[]>([])
  const [existingAudios, setExistingAudios] = useState<string[]>(initialData?.audioUrls || [])

  const [pdfFiles, setPdfFiles] = useState<File[]>([])
  const [existingPdfs, setExistingPdfs] = useState<string[]>(initialData?.pdfUrls || [])
  
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  const canAddMoreImages = (existingImages.length + imageFiles.length) < 3
  const canAddMoreAudios = (existingAudios.length + audioFiles.length) < 3
  const canAddMorePdfs = (existingPdfs.length + pdfFiles.length) < 3

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title || !content) return

    setIsSubmitting(true)
    try {
      await onSave({
        id: initialData?.id,
        title,
        content,
        expiresAt: hasExpiration ? (expirationDate || null) : null,
        imageFiles: imageFiles.length > 0 ? imageFiles : null,
        imageUrls: existingImages,
        audioFiles: audioFiles.length > 0 ? audioFiles : null,
        audioUrls: existingAudios,
        pdfFiles: pdfFiles.length > 0 ? pdfFiles : null,
        pdfUrls: existingPdfs
      })
      clearDraft()
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

  const handlePdfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return

    // No mobile, o f.type pode vir vazio. Vamos ser mais flexíveis.
    const validPdfs = files.filter(f => {
      const isPdfType = f.type === 'application/pdf';
      const isPdfExt = f.name.toLowerCase().endsWith('.pdf');
      return isPdfType || isPdfExt || f.type === ''; // Aceita mesmo se o tipo for desconhecido, confiando no seletor do SO
    })
    
    if (validPdfs.length === 0) {
      toast.error("O arquivo selecionado não parece ser um PDF válido.");
      return;
    }

    const remainingSlots = 3 - (existingPdfs.length + pdfFiles.length)
    if (validPdfs.length > 0) {
      setPdfFiles(prev => [...prev, ...validPdfs.slice(0, remainingSlots)])
      toast.success(`${validPdfs.length} PDF(s) anexado(s)`);
    }
    e.target.value = ''
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

  const removeExistingPdf = (url: string) => {
    setExistingPdfs(prev => prev.filter(u => u !== url))
  }

  const removeNewPdf = (index: number) => {
    setPdfFiles(prev => prev.filter((_, i) => i !== index))
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

  // Carregar rascunho ao montar
  useEffect(() => {
    const savedDraft = localStorage.getItem('announcement_draft');
    if (savedDraft && !initialData) {
      try {
        const { title: dTitle, content: dContent } = JSON.parse(savedDraft);
        if (dTitle && !title) setTitle(dTitle);
        if (dContent && !content) setContent(dContent);
      } catch (e) {
        console.error("Erro ao carregar rascunho", e);
      }
    }
  }, [initialData]);

  // Salvar rascunho ao alterar campos
  useEffect(() => {
    if (!initialData && (title || content)) {
      localStorage.setItem('announcement_draft', JSON.stringify({ title, content }));
    }
  }, [title, content, initialData]);

  const clearDraft = () => localStorage.removeItem('announcement_draft');

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

      {/* Seção de Anexos: Imagens */}
      <div className="space-y-3">
        <Label className="text-stone-700">Imagens</Label>
        <div className="flex flex-wrap gap-2">
          {/* Imagens Existentes */}
          {existingImages.map((url, idx) => (
            <div key={`existing-img-${idx}`} className="relative h-16 w-16 rounded-md border border-stone-200 overflow-hidden bg-stone-50">
              <img src={url} alt="Anexo" className="w-full h-full object-cover" />
              <button 
                onClick={(e) => { e.preventDefault(); removeExistingImage(url); }}
                className="absolute -top-1 -right-1 rounded-full bg-red-500 p-0.5 text-white shadow-sm"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </div>
          ))}

          {/* Novas Imagens */}
          {imageFiles.map((file, idx) => (
            <div key={`new-img-${idx}`} className="relative h-16 w-16 rounded-md border border-green-200 overflow-hidden bg-green-50/30">
              <img src={URL.createObjectURL(file)} alt="Preview" className="w-full h-full object-cover" />
              <button 
                onClick={(e) => { e.preventDefault(); removeNewImage(idx); }}
                className="absolute -top-1 -right-1 rounded-full bg-stone-800 p-0.5 text-white shadow-sm"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </div>
          ))}

          {/* Botão Minimalista de Adicionar Imagem */}
          {canAddMoreImages && (
            <div className="h-16 w-16">
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
                className="flex flex-col items-center justify-center h-full w-full rounded-md border border-dashed border-stone-400 bg-white cursor-pointer transition-all hover:bg-stone-50 hover:border-stone-600 active:bg-stone-100"
              >
                <ImageIcon className="h-5 w-5 text-stone-500" />
                <span className="text-[8px] text-stone-500 font-bold mt-0.5 uppercase">Add</span>
              </Label>
            </div>
          )}
        </div>
      </div>

      {/* Upload de Áudio e PDF (Lado a Lado ou Minimalista) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Áudios */}
        <div className="space-y-2">
          <Label className="text-stone-700">Áudios</Label>
          <div className="space-y-1.5">
            {existingAudios.map((url, idx) => (
              <div key={`existing-audio-${idx}`} className="flex items-center justify-between gap-2 rounded-md border border-stone-200 p-2 bg-stone-50">
                <div className="flex items-center gap-1.5 overflow-hidden">
                  <Music className="h-3.5 w-3.5 text-stone-400" />
                  <span className="text-[10px] font-medium truncate text-stone-600">Audio {idx + 1}</span>
                </div>
                <button onClick={(e) => { e.preventDefault(); removeExistingAudio(url); }} className="text-stone-400 hover:text-red-500"><X className="h-3 w-3" /></button>
              </div>
            ))}
            {audioFiles.map((file, idx) => (
              <div key={`new-audio-${idx}`} className="flex items-center justify-between gap-2 rounded-md border border-green-200 p-2 bg-green-50/30">
                <div className="flex items-center gap-1.5 overflow-hidden">
                  <Music className="h-3.5 w-3.5 text-green-600" />
                  <span className="text-[10px] font-medium truncate text-stone-600">{file.name}</span>
                </div>
                <button onClick={(e) => { e.preventDefault(); removeNewAudio(idx); }} className="text-stone-400 hover:text-red-500"><X className="h-3 w-3" /></button>
              </div>
            ))}
            {canAddMoreAudios && (
              <div className="flex gap-1.5 h-10">
                <button
                  type="button"
                  onClick={isRecording ? stopRecording : startRecording}
                  className={cn(
                    "flex items-center justify-center w-10 h-10 rounded-md border border-stone-800 transition-all",
                    isRecording ? "bg-red-50 border-red-500" : "bg-white"
                  )}
                >
                  {isRecording ? <Square className="h-4 w-4 text-red-500 fill-red-500" /> : <Mic className="h-4 w-4 text-red-500" />}
                </button>
                <div className="flex-1 relative">
                  <input type="file" id="audio-upload" accept="audio/*" className="hidden" onChange={handleAudioChange} />
                  <Label 
                    htmlFor="audio-upload" 
                    className="flex items-center justify-center h-full rounded-md border border-dashed border-stone-400 bg-white cursor-pointer text-[10px] font-bold text-stone-500 uppercase hover:bg-stone-50 active:bg-stone-100"
                  >
                    Audio
                  </Label>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* PDFs */}
        <div className="space-y-2">
          <Label className="text-stone-700">Documentos (PDF)</Label>
          <div className="space-y-1.5">
            {existingPdfs.map((url, idx) => (
              <div key={`existing-pdf-${idx}`} className="flex items-center justify-between gap-2 rounded-md border border-stone-200 p-2 bg-stone-50">
                <div className="flex items-center gap-1.5 overflow-hidden">
                  <FileText className="h-3.5 w-3.5 text-stone-400" />
                  <span className="text-[10px] font-medium truncate text-stone-600">Doc {idx + 1}</span>
                </div>
                <button onClick={(e) => { e.preventDefault(); removeExistingPdf(url); }} className="text-stone-400 hover:text-red-500"><X className="h-3 w-3" /></button>
              </div>
            ))}
            {pdfFiles.map((file, idx) => (
              <div key={`new-pdf-${idx}`} className="flex items-center justify-between gap-2 rounded-md border border-green-200 p-2 bg-green-50/30">
                <div className="flex items-center gap-1.5 overflow-hidden">
                  <FileText className="h-3.5 w-3.5 text-blue-600" />
                  <span className="text-[10px] font-medium truncate text-stone-600">{file.name}</span>
                </div>
                <button onClick={(e) => { e.preventDefault(); removeNewPdf(idx); }} className="text-stone-400 hover:text-red-500"><X className="h-3 w-3" /></button>
              </div>
            ))}
            {canAddMorePdfs && (
              <div className="h-10">
                <input 
                  type="file" 
                  id="pdf-upload" 
                  accept=".pdf,application/pdf" 
                  className="hidden" 
                  onChange={handlePdfChange} 
                  multiple 
                />
                <Label 
                  htmlFor="pdf-upload" 
                  className="flex items-center justify-center h-full rounded-md border border-dashed border-stone-400 bg-white cursor-pointer text-[10px] font-bold text-stone-500 uppercase hover:bg-stone-50 active:bg-stone-100"
                >
                  Anexar PDF
                </Label>
              </div>
            )}
          </div>
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
                    {expirationDate && isValid(expirationDate) ? format(expirationDate, "PPP", { locale: ptBR }) : <span>Selecione a data</span>}
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
          onClick={() => {
            clearDraft();
            onClose();
          }}
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

