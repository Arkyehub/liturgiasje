"use client"

import { useState, useRef, useEffect, useCallback, useId } from "react"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { Textarea } from "@/shared/ui/textarea"
import { Label } from "@/shared/ui/label"
import { Switch } from "@/shared/ui/switch"
import { Calendar } from "@/shared/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover"
import { format, isValid } from "date-fns"
import { ptBR } from "date-fns/locale"
import {
  CalendarIcon, Loader2, Image as ImageIcon,
  Music, X, Mic, Square, FileText, Trash2
} from "lucide-react"
import { cn, getFileType } from "@/shared/lib/utils"
import { toast } from "sonner"
import { useAnnouncementStore } from "../store/useAnnouncementStore"
import { storageService } from "@/shared/api/storage"
import { AnnouncementType } from "@/domain/models/Announcement"

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface InitialData {
  id: string
  title: string
  content: string
  expiresAt?: string
  imageUrls?: string[]
  audioUrls?: string[]
  pdfUrls?: string[]
  isPublished?: boolean
}

interface SavePayload {
  id?: string
  title: string
  content: string
  type?: AnnouncementType
  expiresAt: Date | null
  imageUrls?: string[]
  audioUrls?: string[]
  pdfUrls?: string[]
  isPublished?: boolean
}

interface AnnouncementFormProps {
  initialData?: InitialData
  onSave: (data: SavePayload) => Promise<void>
  onClose: () => void
}

// ─── Sub-componente: FilePickerButton ────────────────────────────────────────
// Usa a abordagem clássica Label + input[type=file][className="hidden"]
// que é a mais compatível com Android Chrome e todos os browsers mobile.

interface FilePickerButtonProps {
  accept: string
  multiple?: boolean
  disabled?: boolean
  onChange: (files: File[]) => void
  children: React.ReactNode
  className?: string
}

function FilePickerButton({
  accept, multiple = false, disabled = false, onChange, children, className
}: FilePickerButtonProps) {
  // useId garante um ID único mesmo com múltiplos FilePickerButtons na tela
  const id = useId()

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (files.length > 0) onChange(files)
    // Limpar para permitir selecionar o mesmo arquivo novamente
    e.target.value = ""
  }, [onChange])

  return (
    <>
      {/* Input escondido — abordagem clássica que funciona em todos os browsers */}
      <input
        type="file"
        id={id}
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        onChange={handleChange}
        className="hidden"
      />
      {/* Label vinculado — o clique/toque aqui abre o seletor nativamente */}
      <Label
        htmlFor={id}
        className={cn("cursor-pointer", className)}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </Label>
    </>
  )
}

// ─── Sub-componente: AttachmentItem ──────────────────────────────────────────

interface AttachmentItemProps {
  label: string
  icon: React.ReactNode
  isNew?: boolean
  onRemove: () => void
}

function AttachmentItem({ label, icon, isNew = false, onRemove }: AttachmentItemProps) {
  return (
    <div className={cn(
      "flex items-center justify-between gap-2 rounded-md border p-2",
      isNew ? "border-green-200 bg-green-50/30" : "border-stone-200 bg-stone-50"
    )}>
      <div className="flex items-center gap-1.5 overflow-hidden">
        {icon}
        <span className="truncate text-[10px] font-medium text-stone-600">
          {label.startsWith('http') ? 'Anexo' : label}
        </span>
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="flex-shrink-0 text-stone-400 transition-colors hover:text-red-500"
        aria-label={`Remover anexo`}
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  )
}

// ─── Sub-componente: ImagePreview ─────────────────────────────────────────────

interface ImagePreviewProps {
  src: string
  isNew?: boolean
  onRemove: () => void
}

function ImagePreview({ src, isNew = false, onRemove }: ImagePreviewProps) {
  return (
    <div className="relative h-16 w-16">
      <div className={cn(
        "h-full w-full overflow-hidden rounded-md border",
        isNew ? "border-green-200" : "border-stone-200"
      )}>
        <img src={src} alt="Anexo" className="h-full w-full object-cover" />
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="absolute -right-2 -top-2 rounded-full bg-red-500 p-1 text-white shadow-md transition-all hover:bg-red-600 hover:scale-110 active:scale-95 z-10"
        aria-label="Remover imagem"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  )
}

interface AudioPreviewProps {
  url: string
  onRemove: () => void
}

