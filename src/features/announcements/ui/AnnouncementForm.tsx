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
  Music, X, Mic, Square, FileText
} from "lucide-react"
import { cn } from "@/shared/lib/utils"
import { toast } from "sonner"

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface InitialData {
  id: string
  title: string
  content: string
  expiresAt?: string
  imageUrls?: string[]
  audioUrls?: string[]
  pdfUrls?: string[]
}

interface SavePayload {
  id?: string
  title: string
  content: string
  expiresAt: Date | null
  imageFiles?: File[] | null
  imageUrls?: string[]
  audioFiles?: File[] | null
  audioUrls?: string[]
  pdfFiles?: File[] | null
  pdfUrls?: string[]
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
        <span className="truncate text-[10px] font-medium text-stone-600">{label}</span>
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="flex-shrink-0 text-stone-400 transition-colors hover:text-red-500"
        aria-label={`Remover ${label}`}
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
    <div className={cn(
      "relative h-16 w-16 overflow-hidden rounded-md border",
      isNew ? "border-green-200" : "border-stone-200"
    )}>
      <img src={src} alt="Anexo" className="h-full w-full object-cover" />
      <button
        type="button"
        onClick={onRemove}
        className="absolute -right-1 -top-1 rounded-full bg-red-500 p-0.5 text-white shadow-sm"
        aria-label="Remover imagem"
      >
        <X className="h-2.5 w-2.5" />
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

// ─── Hook: useDraft ───────────────────────────────────────────────────────────

const DRAFT_KEY = "announcement_draft"

function useDraft(initialData?: InitialData) {
  const load = (): { title: string; content: string } => {
    if (initialData) return { title: initialData.title, content: initialData.content }
    try {
      const raw = localStorage.getItem(DRAFT_KEY)
      if (raw) return JSON.parse(raw)
    } catch { /* ignorar */ }
    return { title: "", content: "" }
  }

  const save = (title: string, content: string) => {
    if (!initialData) localStorage.setItem(DRAFT_KEY, JSON.stringify({ title, content }))
  }

  const clear = () => localStorage.removeItem(DRAFT_KEY)

  return { load, save, clear }
}

// ─── Componente Principal: AnnouncementForm ───────────────────────────────────

const MAX_ATTACHMENTS = 3

export function AnnouncementForm({ initialData, onSave, onClose }: AnnouncementFormProps) {
  const draft = useDraft(initialData)
  const initialDraft = draft.load()

  const [title, setTitle] = useState(initialDraft.title)
  const [content, setContent] = useState(initialDraft.content)
  const [hasExpiration, setHasExpiration] = useState(!!initialData?.expiresAt)
  const [expirationDate, setExpirationDate] = useState<Date | undefined>(
    initialData?.expiresAt ? new Date(initialData.expiresAt) : undefined
  )
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [imageFiles, setImageFiles] = useState<File[]>([])
  const [existingImages, setExistingImages] = useState<string[]>(initialData?.imageUrls ?? [])
  const [audioFiles, setAudioFiles] = useState<File[]>([])
  const [existingAudios, setExistingAudios] = useState<string[]>(initialData?.audioUrls ?? [])
  const [pdfFiles, setPdfFiles] = useState<File[]>([])
  const [existingPdfs, setExistingPdfs] = useState<string[]>(initialData?.pdfUrls ?? [])

  // Persistência de rascunho
  useEffect(() => { draft.save(title, content) }, [title, content])

  // Gravação de áudio
  const handleRecordingComplete = useCallback((file: File) => {
    setAudioFiles((prev) => {
      const slots = MAX_ATTACHMENTS - existingAudios.length - prev.length
      return slots > 0 ? [...prev, file] : prev
    })
  }, [existingAudios.length])

  const { isRecording, recordingTime, formatTime, startRecording, stopRecording } =
    useAudioRecorder(handleRecordingComplete)

  // ── Handlers de arquivos ────────────────────────────────────────────────────

  const addImages = useCallback((files: File[]) => {
    setImageFiles((prev) => {
      const slots = MAX_ATTACHMENTS - existingImages.length - prev.length
      return slots > 0 ? [...prev, ...files.slice(0, slots)] : prev
    })
  }, [existingImages.length])

  const addAudios = useCallback((files: File[]) => {
    setAudioFiles((prev) => {
      const slots = MAX_ATTACHMENTS - existingAudios.length - prev.length
      if (slots <= 0) return prev
      const toAdd = files.slice(0, slots)
      toast.success(`${toAdd.length} áudio(s) anexado(s)`)
      return [...prev, ...toAdd]
    })
  }, [existingAudios.length])

  const addPdfs = useCallback((files: File[]) => {
    setPdfFiles((prev) => {
      const slots = MAX_ATTACHMENTS - existingPdfs.length - prev.length
      if (slots <= 0) return prev
      const toAdd = files.slice(0, slots)
      toast.success(`${toAdd.length} PDF(s) anexado(s)`)
      return [...prev, ...toAdd]
    })
  }, [existingPdfs.length])

  // ── Submit ──────────────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !content.trim()) return

    setIsSubmitting(true)
    try {
      await onSave({
        id: initialData?.id,
        title: title.trim(),
        content: content.trim(),
        expiresAt: hasExpiration ? (expirationDate ?? null) : null,
        imageFiles: imageFiles.length > 0 ? imageFiles : null,
        imageUrls: existingImages,
        audioFiles: audioFiles.length > 0 ? audioFiles : null,
        audioUrls: existingAudios,
        pdfFiles: pdfFiles.length > 0 ? pdfFiles : null,
        pdfUrls: existingPdfs,
      })
      draft.clear()
      onClose()
    } catch (error) {
      console.error("Erro ao salvar aviso:", error)
      toast.error("Erro ao salvar aviso. Tente novamente.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const canAddImages = existingImages.length + imageFiles.length < MAX_ATTACHMENTS
  const canAddAudios = existingAudios.length + audioFiles.length < MAX_ATTACHMENTS
  const canAddPdfs = existingPdfs.length + pdfFiles.length < MAX_ATTACHMENTS

  // ── Render ──────────────────────────────────────────────────────────────────

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
            placeholder="Ex: Comunicado Geral"
            required
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
            placeholder="Escreva os detalhes aqui..."
            required
            className="min-h-[120px] border-stone-300 focus-visible:ring-stone-400 font-medium"
          />
        </div>
      </div>

      {/* Imagens */}
      <div className="space-y-2">
        <Label className="text-stone-700 font-semibold">
          Imagens{" "}
          <span className="text-xs font-normal text-stone-400">
            ({existingImages.length + imageFiles.length}/{MAX_ATTACHMENTS})
          </span>
        </Label>
        <div className="flex flex-wrap gap-2">
          {existingImages.map((url, i) => (
            <ImagePreview
              key={`existing-img-${i}`}
              src={url}
              onRemove={() => setExistingImages((p) => p.filter((_, idx) => idx !== i))}
            />
          ))}
          {imageFiles.map((file, i) => (
            <ImagePreview
              key={`new-img-${i}`}
              src={URL.createObjectURL(file)}
              isNew
              onRemove={() => setImageFiles((p) => p.filter((_, idx) => idx !== i))}
            />
          ))}
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
              ({existingAudios.length + audioFiles.length}/{MAX_ATTACHMENTS})
            </span>
          </Label>
          <div className="space-y-1.5">
            {existingAudios.map((_, i) => (
              <AttachmentItem
                key={`existing-audio-${i}`}
                label={`Áudio ${i + 1}`}
                icon={<Music className="h-3.5 w-3.5 flex-shrink-0 text-stone-400" />}
                onRemove={() => setExistingAudios((p) => p.filter((_, idx) => idx !== i))}
              />
            ))}
            {audioFiles.map((file, i) => (
              <AttachmentItem
                key={`new-audio-${i}`}
                label={file.name}
                icon={<Music className="h-3.5 w-3.5 flex-shrink-0 text-green-600" />}
                isNew
                onRemove={() => setAudioFiles((p) => p.filter((_, idx) => idx !== i))}
              />
            ))}
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
              ({existingPdfs.length + pdfFiles.length}/{MAX_ATTACHMENTS})
            </span>
          </Label>
          <div className="space-y-1.5">
            {existingPdfs.map((_, i) => (
              <AttachmentItem
                key={`existing-pdf-${i}`}
                label={`Doc ${i + 1}`}
                icon={<FileText className="h-3.5 w-3.5 flex-shrink-0 text-stone-400" />}
                onRemove={() => setExistingPdfs((p) => p.filter((_, idx) => idx !== i))}
              />
            ))}
            {pdfFiles.map((file, i) => (
              <AttachmentItem
                key={`new-pdf-${i}`}
                label={file.name}
                icon={<FileText className="h-3.5 w-3.5 flex-shrink-0 text-blue-600" />}
                isNew
                onRemove={() => setPdfFiles((p) => p.filter((_, idx) => idx !== i))}
              />
            ))}
            {canAddPdfs && (
              <FilePickerButton
                accept=".pdf,application/pdf"
                onChange={addPdfs}
                className="flex h-10 w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-stone-400 bg-white transition-all hover:bg-stone-50 active:bg-stone-100"
              >
                <FileText className="h-3.5 w-3.5 text-stone-500" />
                <span className="text-[10px] font-bold uppercase text-stone-500">
                  Anexar PDF
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
                    {expirationDate && isValid(expirationDate)
                      ? format(expirationDate, "PPP", { locale: ptBR })
                      : "Selecione a data"
                    }
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

      {/* Ações */}
      <div className="flex gap-3 pt-2">
        <Button
          type="button"
          variant="ghost"
          onClick={() => { draft.clear(); onClose() }}
          disabled={isSubmitting}
          className="flex-1 text-stone-500 hover:bg-stone-100"
        >
          Cancelar
        </Button>
        <Button
          type="submit"
          disabled={isSubmitting}
          className="flex-1 bg-stone-800 hover:bg-stone-900 text-white"
        >
          {isSubmitting
            ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Salvando...</>
            : initialData ? "Salvar Alterações" : "Publicar Aviso"
          }
        </Button>
      </div>
    </form>
  )
}
