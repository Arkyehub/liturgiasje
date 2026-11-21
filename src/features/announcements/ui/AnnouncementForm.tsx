"use client"

import { useState, useRef, useEffect, useCallback, useId } from "react"
import { Label } from "@/shared/ui/label"
import { addMonths, format, getDaysInMonth, isSameDay, isValid, startOfMonth } from "date-fns"
import { ptBR } from "date-fns/locale"
import {
  CalendarDays, Check, ChevronLeft, ChevronRight, FileText, Image as ImageIcon,
  Loader2, Mic, Pause, Play, Square, Trash2, Upload, X
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

// ─── Sub-componentes de anexos (visual do design "Novo aviso") ────────────────

interface ImagePreviewProps {
  src: string
  onRemove: () => void
}

function ImagePreview({ src, onRemove }: ImagePreviewProps) {
  return (
    <div className="relative h-[84px] w-[84px] shrink-0">
      <div className="h-full w-full overflow-hidden rounded-2xl border border-[#E9DFCB] bg-[#F4EEDD]">
        <img src={src} alt="Anexo" className="h-full w-full object-cover" />
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-[#B5472A] text-white shadow-sm transition-transform active:scale-95"
        aria-label="Remover imagem"
      >
        <X className="h-3.5 w-3.5" strokeWidth={2.6} />
      </button>
    </div>
  )
}

const formatClock = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) return "--:--"
  const m = Math.floor(seconds / 60)
  const sec = Math.floor(seconds % 60)
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
}

const attachmentName = (url: string, fallback: string) => {
  const raw = url.split("/").pop()?.split("?")[0] || fallback
  let decoded = raw
  try { decoded = decodeURIComponent(raw) } catch { /* mantém o nome original */ }
  return decoded.split("-").slice(1).join("-") || decoded
}

interface AudioPreviewProps {
  url: string
  onRemove: () => void
}

function AudioPreview({ url, onRemove }: AudioPreviewProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(NaN)
  const name = attachmentName(url, "Áudio")
  const progress = Number.isFinite(duration) && duration > 0 ? Math.min(100, (current / duration) * 100) : 0

  const toggle = () => {
    const el = audioRef.current
    if (!el) return
    if (el.paused) el.play().catch(() => toast.error("Não foi possível reproduzir o áudio."))
    else el.pause()
  }

  return (
    <div className="flex items-center gap-2.5 rounded-[14px] border border-[#E9DFCB] bg-[#FAF5E6] py-2.5 pl-2.5 pr-1.5">
      <audio
        ref={audioRef}
        src={url}
        preload="metadata"
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onDurationChange={(e) => setDuration(e.currentTarget.duration)}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setCurrent(0) }}
      />
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "Pausar áudio" : "Ouvir áudio"}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#322113] text-[#FFF8E8]"
      >
        {playing ? <Pause className="h-4 w-4" strokeWidth={2.4} /> : <Play className="h-4 w-4" strokeWidth={2.4} />}
      </button>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="truncate text-sm font-bold text-[#241A10]">{name}</span>
        <span className="block h-1 rounded-full bg-[#E9DFCB]">
          <span className="block h-1 rounded-full bg-[#E8B21E]" style={{ width: `${progress}%` }} />
        </span>
      </div>
      <span className="text-xs font-semibold tabular-nums text-[#6B5D50]">
        {formatClock(playing || current > 0 ? current : duration)}
      </span>
      <button
        type="button"
        onClick={onRemove}
        className="flex h-11 w-11 shrink-0 items-center justify-center text-[#B5472A]"
        aria-label="Remover áudio"
      >
        <Trash2 className="h-[18px] w-[18px]" />
      </button>
    </div>
  )
}

interface PDFPreviewProps {
  url: string
  onRemove: () => void
}

