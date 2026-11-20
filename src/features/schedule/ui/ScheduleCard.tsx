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
import { LiturgyService } from "@/shared/api/LiturgyService"
import { LiturgySheet } from "@/features/schedule/ui/LiturgySheet"

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
  const [localColor, setLocalColor] = useState<string | null>(null)

  const allMassIds = items.map(item => item.id);

  // Cabeçalho: domingos ganham o chip marrom; dias de semana usam o chip claro
  const isSunday = rawDate.getDay() === 0
  const weekdayShort = format(rawDate, "EEEE", { locale: ptBR }).normalize("NFD").replace(/[\u0300-\u036f]/g, "").slice(0, 3).toUpperCase()
  const dayNumber = format(rawDate, "d")
  const weekdayLong = format(rawDate, "EEEE", { locale: ptBR })
  const headline = items.find(item => item.specialTitle)?.specialTitle
    || weekdayLong.charAt(0).toUpperCase() + weekdayLong.slice(1)
  const shortTime = (t: string) => {
    const [h, m] = t.split(":")
    return m && m !== "00" ? `${h}h${m}` : `${h}h`
  }
  const massesSummary = `${items.length === 1 ? "1 missa" : `${items.length} missas`} · ${items.map(item => shortTime(item.time)).join(" · ")}`

  const handleOpenLiturgy = () => setIsLiturgyOpen(true)

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
            "flex h-[50px] w-12 shrink-0 flex-col items-center justify-center gap-0.5 rounded-[14px] leading-none",
            isSunday ? "bg-[#322113] text-[#FFF8E8]" : "border border-[#E9DFCB] bg-white text-[#241A10]",
            isDatePast && "opacity-70"
          )}
        >
          <span className={cn("text-[11px] font-bold tracking-wide", isSunday ? "text-[#E8C76A]" : "text-[#6B5D50]")}>
            {weekdayShort}
          </span>
          <span className="text-xl font-extrabold leading-none">{dayNumber}</span>
        </span>

        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className={cn("truncate text-[15px] font-extrabold tracking-tight text-black", isDatePast && "text-stone-600")}>
            {headline}
          </span>
          <span className="text-xs leading-snug text-[#6B5D50]">{massesSummary}</span>
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
                        "flex min-h-[52px] items-center gap-3 rounded-[14px] px-2 py-2 transition-all",
                        slot.isSwapRequested
                          ? "bg-[#FDEBDD]"
                          : slot.isMine
                            ? "bg-[#FFF6D6] ring-1 ring-[#E8B21E]/80"
                            : "bg-[#FAF5E6]/60"
                      )}
                    >
                      {slot.readerName && slot.readerName !== "---" ? (
                        <span className={cn(
                          "flex h-11 w-11 shrink-0 items-center justify-center rounded-full ring-[1.5px] ring-offset-2 ring-offset-transparent transition-all",
                          slot.isSwapRequested
                            ? "ring-[#E0824A]"
                            : slot.isConfirmed
                              ? "ring-[#2E8B57]"
                              : slot.isMine
                                ? "ring-[#E8B21E]"
                                : "ring-transparent"
                        )}>
                          <UserAvatar
                            name={slot.readerName}
                            src={slot.avatarUrl}
                            isClaimed={slot.isClaimed}
                            className="h-10 w-10"
                          />
                        </span>
                      ) : (
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-dashed border-[#D9CDB8] bg-[#F5F0E4] text-xs font-extrabold text-[#6B5D50]">
                          {slot.role}
                        </span>
                      )}

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

      <LiturgySheet
        dateKey={rawDate.toISOString().split('T')[0]}
        dateLabel={date}
        open={isLiturgyOpen}
        onOpenChange={setIsLiturgyOpen}
        color={localColor}
      />
    </Card>
  )
}
