import { useState, useRef } from "react"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/shared/ui/accordion"
import { Button } from "@/shared/ui/button"
import { Card } from "@/shared/ui/card"
import { Dialog, DialogContent, DialogTrigger } from "@/shared/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover"
import { Calendar } from "@/shared/ui/calendar"
import { CheckCircle2, Megaphone, Music, Maximize2, Calendar as CalendarIcon, Clock, Eye, Pencil, Trash2, User as UserIcon, RefreshCw, ChevronLeft, ChevronRight, Play, Pause, FastForward } from "lucide-react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { cn } from "@/shared/lib/utils"

interface AudioPlayerProps {
  url: string;
  index: number;
}

function AudioPlayer({ url, index }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [progress, setProgress] = useState(0)

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause()
      } else {
        audioRef.current.play()
      }
      setIsPlaying(!isPlaying)
    }
  }

  const changeRate = () => {
    const rates = [1, 1.5, 2]
    const nextRate = rates[(rates.indexOf(playbackRate) + 1) % rates.length]
    setPlaybackRate(nextRate)
    if (audioRef.current) {
      audioRef.current.playbackRate = nextRate
    }
  }

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      const current = audioRef.current.currentTime
      const duration = audioRef.current.duration
      setProgress((current / duration) * 100)
    }
  }

  return (
    <div className="group relative flex flex-col gap-2 rounded-xl border border-stone-200 bg-white p-3 pt-4 shadow-sm transition-all hover:border-amber-200 hover:shadow-md">
      <div className="flex items-center gap-2 mb-1 px-1">
        <div className="bg-amber-100 p-1.5 rounded-full">
          <Music className="h-4 w-4 text-amber-700" />
        </div>
        <span className="text-[10px] font-bold text-stone-500 uppercase tracking-widest">
          Áudio {index + 1}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={togglePlay}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500 text-white shadow-sm hover:bg-amber-600 transition-all active:scale-95"
        >
          {isPlaying ? <Pause className="h-5 w-5 fill-current" /> : <Play className="h-5 w-5 fill-current ml-0.5" />}
        </button>

        <div className="flex-1 space-y-1">
          <div className="h-1.5 w-full bg-stone-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-amber-500 transition-all duration-100"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex justify-between items-center">
            <span className="text-[8px] font-bold text-stone-400 uppercase tracking-tighter">
              {playbackRate === 1 ? "Normal" : `${playbackRate}x`}
            </span>
          </div>
        </div>

        <button
          onClick={changeRate}
          className="flex h-8 w-12 items-center justify-center rounded-lg border border-stone-200 bg-stone-50 text-[10px] font-black text-stone-600 hover:bg-stone-100 transition-colors"
        >
          {playbackRate}x
        </button>
      </div>

      <audio
        ref={audioRef}
        src={url}
        onTimeUpdate={handleTimeUpdate}
        onEnded={() => setIsPlaying(false)}
        className="hidden"
      />

      <div className="absolute -inset-px rounded-xl bg-gradient-to-r from-amber-500/5 to-transparent opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity" />
    </div>
  )
}

interface AnnouncementProps {
  id: string
  title: string
  content: string
  type: "Aviso" | "Troca"
  image_url?: string
  image_urls?: string[]
  audio_url?: string
  audio_urls?: string[]
  expires_at?: string
  createdAt?: string
  isRead?: boolean
  isAdmin?: boolean
  isLoggedIn?: boolean
  authorName?: string
  authorId?: string
  viewers?: { name: string; at: string; avatar_url?: string | null }[]
  related_schedule_slot_id?: string
  onRead?: (id: string) => void
  onUpdate?: (id: string, data: any) => void
  onDelete?: (id: string) => void
  onEdit?: (ann: any) => void
  onAcceptSwap?: (slotId: string, announcementId: string) => void
  currentUserId?: string
}