function AudioPreview({ url, onRemove }: AudioPreviewProps) {
  const fileName = url.split('/').pop()?.split('?')[0] || 'Áudio'
  const decodedName = decodeURIComponent(fileName).split('-').slice(1).join('-') || fileName

  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-stone-200 bg-stone-50 p-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 overflow-hidden">
          <Music className="h-3.5 w-3.5 flex-shrink-0 text-stone-400" />
          <span className="truncate text-[10px] font-medium text-stone-600" title={decodedName}>
            {decodedName}
          </span>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="flex-shrink-0 text-stone-400 transition-colors hover:text-red-500"
          aria-label="Remover áudio"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
      <audio controls src={url} className="mt-1 h-8 w-full" preload="metadata" />
    </div>
  )
}

interface PDFPreviewProps {
  url: string
  onRemove: () => void
}

function PDFPreview({ url, onRemove }: PDFPreviewProps) {
  const fileType = getFileType(url)
  const fileName = url.split('/').pop()?.split('?')[0] || 'Documento'
  const decodedName = decodeURIComponent(fileName).split('-').slice(1).join('-') || fileName

  // Cores dinâmicas para a tag baseadas no tipo
  const tagColors: Record<string, string> = {
    pdf: "bg-red-600",
    ppt: "bg-orange-600",
    pptx: "bg-orange-600",
    doc: "bg-blue-600",
    docx: "bg-blue-600",
    xls: "bg-green-600",
    xlsx: "bg-green-600"
  };
  
  const tagColorClass = tagColors[fileType] || "bg-stone-600";

  return (
    <div className="relative h-20 w-20">
      <div className="h-full w-full overflow-hidden rounded-xl border border-stone-200 bg-stone-50 flex flex-col items-center justify-center p-1">
        <FileText className="h-8 w-8 text-stone-300" />
        {/* Tag Dinâmica - Alinhada à Esquerda conforme solicitado */}
        <div className={cn(
          "absolute top-1.5 left-1.5 text-white text-[7px] font-black px-1.5 py-0.5 rounded shadow-sm",
          tagColorClass
        )}>
          {fileType.toUpperCase()}
        </div>
        <span className="mt-1 w-full truncate text-center text-[8px] font-bold text-stone-500 px-1 leading-tight">
          {decodedName}
        </span>
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="absolute -right-2 -top-2 rounded-full bg-red-500 p-1 text-white shadow-md transition-all hover:bg-red-600 hover:scale-110 active:scale-95 z-10 border-2 border-white"
        aria-label={`Remover ${fileType.toUpperCase()}`}
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  )
}

// ─── Hook: useAudioRecorder ───────────────────────────────────────────────────

function useAudioRecorder(onRecordingComplete: (file: File) => void) {
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [])

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
      })
      const mediaRecorder = new MediaRecorder(stream, { audioBitsPerSecond: 128000 })
      mediaRecorderRef.current = mediaRecorder
      chunksRef.current = []

      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mediaRecorder.mimeType })
        const ext = mediaRecorder.mimeType.includes("mp4") ? "mp4" : "webm"
        const file = new File([blob], `gravacao-${Date.now()}.${ext}`, { type: mediaRecorder.mimeType })
        onRecordingComplete(file)
        stream.getTracks().forEach((t) => t.stop())
      }

      mediaRecorder.start()
      setIsRecording(true)
      setRecordingTime(0)
      timerRef.current = setInterval(() => setRecordingTime((t) => t + 1), 1000)
    } catch (err) {
      console.error("Erro ao acessar microfone:", err)
      toast.error("Não foi possível acessar o microfone.")
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }

  return { isRecording, recordingTime, formatTime, startRecording, stopRecording }
}

// ─── Componente Principal: AnnouncementForm ───────────────────────────────────

const MAX_ATTACHMENTS = 3

const sanitizeFilename = (name: string) => {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove acentos
    .replace(/\s+/g, "-") // Substitui espaços por hífens
    .replace(/[^a-zA-Z0-9.\-]/g, "") // Remove caracteres especiais
    .toLowerCase()
}

