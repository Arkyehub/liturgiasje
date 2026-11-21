"use client"

import { useRef, useState } from "react"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/shared/ui/accordion"
import { Dialog, DialogContent } from "@/shared/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover"
import { Calendar } from "@/shared/ui/calendar"
import { Switch } from "@/shared/ui/switch"
import { UserAvatar } from "@/shared/ui/UserAvatar"
import { Check, ChevronLeft, ChevronRight, Clock, Download, Maximize2, Megaphone, Pause, Pencil, Play, Share2, Trash2 } from "lucide-react"
import { format, isValid } from "date-fns"
import { ptBR } from "date-fns/locale"
import { cn, getFileType, getFileViewerUrl } from "@/shared/lib/utils"
import { getAvatarColor, getInitials } from "@/shared/lib/avatar-utils"
import type { AnnouncementProps } from "./AnnouncementCard"

const BROWN = "#322113"

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00"
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, "0")}`
}

/** Player de áudio do mural: botão, barra de progresso, tempo e velocidade. */
function NoticeAudio({ url, index }: { url: string; index: number }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [rate, setRate] = useState(1)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)

  const toggle = () => {
    const el = audioRef.current
    if (!el) return
    if (isPlaying) el.pause()
    else el.play()
    setIsPlaying(!isPlaying)
  }

  const changeRate = () => {
    const rates = [1, 1.5, 2]
    const next = rates[(rates.indexOf(rate) + 1) % rates.length]
    setRate(next)
    if (audioRef.current) audioRef.current.playbackRate = next
  }

  const pct = duration > 0 ? Math.min(100, (current / duration) * 100) : 0

  return (
    <div className="flex items-center gap-2.5 rounded-[18px] border border-[#E9DFCB] bg-[#FAF5E6] p-2 pr-3">
      <button
        type="button"
        onClick={toggle}
        aria-label={isPlaying ? `Pausar áudio ${index + 1}` : `Ouvir áudio ${index + 1}`}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#322113] text-[#FFF8E8] transition-transform active:scale-95"
      >
        {isPlaying ? <Pause className="h-[18px] w-[18px] fill-current" /> : <Play className="ml-0.5 h-[18px] w-[18px] fill-current" />}
      </button>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#E4D8C0]">
          <div className="h-full rounded-full bg-[#322113] transition-all duration-100" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-xs font-bold tabular-nums text-[#6B5D50]">
          {formatTime(current)} / {formatTime(duration)}
        </span>
      </div>
      <button
        type="button"
        onClick={changeRate}
        aria-label={`Velocidade ${rate}x`}
        className="h-9 min-w-11 rounded-full border border-[#D9CDB8] bg-white px-2 text-xs font-extrabold text-[#322113]"
      >
        {rate}x
      </button>
      <audio
        ref={audioRef}
        src={url}
        onTimeUpdate={() => setCurrent(audioRef.current?.currentTime ?? 0)}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration ?? 0)}
        onEnded={() => setIsPlaying(false)}
        className="hidden"
      />
    </div>
  )
}

const DOC_COLORS: Record<string, string> = {
  pdf: "bg-[#FDEBDD] text-[#B5472A]",
  ppt: "bg-orange-100 text-orange-700",
  pptx: "bg-orange-100 text-orange-700",
  doc: "bg-blue-100 text-blue-700",
  docx: "bg-blue-100 text-blue-700",
  xls: "bg-[#E6F3EB] text-[#1E6B43]",
  xlsx: "bg-[#E6F3EB] text-[#1E6B43]",
}

function NoticeDoc({ url, index }: { url: string; index: number }) {
  const fileType = getFileType(url)
  const fileName = url.split("/").pop()?.split("?")[0] || `documento-${index + 1}.${fileType}`
  const name = decodeURIComponent(fileName).split("-").slice(1).join("-") || fileName
  return (
    <a
      href={getFileViewerUrl(url)}
      target="_blank"
      rel="noreferrer"
      title={name}
      className="flex items-center gap-3 rounded-[18px] border border-[#E9DFCB] bg-[#FAF5E6] p-2 text-[#241A10] transition-transform active:scale-[0.99]"
    >
      <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[11px] font-extrabold", DOC_COLORS[fileType] || "bg-stone-200 text-stone-700")}>
        {fileType.toUpperCase()}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-bold">{name}</span>
        <span className="text-xs text-[#6B5D50]">Toque para abrir</span>
      </span>
      <span className="flex h-11 w-11 shrink-0 items-center justify-center text-[#322113]">
        <Download className="h-5 w-5" />
      </span>
    </a>
  )
}

const chipBtn = "inline-flex h-9 items-center gap-1.5 rounded-full border border-[#E9DFCB] bg-white px-3 text-[13px] font-bold text-[#322113]"
const actionBtn = "flex h-12 flex-1 items-center justify-center gap-1.5 rounded-[14px] border border-[#E9DFCB] bg-white text-[13px] font-bold transition-transform active:scale-95"

/** Card de recado (tipo Aviso) no visual novo. A Troca continua no card antigo. */
export function NoticeCard({
  id,
  title,
  content,
  imageUrls = [],
  audioUrls = [],
  pdfUrls = [],
  expiresAt,
  createdAt,
  isRead,
  isAdmin,
  isLoggedIn,
  authorName,
  viewers = [],
  onRead,
  onUpdate,
  onDelete,
  onEdit,
  isPublished = true,
}: AnnouncementProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [activeImageIndex, setActiveImageIndex] = useState<number | null>(null)
  // Não lido: sempre aberto até "Confirmar leitura". Rascunho do admin não entra na regra.
  const mustStayOpen = !!isLoggedIn && !isRead && isPublished
  const open = mustStayOpen || isExpanded
  const isNew = !!isLoggedIn && !isRead
  const isDraft = !isPublished && !!isAdmin

  const images = imageUrls.filter(Boolean) as string[]
  const audios = audioUrls.filter(Boolean) as string[]
  const pdfs = pdfUrls.filter(Boolean) as string[]

  const dateText = createdAt && isValid(new Date(createdAt)) ? format(new Date(createdAt), "dd/MM 'às' HH:mm", { locale: ptBR }) : ""
  const meta = [isRead ? "Visualizado" : null, authorName || "Administração", dateText || null].filter(Boolean).join(" · ")

  const handleShare = (e: React.MouseEvent) => {
    e.stopPropagation()
    const text = `*${title}*\n\n${content}\n\nVeja mais sobre:\n${window.location.origin}/#ann-${id}`
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank")
  }

  const expiryLabel = expiresAt && isValid(new Date(expiresAt)) ? format(new Date(expiresAt), "dd/MM", { locale: ptBR }) : "Sem validade"
  const sampleViewers = viewers.slice(0, 3)

  return (
    <article
      id={`ann-${id}`}
      className={cn(
        "overflow-hidden transition-all duration-500",
        isRead ? "rounded-[20px] border border-[#E9DFCB] bg-[#F4EEDD]" : "rounded-3xl bg-white shadow-[0_6px_22px_rgba(50,33,19,0.07)]",
        !isRead && (isDraft ? "border-2 border-orange-500 ring-2 ring-orange-100" : "border border-[#E9DFCB]")
      )}
    >
      {isAdmin && (
        <div className={cn("flex flex-col gap-2.5 border-b border-[#E9DFCB] px-4 py-3", isPublished ? "bg-[#FBF7EE]" : "bg-[#FFF8E6]")}>
          <div className="flex items-center justify-between">
            <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-extrabold tracking-wider", isPublished ? "bg-[#E6F3EB] text-[#1E6B43]" : "bg-[#FFF3D1] text-[#6B3F00]")}>
              {isPublished ? "PUBLICADO" : "RASCUNHO"}
            </span>
            <label className="flex items-center gap-2 text-xs font-bold text-[#6B5D50]">
              {isPublished ? "No ar" : "Fora do ar"}
              <Switch checked={isPublished} onCheckedChange={(val) => onUpdate?.(id, { isPublished: val })} />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isPublished ? (
              <Popover>
                <PopoverTrigger render={
                  <button type="button" className={cn(chipBtn, "pl-2")}>
                    {sampleViewers.length > 0 && (
                      <span className="flex">
                        {sampleViewers.map((v, i) => {
                          const { bg, text } = getAvatarColor(v.name)
                          return (
                            <span key={i} className={cn("flex h-6 w-6 items-center justify-center rounded-full border-2 border-white text-[9px] font-extrabold", bg, text, i > 0 && "-ml-2")}>
                              {getInitials(v.name)}
                            </span>
                          )
                        })}
                      </span>
                    )}
                    {viewers.length} {viewers.length === 1 ? "viu" : "viram"}
                  </button>
                } />
                <PopoverContent className="w-80 p-0" align="start">
                  <div className="border-b border-stone-100 bg-stone-50/50 px-3 py-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500">Visualizado por ({viewers.length})</span>
                  </div>
                  <div className="max-h-[250px] overflow-auto p-1.5">
                    {viewers.length === 0 ? (
                      <p className="px-3 py-4 text-center text-[10px] text-stone-400">Ninguém visualizou ainda</p>
                    ) : (
                      <div className="grid grid-cols-2 gap-1">
                        {viewers.map((viewer, idx) => (
                          <div key={idx} className="flex items-center gap-2.5 rounded-md border border-transparent px-2 py-2 hover:border-stone-100 hover:bg-stone-50">
                            <UserAvatar name={viewer.name} src={viewer.avatarUrl} isClaimed={viewer.isClaimed} className="h-7 w-7 shrink-0" />
                            <div className="flex min-w-0 flex-col">
                              <span className="truncate text-[11px] font-black leading-tight text-stone-800" title={viewer.name}>{viewer.name}</span>
                              <span className="text-[10px] font-bold leading-tight text-stone-400">
                                {isValid(new Date(viewer.at)) ? format(new Date(viewer.at), "dd/MM HH:mm", { locale: ptBR }) : "--/-- --:--"}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            ) : (
              <span className="text-[13px] text-[#6B5D50]">Só você vê este rascunho</span>
            )}
            <Popover>
              <PopoverTrigger render={
                <button type="button" className={chipBtn}>
                  <Clock className="h-[15px] w-[15px]" />
                  {expiresAt && isValid(new Date(expiresAt)) ? `Sai em ${expiryLabel}` : expiryLabel}
                </button>
              } />
              <PopoverContent className="flex w-auto flex-col p-0" align="start">
                <Calendar
                  mode="single"
                  selected={expiresAt ? new Date(expiresAt) : undefined}
                  onSelect={(date) => onUpdate?.(id, { expiresAt: date?.toISOString() })}
                  initialFocus
                  locale={ptBR}
                />
                {expiresAt && (
                  <div className="border-t border-stone-100 p-1">
                    <button
                      type="button"
                      onClick={() => onUpdate?.(id, { expiresAt: null })}
                      className="flex h-10 w-full items-center justify-center gap-2 rounded-md text-[11px] font-bold text-red-500 hover:bg-red-50"
                    >
                      <Trash2 className="h-3 w-3" />
                      REMOVER DATA
                    </button>
                  </div>
                )}
              </PopoverContent>
            </Popover>
          </div>
        </div>
      )}

      <Accordion
        value={open ? ["item-1"] : []}
        onValueChange={(value) => {
          if (mustStayOpen) return
          setIsExpanded(value.length > 0)
        }}
      >
        <AccordionItem value="item-1" className="border-none" disabled={!isLoggedIn}>
          <AccordionTrigger
            className={cn("items-center px-4 py-4 hover:no-underline", (!isLoggedIn || mustStayOpen) && "pointer-events-none cursor-default")}
            hideChevron={!isLoggedIn || mustStayOpen}
            tabIndex={mustStayOpen ? -1 : undefined}
          >
            <div className="flex w-full items-start gap-3 pr-2 text-left">
              {isRead ? (
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#E6F2EA] text-[#1E6B43]">
                  <Check className="h-[18px] w-[18px]" strokeWidth={3} />
                </span>
              ) : (
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-[#FDF1D6] text-[#7A4F00]">
                  <Megaphone className="h-5 w-5" />
                </span>
              )}
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className={cn("font-extrabold leading-tight text-[#241A10]", isRead ? "line-clamp-1 text-[15px] text-[#4A3D31]" : "line-clamp-2 text-[17px]")}>{title}</span>
                <span className="text-xs text-[#6B5D50]">{meta}</span>
              </span>
              {isNew && (
                <span className="shrink-0 rounded-full bg-[#322113] px-2.5 py-1 text-[11px] font-extrabold tracking-wider text-[#FFF8E8]">NOVO</span>
              )}
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4 pt-0">
            <div className="flex flex-col gap-3.5">
              <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-[#3A2E24]">{content}</p>

              {images.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  {images.map((url, idx) => {
                    const big = idx === 0
                    if (!big) return null
                    return (
                      <button key={idx} type="button" onClick={() => setActiveImageIndex(idx)} className="group relative h-40 w-full cursor-zoom-in overflow-hidden rounded-2xl border border-black/5 bg-stone-100">
                        <img src={url} alt={`${title} - ${idx + 1}`} className="h-full w-full object-cover" />
                        <span className="absolute bottom-2 right-2 rounded-full bg-white/90 p-1.5 shadow">
                          <Maximize2 className="h-3.5 w-3.5 text-stone-800" />
                        </span>
                      </button>
                    )
                  })}
                  {images.length > 1 && (
                    <div className="grid grid-cols-2 gap-1.5">
                      {images.slice(1).map((url, i) => (
                        <button key={i} type="button" onClick={() => setActiveImageIndex(i + 1)} className="h-24 cursor-zoom-in overflow-hidden rounded-2xl border border-black/5 bg-stone-100">
                          <img src={url} alt={`${title} - ${i + 2}`} className="h-full w-full object-cover" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <Dialog open={activeImageIndex !== null} onOpenChange={(o) => !o && setActiveImageIndex(null)}>
                <DialogContent className="flex max-w-[95vw] items-center justify-center overflow-hidden border-none bg-black/95 p-1 shadow-2xl sm:max-w-4xl">
                  {activeImageIndex !== null && (
                    <div className="relative flex min-h-[60vh] h-full w-full items-center justify-center">
                      <img src={images[activeImageIndex]} alt={title} className="max-h-[85vh] max-w-full rounded-lg object-contain animate-in zoom-in-95 duration-200" />
                      {images.length > 1 && (
                        <>
                          <button type="button" aria-label="Imagem anterior" onClick={(e) => { e.stopPropagation(); setActiveImageIndex((p) => (p! - 1 + images.length) % images.length) }} className="absolute left-4 z-50 rounded-full border border-white/20 bg-black/40 p-3 text-white backdrop-blur-sm active:scale-95">
                            <ChevronLeft className="h-6 w-6" />
                          </button>
                          <button type="button" aria-label="Próxima imagem" onClick={(e) => { e.stopPropagation(); setActiveImageIndex((p) => (p! + 1) % images.length) }} className="absolute right-4 z-50 rounded-full border border-white/20 bg-black/40 p-3 text-white backdrop-blur-sm active:scale-95">
                            <ChevronRight className="h-6 w-6" />
                          </button>
                          <div className="absolute right-4 top-4 rounded-full border border-white/10 bg-black/50 px-3 py-1 text-[10px] font-bold text-white/90 backdrop-blur-md">
                            {activeImageIndex + 1} / {images.length}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </DialogContent>
              </Dialog>

              {audios.map((url, idx) => <NoticeAudio key={idx} url={url} index={idx} />)}
              {pdfs.map((url, idx) => <NoticeDoc key={idx} url={url} index={idx} />)}

              {isLoggedIn && !isRead && (
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => onRead?.(id)}
                    className="flex h-[52px] items-center justify-center gap-2 rounded-2xl text-base font-extrabold text-[#FFF8E8] transition-transform active:scale-[0.98]"
                    style={{ background: BROWN }}
                  >
                    <Check className="h-[18px] w-[18px]" strokeWidth={2.6} />
                    Confirmar leitura
                  </button>
                  <span className="text-center text-xs text-[#6B5D50]">Ao confirmar, o recado vai para os já lidos.</span>
                </div>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {isAdmin && (
        <div className="flex gap-2 px-4 pb-4">
          <button type="button" onClick={handleShare} className={cn(actionBtn, "text-[#1E6B43]")}>
            <Share2 className="h-[17px] w-[17px]" />
            WhatsApp
          </button>
          <button
            type="button"
            onClick={() => onEdit?.({ id, title, content, expiresAt, imageUrls, audioUrls, pdfUrls, isPublished })}
            className={cn(actionBtn, "text-[#322113]")}
          >
            <Pencil className="h-[17px] w-[17px]" />
            Editar
          </button>
          <button type="button" onClick={() => onDelete?.(id)} className={cn(actionBtn, "text-[#B5472A]")}>
            <Trash2 className="h-[17px] w-[17px]" />
            Excluir
          </button>
        </div>
      )}
    </article>
  )
}