function PDFPreview({ url, onRemove }: PDFPreviewProps) {
  const fileType = getFileType(url)
  const name = attachmentName(url, "Documento")
  const tags: Record<string, string> = {
    pdf: "bg-[#FDEBDD] text-[#B5472A]",
    ppt: "bg-[#FFF3D1] text-[#6B3F00]",
    pptx: "bg-[#FFF3D1] text-[#6B3F00]",
    doc: "bg-[#E4EEF9] text-[#1F5A99]",
    docx: "bg-[#E4EEF9] text-[#1F5A99]",
    xls: "bg-[#E6F3EB] text-[#1E6B43]",
    xlsx: "bg-[#E6F3EB] text-[#1E6B43]",
  }
  return (
    <div className="flex items-center gap-2.5 rounded-[14px] border border-[#E9DFCB] bg-[#FAF5E6] py-2.5 pl-2.5 pr-1.5">
      <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] text-[11px] font-extrabold", tags[fileType] || "bg-[#F4EEDD] text-[#6B5D50]")}>
        {fileType.toUpperCase().slice(0, 4)}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-bold text-[#241A10]">{name}</span>
      <button
        type="button"
        onClick={onRemove}
        className="flex h-11 w-11 shrink-0 items-center justify-center text-[#B5472A]"
        aria-label={`Remover ${fileType.toUpperCase()}`}
      >
        <Trash2 className="h-[18px] w-[18px]" />
      </button>
    </div>
  )
}

// Calendário de validade: sem dias passados (hoje também fica de fora, como antes)
function ExpiryCalendar({ value, onSelect }: { value?: Date; onSelect: (d: Date) => void }) {
  const [view, setView] = useState(() => startOfMonth(value && isValid(value) ? value : new Date()))
  const now = new Date()
  const year = view.getFullYear()
  const month = view.getMonth()
  const firstDow = view.getDay()
  const days = Array.from({ length: getDaysInMonth(view) }, (_, i) => i + 1)
  const canGoBack = view > startOfMonth(now)

  return (
    <div className="space-y-2 rounded-[18px] border border-[#E9DFCB] bg-white p-2.5">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setView(addMonths(view, -1))}
          disabled={!canGoBack}
          aria-label="Mês anterior"
          className="flex h-11 w-11 items-center justify-center rounded-full text-[#322113] disabled:opacity-30"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <span className="text-[15px] font-extrabold capitalize text-[#241A10]">{format(view, "MMMM yyyy", { locale: ptBR })}</span>
        <button
          type="button"
          onClick={() => setView(addMonths(view, 1))}
          aria-label="Próximo mês"
          className="flex h-11 w-11 items-center justify-center rounded-full text-[#322113]"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"].map((d, i) => (
          <span key={d} className={cn("pb-1 text-center text-[11px] font-bold tracking-[0.06em]", i === 0 ? "text-[#322113]" : "text-[#6B5D50]")}>{d}</span>
        ))}
        {Array.from({ length: firstDow }).map((_, i) => <span key={`e${i}`} />)}
        {days.map((day) => {
          const date = new Date(year, month, day)
          const disabled = date < now
          const selected = !!value && isSameDay(date, value)
          return (
            <button
              key={day}
              type="button"
              disabled={disabled}
              aria-label={`${day} de ${format(date, "MMMM", { locale: ptBR })}`}
              aria-pressed={selected}
              onClick={() => onSelect(date)}
              className={cn(
                "flex h-[46px] items-center justify-center rounded-xl border text-[15px] transition-all active:scale-95",
                selected
                  ? "border-[#322113] bg-[#322113] font-extrabold text-[#FFF8E8]"
                  : disabled
                    ? "border-transparent font-semibold text-[#B8A98E]"
                    : "border-[#E9DFCB] bg-white font-semibold text-[#241A10]"
              )}
            >
              {day}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function FieldLabel({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between px-0.5">
      <span className="text-xs font-bold text-[#6B5D50]">{children}</span>
      {right && <span className="text-xs font-semibold text-[#6B5D50]">{right}</span>}
    </div>
  )
}

function StepTitle({ n, children, optional }: { n: number; children: React.ReactNode; optional?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-[#E8B21E] text-[13px] font-extrabold text-[#322113]">{n}</span>
      <h2 className="text-lg font-extrabold text-[#241A10]">{children}</h2>
      {optional && <span className="rounded-full bg-[#F4EEDD] px-2.5 py-0.5 text-xs font-bold text-[#6B5D50]">opcional</span>}
    </div>
  )
}

const OUTLINE_BTN = "flex h-12 items-center justify-center gap-2 rounded-[14px] border border-[#D9CDB8] bg-white px-3.5 text-sm font-bold text-[#322113] active:bg-[#FAF5E6]"

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

    if (hasExpiration && !(expirationDateValue && isValid(expirationDateValue))) {
      toast.error("Escolha a data de validade ou desligue a opção \"Sumir do mural sozinho\"")
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

  const isUploading = Object.values(uploadingStatus).some(Boolean)
  const hasTitle = title.trim().length > 0
  const hasBody = content.trim().length > 0 || imageUrls.length > 0 || audioUrls.length > 0 || pdfUrls.length > 0
  const missingExpiryDate = hasExpiration && !(expirationDateValue && isValid(expirationDateValue))

  const isFormValid = hasTitle && hasBody
  const canPublish = isFormValid && !missingExpiryDate && !isUploading && !isSubmitting
  const canDraft = isFormValid && !isUploading && !isSubmitting

  let footerSummary: React.ReactNode
  if (isUploading) footerSummary = "Enviando arquivos… aguarde para publicar."
  else if (!hasTitle && !hasBody) footerSummary = "Escreva um título e uma mensagem (ou anexe algo) para publicar."
  else if (!hasTitle) footerSummary = "Falta o título do aviso."
  else if (!hasBody) footerSummary = "Escreva a mensagem ou anexe algo para publicar."
  else if (missingExpiryDate) footerSummary = <strong className="font-bold text-[#A23F06]">Escolha a data de validade ou desligue a opção.</strong>
  else {
    const parts = [
      imageUrls.length > 0 && `${imageUrls.length} ${imageUrls.length === 1 ? "imagem" : "imagens"}`,
      audioUrls.length > 0 && `${audioUrls.length} ${audioUrls.length === 1 ? "áudio" : "áudios"}`,
      pdfUrls.length > 0 && `${pdfUrls.length} ${pdfUrls.length === 1 ? "documento" : "documentos"}`,
    ].filter(Boolean).join(", ")
    footerSummary = (
      <>
        {initialData && !isPublished ? "Fica como rascunho até você publicar" : "Vai para o mural"}
        {hasExpiration && expirationDateValue && isValid(expirationDateValue) && (
          <> até <strong className="font-bold text-[#241A10]">{format(expirationDateValue, "d 'de' MMMM", { locale: ptBR })}</strong></>
        )}
        {parts && <> · {parts}</>}
      </>
    )
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  if (!isHydrated) return null

  return (
    <form onSubmit={(e) => handleSubmit(e)} className="relative flex h-full min-h-0 flex-col text-[#241A10]">
      <div className="flex-1 space-y-[26px] overflow-y-auto px-4 pb-8 pt-6">

        {/* 1 · Título e mensagem */}
        <div className="space-y-3.5">
          <StepTitle n={1}>O que você quer avisar?</StepTitle>
          {initialData && (
            <span className={cn(
              "inline-block rounded-full px-2.5 py-1 text-xs font-bold",
              isPublished ? "bg-[#E6F3EB] text-[#1E6B43]" : "bg-[#FFF3D1] text-[#6B3F00]"
            )}>
              {isPublished ? "Publicado no mural" : "Rascunho"}
            </span>
          )}
          <div className="space-y-4 rounded-[22px] border border-[#E9DFCB] bg-white p-4">
            <div className="space-y-2">
              <label htmlFor="ann-title" className="px-0.5 text-xs font-bold text-[#6B5D50]">Título</label>
              <input
                id="ann-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex.: Ensaio do coral neste sábado"
                className="h-[52px] w-full rounded-[14px] border border-[#E9DFCB] bg-[#FAF5E6] px-3.5 text-base font-semibold text-[#241A10] outline-none placeholder:font-normal placeholder:text-[#9A8C78] focus:border-[#322113]"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="ann-content" className="px-0.5 text-xs font-bold text-[#6B5D50]">Mensagem</label>
              <textarea
                id="ann-content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Escreva o aviso para a comunidade"
                className="min-h-[140px] w-full resize-y rounded-[14px] border border-[#E9DFCB] bg-[#FAF5E6] p-3.5 text-base font-semibold leading-snug text-[#241A10] outline-none placeholder:font-normal placeholder:text-[#9A8C78] focus:border-[#322113]"
              />
            </div>
          </div>
        </div>

        {/* 2 · Anexos */}
        <div className="space-y-3.5">
          <StepTitle n={2} optional>Anexos</StepTitle>
          <div className="space-y-[18px] rounded-[22px] border border-[#E9DFCB] bg-white p-4">

            <div className="space-y-2.5">
              <FieldLabel right={`${imageUrls.length} de ${MAX_ATTACHMENTS}`}>Imagens</FieldLabel>
              <div className="flex flex-wrap gap-2.5 pt-1.5">
                {imageUrls.map((url, i) => (
                  <ImagePreview key={`img-${i}`} src={url} onRemove={() => handleRemoveUrl(url, 'image')} />
                ))}
                {uploadingStatus.images && (
                  <div className="flex h-[84px] w-[84px] animate-pulse items-center justify-center rounded-2xl border border-[#E9DFCB] bg-[#F4EEDD]">
                    <Loader2 className="h-5 w-5 animate-spin text-[#B8A98E]" />
                  </div>
                )}
                {canAddImages && !uploadingStatus.images && (
                  <FilePickerButton
                    accept="image/*"
                    multiple
                    onChange={addImages}
                    className="flex h-[84px] w-[84px] flex-col items-center justify-center gap-1 rounded-2xl border-[1.5px] border-dashed border-[#C9B99C] text-[#322113]"
                  >
                    <ImageIcon className="h-[22px] w-[22px]" strokeWidth={2} />
                    <span className="text-xs font-bold">Foto</span>
                  </FilePickerButton>
                )}
              </div>
            </div>

            <div className="h-px bg-[#F1EADC]" />

            <div className="space-y-2.5">
              <FieldLabel right={`${audioUrls.length} de ${MAX_ATTACHMENTS}`}>Áudios</FieldLabel>
              {audioUrls.map((url, i) => (
                <AudioPreview key={`audio-${i}`} url={url} onRemove={() => handleRemoveUrl(url, 'audio')} />
              ))}
              {uploadingStatus.audios && (
                <div className="flex h-12 animate-pulse items-center justify-center gap-2 rounded-[14px] border border-[#E9DFCB] bg-[#FAF5E6] text-xs font-bold text-[#6B5D50]">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Enviando áudio…
                </div>
              )}
              {isRecording && (
                <div className="flex items-center gap-3 rounded-[14px] border border-[#F2CDB0] bg-[#FDEBDD] p-2.5" role="status" aria-label="Gravando áudio">
                  <span aria-hidden="true" className="ml-1 h-3 w-3 animate-pulse rounded-full bg-[#D43F1F] shadow-[0_0_0_5px_rgba(212,63,31,0.18)]" />
                  <span className="flex-1 text-sm font-bold text-[#6B2A02]">Gravando…</span>
                  <span className="text-lg font-extrabold tabular-nums text-[#6B2A02]">{formatTime(recordingTime)}</span>
                  <button
                    type="button"
                    onClick={stopRecording}
                    aria-label="Parar gravação"
                    className="flex h-11 items-center gap-1.5 rounded-xl bg-[#A23F06] px-3.5 text-sm font-extrabold text-white"
                  >
                    <Square className="h-3.5 w-3.5 fill-white" />
                    Parar
                  </button>
                </div>
              )}
              {canAddAudios && !isRecording && !uploadingStatus.audios && (
                <div className="flex gap-2">
                  <button type="button" onClick={startRecording} aria-label="Gravar áudio" className={cn(OUTLINE_BTN, "flex-1")}>
                    <Mic className="h-[18px] w-[18px]" strokeWidth={2.2} />
                    Gravar
                  </button>
                  <FilePickerButton accept="audio/*" onChange={addAudios} className={cn(OUTLINE_BTN, "flex-1")}>
                    <Upload className="h-[18px] w-[18px]" strokeWidth={2.2} />
                    Arquivo
                  </FilePickerButton>
                </div>
              )}
            </div>

            <div className="h-px bg-[#F1EADC]" />

            <div className="space-y-2.5">
              <FieldLabel right={`${pdfUrls.length} de ${MAX_ATTACHMENTS}`}>Documentos</FieldLabel>
              {pdfUrls.map((url, i) => (
                <PDFPreview key={`pdf-${i}`} url={url} onRemove={() => handleRemoveUrl(url, 'pdf')} />
              ))}
              {uploadingStatus.pdfs && (
                <div className="flex h-12 animate-pulse items-center justify-center gap-2 rounded-[14px] border border-[#E9DFCB] bg-[#FAF5E6] text-xs font-bold text-[#6B5D50]">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Enviando documento…
                </div>
              )}
              {canAddPdfs && !uploadingStatus.pdfs && (
                <FilePickerButton
                  accept=".pdf,.doc,.docx,.ppt,.pptx,application/pdf"
                  onChange={addPdfs}
                  className={OUTLINE_BTN}
                >
                  <FileText className="h-[18px] w-[18px]" strokeWidth={2.2} />
                  Adicionar PDF, Word ou PowerPoint
                </FilePickerButton>
              )}
            </div>
          </div>
        </div>

        {/* 3 · Validade */}
        <div className="space-y-3.5">
          <StepTitle n={3} optional>Validade</StepTitle>
          <div className="space-y-3.5 rounded-[22px] border border-[#E9DFCB] bg-white p-4">
            <div className="flex items-center gap-3.5">
              <div className="flex-1 space-y-0.5">
                <p id="ann-expiry-label" className="text-base font-extrabold">Sumir do mural sozinho</p>
                <p className="text-[13px] leading-snug text-[#6B5D50]">
                  {hasExpiration && expirationDateValue && isValid(expirationDateValue)
                    ? `Sai do mural em ${format(expirationDateValue, "d 'de' MMMM", { locale: ptBR })}.`
                    : "Depois da data escolhida o aviso deixa de aparecer."}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={hasExpiration}
                aria-labelledby="ann-expiry-label"
                onClick={() => setHasExpiration(!hasExpiration)}
                className={cn("relative h-[30px] w-[52px] shrink-0 rounded-full transition-colors", hasExpiration ? "bg-[#1E6B43]" : "bg-[#D9CDB8]")}
              >
                <span className={cn("absolute top-0.5 h-[26px] w-[26px] rounded-full bg-white shadow transition-all", hasExpiration ? "left-6" : "left-0.5")} />
              </button>
            </div>

            {hasExpiration && (
              <div className="space-y-3.5 animate-in fade-in slide-in-from-top-1">
                <div className={cn(
                  "flex h-[52px] items-center gap-2.5 rounded-[14px] border px-3.5 text-base font-bold",
                  expirationDateValue && isValid(expirationDateValue) ? "border-[#D9CDB8] bg-white text-[#241A10]" : "border-[#F2CDB0] bg-[#FDEBDD] text-[#A23F06]"
                )}>
                  <CalendarDays className="h-5 w-5 shrink-0" />
                  <span className="first-letter:uppercase">
                    {expirationDateValue && isValid(expirationDateValue)
                      ? format(expirationDateValue, "EEEE, d 'de' MMMM", { locale: ptBR })
                      : "Escolha a data abaixo"}
                  </span>
                </div>
                <ExpiryCalendar value={expirationDateValue} onSelect={(d) => setExpirationDate(d)} />
                {expirationDateValue && (
                  <button
                    type="button"
                    onClick={() => setExpirationDate(null)}
                    className="flex h-11 w-full items-center justify-center gap-2 text-sm font-bold text-[#B5472A]"
                  >
                    <Trash2 className="h-4 w-4" />
                    Remover data
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Rodapé fixo */}
      <div className="shrink-0 space-y-2.5 border-t border-[#E9DFCB] bg-white px-4 pb-6 pt-3 shadow-[0_-10px_30px_rgba(50,33,19,0.06)]">
        <p className="text-center text-[13px] leading-snug text-[#6B5D50]" aria-live="polite">{footerSummary}</p>
        <button
          type="button"
          onClick={(e) => handleSubmit(e, true)}
          disabled={!canPublish}
          className={cn(
            "flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl text-base font-extrabold transition-all",
            canPublish ? "bg-[#322113] text-[#FFF8E8] active:scale-[0.98]" : "bg-[#EFE8D6] text-[#6B5D50]"
          )}
        >
          {isSubmitting
            ? <><Loader2 className="h-[18px] w-[18px] animate-spin" />Salvando...</>
            : <><Check className="h-[18px] w-[18px]" strokeWidth={2.6} />{initialData ? "Salvar e publicar" : "Publicar aviso"}</>
          }
        </button>
        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={handleCancel}
            disabled={isSubmitting}
            className="h-12 flex-1 rounded-2xl border border-[#D9CDB8] bg-white text-[15px] font-bold text-[#322113]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={(e) => handleSubmit(e, false)}
            disabled={!canDraft}
            className={cn(
              "h-12 flex-1 rounded-2xl border text-[15px] font-bold",
              canDraft ? "border-[#D9CDB8] bg-white text-[#322113]" : "border-[#EFE8D6] bg-[#FBF7EE] text-[#9A8C78]"
            )}
          >
            Salvar rascunho
          </button>
        </div>
      </div>
    </form>
  )
}