export function AnnouncementForm({ initialData, onSave, onClose }: AnnouncementFormProps) {
  const {
    editingId, setEditingId,
    title, setTitle,
    content, setContent,
    hasExpiration, setHasExpiration,
    expirationDate, setExpirationDate,
    imageUrls, setImageUrls,
    audioUrls, setAudioUrls,
    pdfUrls, setPdfUrls,
    isPublished, setIsPublished,
    clearDraft
  } = useAnnouncementStore()

  const [isHydrated, setIsHydrated] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [uploadingStatus, setUploadingStatus] = useState({
    images: false,
    audios: false,
    pdfs: false
  })

  // Persistência de rascunho e hidratação
  useEffect(() => {
    setIsHydrated(true)
  }, [])

  // Inicializar store com initialData se estiver editando
  useEffect(() => {
    if (initialData) {
      if (editingId !== initialData.id) {
        setEditingId(initialData.id)
        setTitle(initialData.title)
        setContent(initialData.content)
        setHasExpiration(!!initialData.expiresAt)
        setExpirationDate(initialData.expiresAt ? new Date(initialData.expiresAt) : null)
        setImageUrls(initialData.imageUrls ?? [])
        setAudioUrls(initialData.audioUrls ?? [])
        setPdfUrls(initialData.pdfUrls ?? [])
        setIsPublished(initialData.isPublished ?? true)
      }
    } else if (editingId !== null) {
      // Se não há initialData mas o store tem um ID, estamos vindo de uma edição para um novo
      clearDraft()
    }
  }, [initialData, editingId, setEditingId, setTitle, setContent, setHasExpiration, setExpirationDate, setImageUrls, setAudioUrls, setPdfUrls, clearDraft])

  const expirationDateValue = expirationDate ? new Date(expirationDate) : undefined

  // Gravação de áudio
  const handleRecordingComplete = useCallback(async (file: File) => {
    if (audioUrls.length >= MAX_ATTACHMENTS) return
    
    setUploadingStatus(prev => ({ ...prev, audios: true }))
    try {
      const url = await storageService.uploadFile(file, { path: `announcements/audio/rec-${Date.now()}.webm` })
      setAudioUrls(prev => [...prev, url])
      toast.success("Gravação anexada")
    } catch (error) {
      console.error(error)
      toast.error("Erro ao fazer upload da gravação")
    } finally {
      setUploadingStatus(prev => ({ ...prev, audios: false }))
    }
  }, [audioUrls.length, setAudioUrls])

  const { isRecording, recordingTime, formatTime, startRecording, stopRecording } =
    useAudioRecorder(handleRecordingComplete)

  // ── Handlers de arquivos ────────────────────────────────────────────────────

  const addImages = useCallback(async (files: File[]) => {
    const slots = MAX_ATTACHMENTS - imageUrls.length
    if (slots <= 0) return
    const toAdd = files.slice(0, slots)
    
    setUploadingStatus(prev => ({ ...prev, images: true }))
    try {
      const uploadedUrls = await Promise.all(
        toAdd.map(file => storageService.uploadFile(file, { 
          path: `announcements/images/${Date.now()}-${sanitizeFilename(file.name)}` 
        }))
      )
      setImageUrls(prev => [...prev, ...uploadedUrls])
      toast.success(`${uploadedUrls.length} imagem(ns) anexada(s)`)
    } catch (error) {
      console.error(error)
      toast.error("Erro ao fazer upload das imagens")
    } finally {
      setUploadingStatus(prev => ({ ...prev, images: false }))
    }
  }, [imageUrls.length, setImageUrls])

  const addAudios = useCallback(async (files: File[]) => {
    const slots = MAX_ATTACHMENTS - audioUrls.length
    if (slots <= 0) return
    const toAdd = files.slice(0, slots)

    setUploadingStatus(prev => ({ ...prev, audios: true }))
    try {
      const uploadedUrls = await Promise.all(
        toAdd.map(file => storageService.uploadFile(file, { 
          path: `announcements/audio/${Date.now()}-${sanitizeFilename(file.name)}` 
        }))
      )
      setAudioUrls(prev => [...prev, ...uploadedUrls])
      toast.success(`${uploadedUrls.length} áudio(s) anexado(s)`)
    } catch (error) {
      console.error(error)
      toast.error("Erro ao fazer upload dos áudios")
    } finally {
      setUploadingStatus(prev => ({ ...prev, audios: false }))
    }
  }, [audioUrls.length, setAudioUrls])

  const addPdfs = useCallback(async (files: File[]) => {
    const slots = MAX_ATTACHMENTS - pdfUrls.length
    if (slots <= 0) return
    const toAdd = files.slice(0, slots)

    setUploadingStatus(prev => ({ ...prev, pdfs: true }))
    try {
      const uploadedUrls = await Promise.all(
        toAdd.map(file => storageService.uploadFile(file, { 
          path: `announcements/pdfs/${Date.now()}-${sanitizeFilename(file.name)}` 
        }))
      )
      setPdfUrls(prev => [...prev, ...uploadedUrls])
      toast.success(`${uploadedUrls.length} documento(s) anexado(s)`)
    } catch (error) {
      console.error(error)
      toast.error("Erro ao fazer upload dos documentos")
    } finally {
      setUploadingStatus(prev => ({ ...prev, pdfs: false }))
    }
  }, [pdfUrls.length, setPdfUrls])

  // ── Handlers de remoção de arquivos e Cancelamento ─────────

  const isUrlInDb = (url: string) => {
    if (!initialData) return false
    const allInitialUrls = [
      ...(initialData.imageUrls || []),
      ...(initialData.audioUrls || []),
      ...(initialData.pdfUrls || [])
    ]
    return allInitialUrls.includes(url)
  }

  const handleRemoveUrl = async (url: string, type: 'image' | 'audio' | 'pdf') => {
    // 1. Remove do estado local da UI
    if (type === 'image') setImageUrls((p) => p.filter((u) => u !== url))
    if (type === 'audio') setAudioUrls((p) => p.filter((u) => u !== url))
    if (type === 'pdf') setPdfUrls((p) => p.filter((u) => u !== url))

    // 2. Se a URL não existe no banco (é um arquivo novo do rascunho), apaga fisicamente
    if (!isUrlInDb(url)) {
      const path = storageService.extractPathFromUrl(url.split('?')[0])
      if (path) {
        await storageService.removeFiles([path]).catch(console.error)
      }
    }
  }

  const handleCancel = () => {
    // Remove todos os arquivos subidos que ainda não estão no banco
    const allCurrentUrls = [...imageUrls, ...audioUrls, ...pdfUrls]
    const urlsToDelete = allCurrentUrls.filter((url) => !isUrlInDb(url))
    
    if (urlsToDelete.length > 0) {
      const paths = urlsToDelete
        .map((u) => storageService.extractPathFromUrl(u.split('?')[0]))
        .filter(Boolean) as string[]
      
      if (paths.length > 0) {
        storageService.removeFiles(paths).catch(console.error)
      }
    }

    clearDraft()
    onClose()
  }

  // ── Submit ──────────────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent, isPublishedOverride?: boolean) => {
    e.preventDefault()
    
    if (!title.trim()) {
      toast.error("Por favor, preencha o título do aviso")
      return
    }

    const hasAdditionalContent = content.trim().length > 0 || imageUrls.length > 0 || audioUrls.length > 0 || pdfUrls.length > 0
    if (!hasAdditionalContent) {
      toast.error("O aviso precisa ter uma mensagem ou pelo menos um anexo (imagem, áudio ou documento)")
      return
    }

    if (Object.values(uploadingStatus).some(Boolean)) {
      toast.error("Aguarde o upload dos arquivos terminar")
      return
    }

    const publishedStatus = isPublishedOverride !== undefined ? isPublishedOverride : isPublished

    setIsSubmitting(true)
    try {
      await onSave({
        id: initialData?.id,
        title: title.trim(),
        content: content.trim(),
        expiresAt: hasExpiration ? (expirationDateValue ?? null) : null,
        isPublished: publishedStatus,
        type: 'Aviso',
        imageUrls: imageUrls,
        audioUrls: audioUrls,
        pdfUrls: pdfUrls,
      })
      clearDraft()
      onClose()
    } catch (error) {
      console.error("Erro ao salvar aviso:", error)
      toast.error("Erro ao salvar aviso. Tente novamente.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const canAddImages = imageUrls.length < MAX_ATTACHMENTS
  const canAddAudios = audioUrls.length < MAX_ATTACHMENTS
  const canAddPdfs = pdfUrls.length < MAX_ATTACHMENTS

  const isFormValid = title.trim().length > 0 && (
    content.trim().length > 0 || 
    imageUrls.length > 0 || 
    audioUrls.length > 0 || 
    pdfUrls.length > 0
  )

  // ── Render ──────────────────────────────────────────────────────────────────
  if (!isHydrated) return null

  return (
    <form onSubmit={handleSubmit} className="space-y-6 pt-4 text-stone-900">

      {/* Campos de texto */}
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="ann-title" className="text-stone-700 font-semibold">
            Título do Aviso
          </Label>
          <Input
            id="ann-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="border-stone-300 focus-visible:ring-stone-400 font-medium"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ann-content" className="text-stone-700 font-semibold">
            Mensagem
          </Label>
          <Textarea
            id="ann-content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="min-h-[120px] border-stone-300 focus-visible:ring-stone-400 font-medium"
          />
        </div>
      </div>

      {/* Imagens */}
      <div className="space-y-2">
        <Label className="text-stone-700 font-semibold">
          Imagens{" "}
          <span className="text-xs font-normal text-stone-400">
            ({imageUrls.length}/{MAX_ATTACHMENTS})
          </span>
          {uploadingStatus.images && (
            <Loader2 className="ml-2 h-3 w-3 animate-spin inline text-stone-400" />
          )}
        </Label>
        <div className="flex flex-wrap gap-2">
          {imageUrls.map((url, i) => (
            <ImagePreview
              key={`img-${i}`}
              src={url}
              onRemove={() => handleRemoveUrl(url, 'image')}
            />
          ))}
          {uploadingStatus.images && (
            <div className="flex h-16 w-16 animate-pulse items-center justify-center rounded-md border border-stone-200 bg-stone-100">
              <Loader2 className="h-4 w-4 animate-spin text-stone-300" />
            </div>
          )}
          {canAddImages && (
            <FilePickerButton
              accept="image/*"
              multiple
              onChange={addImages}
              className="flex h-16 w-16 flex-col items-center justify-center rounded-md border border-dashed border-stone-400 bg-white transition-all hover:bg-stone-50 active:bg-stone-100"
            >
              <ImageIcon className="h-5 w-5 text-stone-500" />
              <span className="mt-0.5 text-[8px] font-bold uppercase text-stone-400">Add</span>
            </FilePickerButton>
          )}
        </div>
      </div>

      {/* Áudios e PDFs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">

        {/* Áudios */}
        <div className="space-y-2">
          <Label className="text-stone-700 font-semibold">
            Áudios{" "}
            <span className="text-xs font-normal text-stone-400">
              ({audioUrls.length}/{MAX_ATTACHMENTS})
            </span>
            {uploadingStatus.audios && (
              <Loader2 className="ml-2 h-3 w-3 animate-spin inline text-stone-400" />
            )}
          </Label>
          <div className="space-y-1.5">
            {audioUrls.map((url, i) => (
              <AudioPreview
                key={`audio-${i}`}
                url={url}
                onRemove={() => handleRemoveUrl(url, 'audio')}
              />
            ))}
            {uploadingStatus.audios && (
              <div className="flex h-10 w-full animate-pulse items-center justify-center rounded-md border border-stone-200 bg-stone-50">
                <Loader2 className="h-4 w-4 animate-spin text-stone-300 mr-2" />
                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Enviando áudio...</span>
              </div>
            )}
            {canAddAudios && (
              <div className="flex h-10 gap-1.5">
                <button
                  type="button"
                  onClick={isRecording ? stopRecording : startRecording}
                  className={cn(
                    "flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md border transition-all",
                    isRecording
                      ? "border-red-400 bg-red-50 text-red-500"
                      : "border-stone-300 bg-white text-stone-500 hover:bg-stone-50"
                  )}
                  aria-label={isRecording ? "Parar gravação" : "Gravar áudio"}
                >
                  {isRecording
                    ? <Square className="h-4 w-4 fill-red-500" />
                    : <Mic className="h-4 w-4" />
                  }
                </button>

                {isRecording ? (
                  <div className="flex flex-1 items-center justify-center rounded-md border border-red-200 bg-red-50 text-[11px] font-bold text-red-500">
                    {formatTime(recordingTime)}
                  </div>
                ) : (
                  <FilePickerButton
                    accept="audio/*"
                    onChange={addAudios}
                    className="flex flex-1 items-center justify-center rounded-md border border-dashed border-stone-400 bg-white transition-all hover:bg-stone-50 active:bg-stone-100 h-10"
                  >
                    <span className="text-[10px] font-bold uppercase text-stone-500">
                      Arquivo
                    </span>
                  </FilePickerButton>
                )}
              </div>
            )}
          </div>
        </div>

        {/* PDFs */}
        <div className="space-y-2">
          <Label className="text-stone-700 font-semibold">
            Documentos{" "}
            <span className="text-xs font-normal text-stone-400">
              ({pdfUrls.length}/{MAX_ATTACHMENTS})
            </span>
            {uploadingStatus.pdfs && (
              <Loader2 className="ml-2 h-3 w-3 animate-spin inline text-stone-400" />
            )}
          </Label>
          <div className="flex flex-wrap gap-2">
            {pdfUrls.map((url, i) => (
              <PDFPreview
                key={`pdf-${i}`}
                url={url}
                onRemove={() => handleRemoveUrl(url, 'pdf')}
              />
            ))}
            {uploadingStatus.pdfs && (
              <div className="flex h-20 w-20 animate-pulse items-center justify-center rounded-xl border border-stone-200 bg-stone-50">
                <Loader2 className="h-4 w-4 animate-spin text-stone-300" />
              </div>
            )}
            {canAddPdfs && (
              <FilePickerButton
                accept=".pdf,.doc,.docx,.ppt,.pptx,application/pdf"
                onChange={addPdfs}
                className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-stone-400 bg-white transition-all hover:bg-stone-50 active:bg-stone-100"
              >
                <FileText className="h-5 w-5 text-stone-500" />
                <span className="text-[8px] font-bold uppercase text-stone-400 text-center px-1">
                  Add
                </span>
              </FilePickerButton>
            )}
          </div>
        </div>
      </div>

      {/* Data de Expiração */}
      <div className="rounded-lg border border-stone-100 bg-stone-50/50 p-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="text-stone-800 font-semibold">Data de Expiração</Label>
            <p className="text-[10px] text-stone-500">O aviso sumirá automaticamente após esta data</p>
          </div>
          <Switch checked={hasExpiration} onCheckedChange={setHasExpiration} />
        </div>

        {hasExpiration && (
          <div className="mt-3 animate-in fade-in slide-in-from-top-1">
            <Popover>
              <PopoverTrigger
                render={
                  <Button
                    type="button"
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-semibold border-stone-400",
                      !expirationDate && "text-stone-400"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {expirationDateValue && isValid(expirationDateValue)
                      ? format(expirationDateValue, "PPP", { locale: ptBR })
                      : "Selecione a data"
                    }
                  </Button>
                }
              />
              <PopoverContent className="w-auto p-0 flex flex-col" align="start">
                  <Calendar
                    mode="single"
                    selected={expirationDateValue}
                    onSelect={(date) => setExpirationDate(date ?? null)}
                    initialFocus
                    locale={ptBR}
                    disabled={(date) => date < new Date()}
                  />
                  {expirationDateValue && (
                    <div className="p-1 border-t border-stone-100">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setExpirationDate(null)}
                        className="w-full text-red-500 hover:text-red-600 hover:bg-red-50 font-bold text-[10px] h-8"
                      >
                        <Trash2 className="h-3 w-3 mr-2" />
                        REMOVER DATA
                      </Button>
                    </div>
                  )}
              </PopoverContent>
            </Popover>
          </div>
        )}
      </div>

      {/* Ações */}
      <div className="flex flex-col gap-3 pt-2">
        <div className="flex gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={handleCancel}
            disabled={isSubmitting}
            className="flex-1 border-stone-300 text-stone-500 bg-white hover:bg-stone-50"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={(e) => handleSubmit(e, false)}
            disabled={isSubmitting || !isFormValid}
            className="flex-1 bg-orange-50 text-orange-600 border-orange-200 hover:bg-orange-100 font-bold disabled:opacity-50"
          >
            Salvar Rascunho
          </Button>
        </div>
        
        <Button
          type="button"
          onClick={(e) => handleSubmit(e, true)}
          disabled={isSubmitting || !isFormValid}
          className="w-full bg-green-600 hover:bg-green-700 text-white h-12 text-base font-bold shadow-md active:scale-[0.98] transition-all disabled:opacity-50"
        >
          {isSubmitting
            ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Salvando...</>
            : initialData ? "Salvar e Publicar" : "Publicar Aviso"
          }
        </Button>
      </div>
    </form>
  )
}
