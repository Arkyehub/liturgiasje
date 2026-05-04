"use client"

import { useState } from "react"
import { Button } from "@/shared/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card"
import { Badge } from "@/shared/ui/badge"
import { Switch } from "@/shared/ui/switch"
import { cn } from "@/shared/lib/utils"
import { CalendarDays, Clock, RefreshCw, CheckCircle, UserPlus, Pencil, Trash2, ChevronDown, ChevronUp, X } from "lucide-react"
import { isPast, isToday, startOfDay } from "date-fns"
import { UserAvatar } from "@/shared/ui/UserAvatar"

interface ReaderSlot {
  id: string
  role: "C" | "1L" | "2L" | "P" | "L"
  roleName?: string
  readerName?: string
  avatarUrl?: string
  isClaimed?: boolean
  originalReaderName?: string
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

  const allMassIds = items.map(item => item.id);

  const adminBar = isAdmin && (
    <div className="flex items-center justify-between gap-2 border-b border-stone-100 bg-stone-50/50 px-3 py-1">
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

  return (
    <Card className={cn(
      "overflow-hidden border-stone-200 bg-white shadow-sm p-0 gap-0 transition-all",
      !isPublished && isAdmin && "border-2 border-orange-500 ring-2 ring-orange-100",
      isDatePast && !isExpanded && "opacity-80"
    )}>
      {adminBar}
      <CardHeader
        className={cn(
          "bg-stone-50/50 p-4 pb-3 border-b border-stone-100 cursor-pointer hover:bg-stone-100/50 transition-colors select-none",
          isDatePast && !isExpanded && "border-b-0 pb-4"
        )}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-stone-700">
            {isDatePast ? (
              <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
            ) : (
              <CalendarDays className="h-4 w-4 shrink-0" />
            )}
            <span className={cn(
              "text-sm font-bold uppercase tracking-tight",
              isDatePast && "text-stone-500 line-through decoration-stone-300"
            )}>
              {date}
            </span>
            {isDatePast && !isExpanded && (
              <Badge variant="outline" className="text-[8px] font-bold bg-green-50 text-green-700 border-green-100 py-0 px-1.5 h-4 ml-1">
                CONCLUÍDO
              </Badge>
            )}
          </div>

          <div className="text-stone-400">
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="p-0 animate-in fade-in slide-in-from-top-1 duration-200">
          {items.map((item, itemIndex) => (
            <div key={item.id} className={cn("flex flex-col", itemIndex > 0 && "border-t-4 border-stone-200")}>
              {/* Sub-header do Horário */}
              <div className="flex items-center bg-stone-50/30 px-4 py-2 border-b border-stone-50 gap-3">
                <div className="flex items-center gap-2 text-stone-600">
                  <Clock className="h-3.5 w-3.5" />
                  <span className="text-xs font-black tracking-tight">
                    {item.time} {item.specialTitle && <span className="text-stone-600 ml-1"> — {item.specialTitle}</span>}
                  </span>
                </div>
              </div>

              <div className="divide-y divide-stone-100">
                {item.slots.map((slot) => (
                  <div
                    key={slot.id}
                    id={`slot-${slot.id}`}
                    className={cn(
                      "flex items-center justify-between py-1.5 px-3 rounded-xl border border-stone-100/10 transition-all",
                      slot.isSwapRequested ? "bg-red-50/70 border-l-4 border-l-red-200" :
                        slot.isConfirmed && slot.isMine ? "bg-green-50" : "bg-stone-50/40"
                    )}
                  >
                    <div className="flex items-center justify-between w-full">
                      <div className="flex items-center gap-3">
                        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-black border transition-all ${isDatePast && slot.isSwapRequested
                            ? "bg-red-100 text-red-700 border-red-200"
                            : slot.isSwapRequested
                              ? "bg-red-100 text-red-700 border-red-200 animate-pulse"
                              : slot.isConfirmed
                                ? "bg-green-100 text-green-700 border-green-600"
                                : "bg-stone-50 text-stone-600 border-stone-400"
                          }`}>
                          {isDatePast && slot.isSwapRequested ? <X className="h-3.5 w-3.5" /> : slot.isSwapRequested ? <RefreshCw className="h-3.5 w-3.5" /> : slot.role}
                        </div>

                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-[13px] font-bold text-stone-800 leading-tight truncate">
                            {slot.readerName || "---"}
                          </span>
                          {slot.readerName && slot.readerName !== "---" && slot.isConfirmed && (
                            <UserAvatar 
                              name={slot.readerName}
                              src={slot.avatarUrl}
                              isClaimed={slot.isClaimed}
                              className="h-6 w-6 shrink-0 ml-1"
                            />
                          )}
                          {slot.originalReaderName && slot.readerName !== slot.originalReaderName && (
                            <span className="text-[9px] font-medium text-stone-400 italic shrink-0">
                              (subst. {slot.originalReaderName})
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {/* Botão Confirmar/Trocar/Assumir (Apenas se NÃO for passado) */}

                        {isPublished && !isDatePast && slot.isMine && !slot.isSwapRequested && (
                          <div className="flex items-center gap-1.5">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2 text-[10px] font-bold text-stone-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg"
                              onClick={() => onRequestSwap?.(slot.id)}
                            >
                              TROCAR
                            </Button>
                            {slot.isConfirmed ? (
                              <div className="flex items-center justify-center w-8 h-8 bg-green-100 text-green-700 rounded-full border border-green-200 animate-in fade-in zoom-in-95 duration-300 shadow-sm">
                                <CheckCircle className="h-5 w-5" />
                              </div>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 px-3 text-[10px] font-bold bg-green-700 text-white hover:bg-green-800 rounded-lg shadow-sm"
                                onClick={() => onConfirm?.(slot.id)}
                              >
                                CONFIRMAR
                              </Button>
                            )}
                          </div>
                        )}

                        {isPublished && !isDatePast && slot.isSwapRequested && !slot.isMine && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-3 text-[10px] font-bold bg-green-700 text-white hover:bg-green-800 shadow-sm rounded-full transition-all active:scale-95"
                            onClick={() => onTakeSwap?.(slot.id)}
                          >
                            <UserPlus className="mr-1.5 h-3.5 w-3.5" />
                            Assumir Troca
                          </Button>
                        )}

                        {isPublished && slot.isMine && slot.isSwapRequested && (
                          <div className="flex items-center gap-1.5">
                            {isDatePast && (
                              <Badge
                                variant="outline"
                                className="text-[9px] font-black bg-red-50 text-red-700 border-red-200"
                              >
                                Troca Não Realizada
                              </Badge>
                            )}
                            {!isDatePast && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 px-2 text-[10px] font-bold text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg"
                                onClick={() => onCancelSwap?.(slot.id)}
                              >
                                CANCELAR TROCA
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      )}
    </Card>
  )
}