export function AnnouncementCard({
  id,
  title,
  content,
  type,
  image_url,
  image_urls = [],
  audio_url,
  audio_urls = [],
  expires_at,
  createdAt,
  isRead,
  isAdmin,
  isLoggedIn,
  authorName,
  authorId,
  viewers = [],
  related_schedule_slot_id,
  onRead,
  onUpdate,
  onDelete,
  onEdit,
  onAcceptSwap,
  currentUserId,
}: AnnouncementProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [activeImageIndex, setActiveImageIndex] = useState<number | null>(null)

  const allImages = (image_urls.length > 0 ? image_urls : [image_url]).filter(Boolean) as string[]
  const allAudios = (audio_urls.length > 0 ? audio_urls : [audio_url]).filter(Boolean) as string[]

  // Para fins de comparação, assumimos que se o usuário pode ver o botão, ele está logado.
  // No page.tsx passaremos o ID do usuário logado se necessário, mas aqui usaremosauthorId.

  // Só mostra animação se estiver logado e não tiver lido
  const shouldShowGlow = isLoggedIn && !isRead;

  return (
    <Card className={`overflow-hidden p-0 gap-0 transition-all duration-500 ${shouldShowGlow
        ? `${isExpanded ? "border-amber-400 bg-white shadow-sm" : "border-amber-400 bg-white shadow-md animate-glow-pulse ring-2 ring-amber-100 ring-offset-1"}`
        : isRead ? "border-green-500 bg-white shadow-sm hover:bg-white/90" : "border-stone-200 bg-white shadow-sm"
      }`}>
      {/* Barra de Ações Administrativas (Admin Only) */}
      {isAdmin && (
        <div className="flex items-center justify-between border-b border-stone-100 bg-stone-50/50 px-3 py-0.5">
          {/* Esquerda: Visualizações */}
          <Popover>
            <PopoverTrigger render={
              <button className="flex items-center gap-1.5 text-[10px] font-bold text-amber-600 hover:text-amber-700 bg-white/80 px-2 py-0.5 rounded-full border border-amber-200 transition-colors">
                <Eye className="h-3 w-3" />
                {viewers.length} {viewers.length === 1 ? 'visto' : 'vistos'}
              </button>
            } />
            <PopoverContent className="w-80 p-0" align="start">
              <div className="flex flex-col">
                <div className="border-b border-stone-100 bg-stone-50/50 px-3 py-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500">
                    Visualizado por
                  </span>
                </div>
                <div className="max-h-[250px] overflow-auto p-1.5">
                  {viewers.length === 0 ? (
                    <p className="px-3 py-4 text-center text-[10px] text-stone-400">Ninguém visualizou ainda</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-1">
                      {viewers.map((viewer, idx) => (
                        <div key={idx} className="flex items-center gap-2.5 px-2 py-2 hover:bg-stone-50 rounded-md border border-transparent hover:border-stone-100 transition-all">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-stone-100 overflow-hidden border border-stone-200 shadow-sm transition-transform group-hover:scale-105">
                            {viewer.avatar_url ? (
                              <img src={viewer.avatar_url} alt={viewer.name} className="h-full w-full object-cover" />
                            ) : (
                              <UserIcon className="h-3.5 w-3.5 text-stone-400" />
                            )}
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="text-[11px] font-black text-stone-800 truncate leading-tight" title={viewer.name}>
                              {viewer.name}
                            </span>
                            <span className="text-[10px] font-bold text-stone-400 leading-tight">
                              {format(new Date(viewer.at), "dd/MM HH:mm", { locale: ptBR })}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </PopoverContent>
          </Popover>

          {/* Direita: Ações */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => onEdit?.({ id, title, content, expires_at, image_url, image_urls, audio_url, audio_urls })}
              className="p-1.5 hover:bg-amber-100 rounded-lg text-stone-500 hover:text-stone-800 transition-colors"
              title="Editar"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>

            {/* Expiração */}
            <Popover>
              <PopoverTrigger render={
                <button className="flex items-center gap-1.5 text-[10px] font-bold text-stone-600 hover:text-stone-900 bg-white px-2 py-0.5 rounded-lg border border-stone-200 transition-colors">
                  <Clock className="h-3 w-3 text-red-500" />
                  {expires_at ? `até ${format(new Date(expires_at), "dd/MM/yyyy", { locale: ptBR })}` : "Sem expiração"}
                </button>
              } />
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  mode="single"
                  selected={expires_at ? new Date(expires_at) : undefined}
                  onSelect={(date) => onUpdate?.(id, { expires_at: date?.toISOString() })}
                  initialFocus
                  locale={ptBR}
                />
              </PopoverContent>
            </Popover>

            <button
              onClick={() => onDelete?.(id)}
              className="p-1.5 hover:bg-red-50 rounded-lg text-stone-400 hover:text-red-600 transition-colors"
              title="Excluir"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
      <Accordion>
        <AccordionItem
          value="item-1"
          className="border-none"
          onOpenChange={setIsExpanded}
          disabled={!isLoggedIn}
        >
          <AccordionTrigger
            className={`px-3 py-2 hover:no-underline ${!isLoggedIn ? 'cursor-default pointer-events-none' : ''}`}
            hideChevron={!isLoggedIn}
          >
            <div className="flex items-center gap-2 text-left w-full pr-2">
              <div className={`rounded-full p-2 shrink-0 ${type === 'Troca' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
                {type === 'Troca' ? <RefreshCw className="h-4 w-4" /> : <Megaphone className="h-4 w-4" />}
              </div>
              <div className="flex flex-col flex-1 min-w-0">
                <span className="text-sm font-semibold text-stone-800 line-clamp-1">{title}</span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase font-bold text-stone-400 tracking-wider">
                    {type}
                  </span>
                  {isRead && (
                    <span className="flex items-center gap-1 text-[10px] text-green-600 font-medium">
                      <CheckCircle2 className="h-3 w-3" /> Visualizado
                    </span>
                  )}
                </div>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-3 pb-3 pt-0">
            <div className="space-y-4 pt-1.5">
              <p className="text-sm leading-relaxed text-stone-600 whitespace-pre-wrap">
                {content}
              </p>

              {/* Renderização de Imagens */}
              {allImages.length > 0 && (
                <div className="flex flex-wrap gap-2 w-full">
                  {allImages.map((url, idx) => (
                    <div key={idx} className={cn(
                      "group relative overflow-hidden rounded-lg border border-stone-200 bg-stone-50 shadow-sm transition-all hover:shadow-md w-20 h-20 shrink-0"
                    )}>
                      <button
                        onClick={() => setActiveImageIndex(idx)}
                        className="relative w-full h-full overflow-hidden cursor-zoom-in"
                      >
                        <img
                          src={url}
                          alt={`${title} - ${idx + 1}`}
                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                        <div className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/10 flex items-center justify-center opacity-0 group-hover:opacity-100">
                          <div className="bg-white/90 p-2 rounded-full shadow-lg">
                            <Maximize2 className="h-4 w-4 text-stone-800" />
                          </div>
                        </div>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Lightbox / Diálogo Expandido Único */}
              <Dialog
                open={activeImageIndex !== null}
                onOpenChange={(open) => !open && setActiveImageIndex(null)}
              >
                <DialogContent className="max-w-[95vw] sm:max-w-4xl p-1 border-none bg-black/95 shadow-2xl overflow-hidden flex items-center justify-center">
                  {activeImageIndex !== null && (
                    <div className="relative group/lightbox w-full h-full flex items-center justify-center min-h-[60vh]">
                      <img
                        src={allImages[activeImageIndex]}
                        alt={title}
                        className="max-w-full max-h-[85vh] object-contain rounded-lg animate-in zoom-in-95 duration-200"
                      />

                      {/* Navegação */}
                      {allImages.length > 1 && (
                        <>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveImageIndex((prev) => (prev! - 1 + allImages.length) % allImages.length);
                            }}
                            className="absolute left-4 p-3 rounded-full bg-black/40 hover:bg-black/60 text-white border border-white/20 backdrop-blur-sm transition-all active:scale-95 z-50 shadow-lg"
                          >
                            <ChevronLeft className="h-6 w-6" />
                          </button>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveImageIndex((prev) => (prev! + 1) % allImages.length);
                            }}
                            className="absolute right-4 p-3 rounded-full bg-black/40 hover:bg-black/60 text-white border border-white/20 backdrop-blur-sm transition-all active:scale-95 z-50 shadow-lg"
                          >
                            <ChevronRight className="h-6 w-6" />
                          </button>

                          {/* Contador */}
                          <div className="absolute top-4 right-4 bg-black/50 backdrop-blur-md px-3 py-1 rounded-full text-[10px] font-bold text-white/90 border border-white/10">
                            {activeImageIndex + 1} / {allImages.length}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </DialogContent>
              </Dialog>

              {/* Renderização de Áudios */}
              {allAudios.length > 0 && (
                <div className="flex flex-col gap-3 pt-2">
                  {allAudios.map((url, idx) => (
                    <AudioPlayer key={idx} url={url} index={idx} />
                  ))}
                </div>
              )}

              {/* Autor do Recado */}
              <div className="flex items-center justify-end px-1 pt-1">
                <span className="text-[10px] font-medium text-stone-400 italic">
                  Publicado por: {authorName || 'Administração'} {createdAt && ` em ${format(new Date(createdAt), "dd/MM 'às' HH:mm", { locale: ptBR })}`}
                </span>
              </div>

              {isLoggedIn && !isRead && type === 'Aviso' && (
                <Button
                  onClick={() => onRead?.(id)}
                  variant="outline"
                  size="sm"
                  className="w-full h-9 text-xs font-bold border-green-200 text-green-700 bg-green-50/50 hover:bg-green-100/80 hover:text-green-800 rounded-lg transition-all active:scale-95"
                >
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Confirmar Leitura
                </Button>
              )}

              {isLoggedIn && type === 'Troca' && related_schedule_slot_id && authorId !== currentUserId && (
                <Button
                  onClick={() => onAcceptSwap?.(related_schedule_slot_id, id)}
                  variant="outline"
                  size="sm"
                  className="w-full h-9 text-xs font-bold border-amber-200 text-amber-700 bg-amber-50 hover:bg-amber-100 hover:text-amber-800 rounded-lg transition-all active:scale-95 shadow-sm"
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Aceitar Troca
                </Button>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </Card>
  )
}
