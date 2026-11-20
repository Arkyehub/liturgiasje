"use client"

import { useState, useEffect } from "react"
import { Button } from "@/shared/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card"
import { Badge } from "@/shared/ui/badge"
import { Switch } from "@/shared/ui/switch"
import { cn } from "@/shared/lib/utils"
import { CalendarDays, Clock, RefreshCw, CheckCircle, Check, UserPlus, Pencil, Trash2, ChevronDown, ChevronUp, X, BookOpen, Loader2, BookSearch } from "lucide-react"
import { isPast, isToday, startOfDay, format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { roleLabel } from "@/shared/constants/roles"
import { UserAvatar } from "@/shared/ui/UserAvatar"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/shared/ui/sheet"
import { LiturgyService, LiturgyData } from "@/shared/api/LiturgyService"

interface ReaderSlot {
  id: string
  role: "C" | "1L" | "2L" | "P" | "L"
  roleName?: string
  readerName?: string
  readerArchived?: boolean
  previousAssignments?: { fullName: string; occurredAt: string; archived: boolean }[]
  avatarUrl?: string
  isClaimed?: boolean
  originalReaderName?: string
  originalReaderArchived?: boolean
  isConfirmed: boolean
  isSwapRequested: boolean
  isMine?: boolean
}

interface ScheduleCardProps {
  date: string
  rawDate: Date
  items: {
    id: string
    time: string
    specialTitle?: string
    liturgicalColor?: string
    slots: ReaderSlot[]
  }[]
  onConfirm?: (slotId: string) => void
  onRequestSwap?: (slotId: string) => void
  onCancelSwap?: (slotId: string) => void
  onTakeSwap?: (slotId: string) => void
  isAdmin?: boolean
  isPublished?: boolean
  onEdit?: () => void
  onDelete?: (massIds: string[]) => void
  onTogglePublish?: (isPublished: boolean) => void
}

export function ScheduleCard({
  date,
  rawDate,
  items,
  onConfirm,
  onRequestSwap,
  onCancelSwap,
  onTakeSwap,
  isAdmin,
  isPublished = true,
  onEdit,
  onDelete,
  onTogglePublish,
}: ScheduleCardProps) {
  // Uma missa é "passada" se for antes de hoje (considerando apenas o dia)
  const isDatePast = isPast(rawDate) && !isToday(rawDate)
  const [isExpanded, setIsExpanded] = useState(!isDatePast)
  const [isLiturgyOpen, setIsLiturgyOpen] = useState(false)
  const [liturgyData, setLiturgyData] = useState<LiturgyData | null>(null)
  const [isLoadingLiturgy, setIsLoadingLiturgy] = useState(false)
  const [localColor, setLocalColor] = useState<string | null>(null)

  const allMassIds = items.map(item => item.id);

  // Cabeçalho: domingos ganham o chip marrom; dias de semana usam o chip claro
  const isSunday = rawDate.getDay() === 0
  const weekdayShort = format(rawDate, "EEE", { locale: ptBR }).replace(".", "").toUpperCase()
  const dayNumber = format(rawDate, "d")
  const weekdayLong = format(rawDate, "EEEE", { locale: ptBR })
  const headline = items.find(item => item.specialTitle)?.specialTitle
    || weekdayLong.charAt(0).toUpperCase() + weekdayLong.slice(1)
  const massesSummary = `${items.length === 1 ? "1 missa" : `${items.length} missas`} · ${items.map(item => item.time).join(" · ")}`

  const handleOpenLiturgy = async () => {
    setIsLiturgyOpen(true)
    if (liturgyData) return

    setIsLoadingLiturgy(true)
    try {
      const formattedDate = rawDate.toISOString().split('T')[0]
      const data = await LiturgyService.getLiturgyForDate(formattedDate)
      setLiturgyData(data)
    } catch (e) {
      console.error(e)
    } finally {
      setIsLoadingLiturgy(false)
    }
  }

  useEffect(() => {
    const dbColor = items.find(item => item.liturgicalColor)?.liturgicalColor
    if (dbColor) {
      setLocalColor(dbColor)
    } else {
      const fetchColor = async () => {
        const formattedDate = rawDate.toISOString().split('T')[0]
        const color = await LiturgyService.getLiturgyColorForDate(formattedDate)
        if (color) {
          setLocalColor(color)
        }
      }
      fetchColor()
    }
  }, [items, rawDate])

  const adminBar = isAdmin && (
    <div className="flex items-center justify-between gap-2 rounded-t-[20px] border-b border-stone-100 bg-stone-50/50 px-3 py-1">
      <div className="flex items-center gap-3">
        {!isPublished ? (
          <Badge variant="outline" className="text-[9px] font-black bg-orange-50 text-orange-600 border-orange-200 py-0 px-2 h-5">
            RASCUNHO
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[9px] font-black bg-green-50 text-green-600 border-green-200 py-0 px-2 h-5">
            PUBLICADO
          </Badge>
        )}
        <div className="flex items-center gap-1.5 ml-1">
          <Switch 
            checked={isPublished} 
            onCheckedChange={onTogglePublish}
            className="scale-75"
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onEdit?.()}
          className="p-1 px-1.5 hover:bg-amber-100 rounded-lg text-stone-700 hover:text-stone-900 transition-colors flex items-center gap-1.5 text-[10px] font-black"
          title="Editar Dia"
        >
          <Pencil className="h-3.5 w-3.5" />
          EDITAR DIA
        </button>
        <button
          onClick={() => onDelete?.(allMassIds)}
          className="p-1 px-1.5 hover:bg-red-50 rounded-lg text-stone-600 hover:text-red-700 transition-colors flex items-center gap-1.5 text-[10px] font-black"
          title="Excluir Dia"
        >
          <Trash2 className="h-3.5 w-3.5" />
          EXCLUIR DIA
        </button>
      </div>
    </div>
  );

  const checkBadge = (
    <span role="img" aria-label="Confirmado" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#E6F2EA]">
      <Check className="h-4 w-4 text-[#1E6B43]" strokeWidth={3} />
    </span>
  )

  return (
    <Card className={cn(
      "!overflow-visible rounded-[20px] border-[#E9DFCB] bg-white shadow-[0_4px_14px_rgba(50,33,19,0.07)] p-0 gap-0 transition-all",
      !isPublished && isAdmin && "border-2 border-orange-500 ring-2 ring-orange-100",
      isDatePast && !isExpanded && "opacity-90"
    )}>
      {adminBar}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        className={cn(
          "flex cursor-pointer select-none items-center gap-3 bg-[#FAF5E6] px-4 py-3 transition-colors hover:bg-[#F4EEDD]",
          !isAdmin && "rounded-t-[20px]",
          isExpanded ? "border-b border-[#F1EADC]" : "rounded-b-[20px]"
        )}
        onClick={() => setIsExpanded(!isExpanded)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            setIsExpanded(!isExpanded)
          }
        }}
      >
        {/* Chip da data: marrom nos domingos, claro nos demais dias */}
        <span
          className={cn(
            "flex h-[52px] w-12 shrink-0 flex-col items-center justify-center rounded-[14px] leading-none",
            isSunday ? "bg-[#322113] text-[#FFF8E8]" : "border border-[#E9DFCB] bg-white text-[#241A10]",
            isDatePast && "opacity-70"
          )}
        >
          <span className={cn("text-[11px] font-bold tracking-wide", isSunday ? "text-[#E8C76A]" : "text-[#6B5D50]")}>
            {weekdayShort}
          </span>
          <span className="mt-1 text-xl font-extrabold">{dayNumber}</span>
        </span>

        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className={cn("truncate text-[15px] font-extrabold tracking-tight text-black", isDatePast && "text-stone-600")}>
            {headline}
          </span>
          <span className="truncate text-xs text-[#6B5D50]">{massesSummary}</span>
        </span>

        {isDatePast && !isExpanded && (
          <Badge variant="outline" className="h-5 shrink-0 border-green-100 bg-green-50 px-2 py-0 text-[10px] font-bold text-green-700">
            CONCLUÍDO
          </Badge>
        )}

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            handleOpenLiturgy()
          }}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-black transition-colors hover:bg-stone-200/60"
          title="Ver Liturgia Diária"
          aria-label="Ver Liturgia Diária"
        >
          <BookSearch className="h-[22px] w-[22px]" />
        </button>
        <span className="shrink-0 text-black" aria-hidden="true">
          {isExpanded ? <ChevronUp className="h-[18px] w-[18px]" /> : <ChevronDown className="h-[18px] w-[18px]" />}
        </span>
      </div>

      {isExpanded && (
        <CardContent className="p-0 animate-in fade-in slide-in-from-top-1 duration-200">
          {items.map((item, itemIndex) => (
            <div key={item.id} className={cn("flex flex-col", itemIndex > 0 && "border-t border-[#F1EADC] pt-1")}>
              {/* Sub-header do Horário */}
              <div className="flex items-center gap-2 px-4 pb-1.5 pt-3 text-[13px] font-extrabold tracking-tight text-black">
                <Clock className="h-4 w-4 shrink-0" />
                <span>
                  {item.time}
                  {item.specialTitle && <span> — {item.specialTitle}</span>}
                </span>
              </div>

              <div className="flex flex-col gap-1 px-2 pb-2.5">
                {item.slots.map((slot) => {
                  const showPending = isPublished && !isDatePast && !slot.isConfirmed && !slot.isMine && !slot.isSwapRequested
                  return (
                    <div
                      key={slot.id}
                      id={`slot-${slot.id}`}
                      className={cn(
                        "flex min-h-[52px] items-center gap-3 rounded-[14px] px-2.5 py-2 transition-all",
                        slot.isSwapRequested
                          ? "bg-[#FDEBDD]"
                          : slot.isMine
                            ? "bg-[#FFF6D6] ring-1 ring-[#E8B21E]/80"
                            : "bg-[#FAF5E6]/60"
                      )}
                    >
                      <div className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border text-xs font-extrabold transition-all",
                        slot.isSwapRequested
                          ? "border-[#F2B791] bg-white text-[#A23F06]"
                          : slot.isConfirmed
                            ? "border-[#8CC3A1] bg-[#E6F2EA] text-[#1E6B43]"
                            : slot.isMine
                              ? "border-[#E8B21E] bg-[#E8B21E] text-[#241A10]"
                              : "border-[#D9CDB8] bg-[#F5F0E4] text-black"
                      )}>
                        {isDatePast && slot.isSwapRequested ? <X className="h-4 w-4" /> : slot.isSwapRequested ? <RefreshCw className="h-4 w-4" /> : slot.role}
                      </div>

                      <div className="flex min-w-0 flex-1 flex-col gap-px">
                        <span className={cn("truncate text-sm font-bold leading-tight", slot.readerArchived ? "text-red-700" : "text-black")}>
                          {slot.readerName || "---"}{slot.readerArchived && " · membro inativo"}
                        </span>
                        <span className="truncate text-xs text-[#6B5D50]">
                          {slot.roleName || roleLabel(slot.role)}
                          {slot.isMine && !slot.isSwapRequested && " · você"}
                          {slot.isSwapRequested && <span className="font-bold text-[#A23F06]"> · troca aberta</span>}
                        </span>
                        {!!slot.previousAssignments?.length && (
                          <span className="text-[10px] text-red-700">Anteriormente: {slot.previousAssignments.map(p => `${p.fullName}${p.archived ? " · membro inativo" : ""}`).join(", ")}</span>
                        )}
                        {slot.originalReaderName && slot.readerName !== slot.originalReaderName && (
                          <span className={cn("text-[10px] font-medium italic", slot.originalReaderArchived ? "text-red-700" : "text-[#6B5D50]")}>
                            substituiu {slot.originalReaderName}{slot.originalReaderArchived && " · membro inativo"}
                          </span>
                        )}
                      </div>

                      <div className="flex shrink-0 items-center gap-1.5">
                        {slot.readerName && slot.readerName !== "---" && slot.isConfirmed && !slot.isMine && (
                          <UserAvatar
                            name={slot.readerName}
                            src={slot.avatarUrl}
                            isClaimed={slot.isClaimed}
                            className="h-7 w-7 shrink-0"
                          />
                        )}

                        {slot.isConfirmed && !slot.isSwapRequested && checkBadge}

                        {showPending && (
                          <span className="text-xs font-bold text-[#6B5D50]">Pendente</span>
                        )}

                        {/* Confirmar/Trocar/Assumir (Apenas se NÃO for passado) */}
                        {isPublished && !isDatePast && slot.isMine && !slot.isSwapRequested && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-10 rounded-xl px-2.5 text-xs font-bold text-[#6B5D50] hover:bg-amber-100 hover:text-stone-900"
                              onClick={() => onRequestSwap?.(slot.id)}
                            >
                              Trocar
                            </Button>
                            {!slot.isConfirmed && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-10 rounded-xl bg-[#1E6B43] px-3.5 text-xs font-extrabold text-white shadow-sm hover:bg-[#17553a] hover:text-white"
                                onClick={() => onConfirm?.(slot.id)}
                              >
                                Confirmar
                              </Button>
                            )}
                          </>
                        )}

                        {isPublished && !isDatePast && slot.isSwapRequested && !slot.isMine && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-10 rounded-full bg-[#1E6B43] px-3.5 text-xs font-extrabold text-white shadow-sm transition-all hover:bg-[#17553a] hover:text-white active:scale-95"
                            onClick={() => onTakeSwap?.(slot.id)}
                          >
                            <UserPlus className="mr-1.5 h-4 w-4" />
                            Assumir
                          </Button>
                        )}

                        {isPublished && slot.isMine && slot.isSwapRequested && (
                          <>
                            {isDatePast && (
                              <Badge
                                variant="outline"
                                className="border-red-200 bg-red-50 text-[10px] font-black text-red-700"
                              >
                                Troca Não Realizada
                              </Badge>
                            )}
                            {!isDatePast && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-10 rounded-xl px-2.5 text-xs font-bold text-red-600 hover:bg-red-50 hover:text-red-700"
                                onClick={() => onCancelSwap?.(slot.id)}
                              >
                                Cancelar troca
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </CardContent>
      )}

      {/* Painel Lateral (Sheet) com a Liturgia do Dia */}
      <Sheet open={isLiturgyOpen} onOpenChange={setIsLiturgyOpen}>
        <SheetContent side="right" className="w-[90%] sm:max-w-xl h-full bg-stone-50/95 backdrop-blur-md p-0 flex flex-col border-l border-stone-200" showCloseButton={true}>
          {(() => {
            const headerColors: Record<string, string> = {
              Verde: "bg-emerald-600 text-white",
              Roxo: "bg-purple-600 text-white",
              Vermelho: "bg-red-600 text-white",
              Rosa: "bg-pink-500 text-white",
              Branco: "bg-stone-200 text-stone-800",
            }
            const currentHeaderColor = localColor ? (headerColors[localColor] || "bg-stone-200 text-stone-800") : "bg-stone-200 text-stone-800"
            const isWhiteHeader = localColor === "Branco"
            
            return (
              <SheetHeader className={cn("text-center px-6 py-6 shrink-0 flex flex-col relative", currentHeaderColor)}>
                <SheetTitle className={cn("font-black text-lg tracking-tight leading-snug pr-8 text-left", isWhiteHeader ? "text-stone-800" : "text-white")}>
                  {liturgyData?.liturgia || "Liturgia Diária"}
                </SheetTitle>
                <SheetDescription className={cn("text-xs font-semibold mt-1 text-left opacity-90", isWhiteHeader ? "text-stone-500" : "text-white/90")}>
                  {date}
                </SheetDescription>
              </SheetHeader>
            )
          })()}

          <div className="flex-1 overflow-y-auto px-6 py-4">
            {isLoadingLiturgy ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-stone-400" />
                <span className="text-xs text-stone-400 font-bold uppercase tracking-wider">Buscando Leituras...</span>
              </div>
            ) : liturgyData ? (
              <div className="space-y-6 text-stone-800 pb-10 font-serif">
                {/* Oração da Coleta */}
                {liturgyData.oracoes?.coleta && (
                  <div className="bg-white p-5 rounded-[24px] border border-stone-200/40 shadow-xs space-y-2">
                    <h4 className="text-[15px] font-black uppercase text-[#0f5499] tracking-wider mb-1">Coleta</h4>
                    <p className="text-[17px] leading-relaxed text-stone-700 whitespace-pre-line">
                      {LiturgyService.cleanVersesText(liturgyData.oracoes.coleta)}
                    </p>
                  </div>
                )}

                {/* Primeira Leitura */}
                {liturgyData.leituras?.primeiraLeitura?.map((l, i) => (
                  <div key={i} className="bg-white p-6 rounded-[24px] border border-stone-200/40 shadow-xs space-y-3">
                    <div className="flex justify-between items-baseline border-b border-stone-100 pb-2">
                      <h4 className="text-[17px] font-black text-[#0f5499]">1ª Leitura</h4>
                      <span className="text-[11px] font-bold text-stone-400 uppercase tracking-wider">{l.referencia}</span>
                    </div>
                    <h5 className="text-[15px] font-bold text-stone-800 italic leading-snug">{l.titulo}</h5>
                    <p className="text-[17px] leading-relaxed text-stone-700 whitespace-pre-line">
                      {LiturgyService.cleanVersesText(l.texto)}
                    </p>
                  </div>
                ))}

                {/* Salmo Responsorial */}
                {liturgyData.leituras?.salmo?.map((s, i) => (
                  <div key={i} className="bg-white p-6 rounded-[24px] border border-stone-200/40 shadow-xs space-y-3">
                    <div className="flex justify-between items-baseline border-b border-stone-100 pb-2">
                      <h4 className="text-[17px] font-black text-[#0f5499]">Salmo Responsorial</h4>
                      <span className="text-[11px] font-bold text-stone-400 uppercase tracking-wider">{s.referencia}</span>
                    </div>
                    <div className="text-[17px] leading-snug">
                      <span className="text-red-700 font-black mr-2">REFRÃO:</span>
                      <span className="font-bold italic text-stone-900">{LiturgyService.cleanVersesText(s.refrao)}</span>
                    </div>
                    <div className="text-[17px] leading-relaxed text-stone-700 space-y-3">
                      {(() => {
                        let paragraphCount = 0
                        return LiturgyService.cleanVersesText(s.texto)
                          .split('\n')
                          .map((line) => line.trim())
                          .filter((line) => line.length > 0)
                          .map((line, idx) => {
                            paragraphCount++
                            let cleanLine = line
                            if (cleanLine.startsWith('—') || cleanLine.startsWith('-')) {
                              cleanLine = cleanLine.substring(1).trim()
                            }
                            return (
                              <p key={idx} className="text-stone-700">
                                <span className="text-red-700 font-bold mr-1.5">{paragraphCount}.</span> {cleanLine}
                              </p>
                            )
                          })
                      })()}
                    </div>
                  </div>
                ))}

                {/* Segunda Leitura */}
                {liturgyData.leituras?.segundaLeitura?.map((l, i) => (
                  <div key={i} className="bg-white p-6 rounded-[24px] border border-stone-200/40 shadow-xs space-y-3">
                    <div className="flex justify-between items-baseline border-b border-stone-100 pb-2">
                      <h4 className="text-[17px] font-black text-[#0f5499]">2ª Leitura</h4>
                      <span className="text-[11px] font-bold text-stone-400 uppercase tracking-wider">{l.referencia}</span>
                    </div>
                    <h5 className="text-[15px] font-bold text-stone-800 italic leading-snug">{l.titulo}</h5>
                    <p className="text-[17px] leading-relaxed text-stone-700 whitespace-pre-line">
                      {LiturgyService.cleanVersesText(l.texto)}
                    </p>
                  </div>
                ))}

                {/* Evangelho */}
                {liturgyData.leituras?.evangelho?.map((l, i) => (
                  <div key={i} className="bg-white p-6 rounded-[24px] border border-stone-200/40 shadow-xs space-y-3">
                    <div className="flex justify-between items-baseline border-b border-stone-100 pb-2">
                      <h4 className="text-[17px] font-black text-red-700">Evangelho</h4>
                      <span className="text-[11px] font-bold text-stone-400 uppercase tracking-wider">{l.referencia}</span>
                    </div>
                    <h5 className="text-[15px] font-bold text-stone-800 italic leading-snug">{l.titulo}</h5>
                    <p className="text-[17px] leading-relaxed text-stone-700 whitespace-pre-line">
                      {LiturgyService.cleanVersesText(l.texto)}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-20 text-xs text-stone-400 font-bold uppercase tracking-wider font-sans">
                Não foi possível carregar a liturgia.
              </div>
            )}
          </div>

          <SheetFooter className="px-6 py-4 shrink-0 border-t border-stone-200/50 bg-stone-50">
            <SheetClose render={
              <Button className="w-full bg-[#1b1816] text-white hover:bg-stone-800 font-black h-12 rounded-2xl shadow-sm transition-all text-sm uppercase tracking-wider">
                Fechar Leituras
              </Button>
            } />
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </Card>
  )
}
