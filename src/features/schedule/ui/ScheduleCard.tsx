"use client"

import { useState, useEffect } from "react"
import { Button } from "@/shared/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card"
import { Badge } from "@/shared/ui/badge"
import { Switch } from "@/shared/ui/switch"
import { cn } from "@/shared/lib/utils"
import { CalendarDays, Clock, RefreshCw, CheckCircle, UserPlus, Pencil, Trash2, ChevronDown, ChevronUp, X, BookOpen, Loader2 } from "lucide-react"
import { isPast, isToday, startOfDay } from "date-fns"
import { UserAvatar } from "@/shared/ui/UserAvatar"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/shared/ui/drawer"
import { LiturgyService, LiturgyData } from "@/shared/api/LiturgyService"

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
      "!overflow-visible border-stone-200 bg-white shadow-sm p-0 gap-0 transition-all",
      !isPublished && isAdmin && "border-2 border-orange-500 ring-2 ring-orange-100",
      isDatePast && !isExpanded && "opacity-80",
      localColor === 'Verde' && "border-l-4 border-l-emerald-600",
      localColor === 'Roxo' && "border-l-4 border-l-purple-600",
      localColor === 'Vermelho' && "border-l-4 border-l-red-600",
      localColor === 'Rosa' && "border-l-4 border-l-pink-500",
      localColor === 'Branco' && "border-2 border-[#d4af37]"
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

          <div className="flex items-center gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation()
                handleOpenLiturgy()
              }}
              className="p-1 px-1.5 hover:bg-stone-200/60 text-stone-500 hover:text-stone-800 rounded-lg transition-all"
              title="Ver Liturgia Diária"
            >
              <BookOpen className="h-4 w-4" />
            </button>
            <div className="text-stone-400">
              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </div>
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
                      "mx-1 flex items-center justify-between py-1.5 px-3 rounded-xl border border-stone-100/10 transition-all",
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

      {/* Drawer com a Liturgia do Dia */}
      <Drawer open={isLiturgyOpen} onOpenChange={setIsLiturgyOpen}>
        <DrawerContent className="!data-[vaul-drawer-direction=bottom]:max-h-[96vh] h-[96vh] bg-stone-50/95 backdrop-blur-md">
          <div className="mx-auto w-full max-w-lg px-6 pb-8 overflow-y-auto h-full flex flex-col">
            {(() => {
              const headerColors: Record<string, string> = {
                Verde: "bg-emerald-600 text-white",
                Roxo: "bg-purple-600 text-white",
                Vermelho: "bg-red-600 text-white",
                Rosa: "bg-pink-500 text-white",
                Branco: "bg-[#d4af37] text-white",
              }
              const currentHeaderColor = localColor ? (headerColors[localColor] || "bg-stone-200 text-stone-800") : "bg-stone-200 text-stone-800"
              return (
                <DrawerHeader className={cn("text-center px-4 py-5 shrink-0 rounded-t-xl transition-all", currentHeaderColor)}>
                  <DrawerTitle className="font-black text-lg tracking-tight text-inherit">
                    {liturgyData?.liturgia || "Liturgia Diária"}
                  </DrawerTitle>
                  <DrawerDescription className="text-xs font-medium mt-1 opacity-90 text-inherit">
                    {date}
                  </DrawerDescription>
                </DrawerHeader>
              )
            })()}

            <div className="flex-1 overflow-y-auto pr-1">
              {isLoadingLiturgy ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <Loader2 className="h-8 w-8 animate-spin text-stone-400" />
                  <span className="text-xs text-stone-400 font-bold uppercase tracking-wider">Buscando Leituras...</span>
                </div>
              ) : liturgyData ? (
                <div className="space-y-6 mt-6 text-stone-800 pb-10">
                  {/* Oração da Coleta */}
                  {liturgyData.oracoes?.coleta && (
                    <div className="bg-white p-4.5 rounded-2xl border border-stone-200/40 shadow-xs">
                      <h4 className="text-[10px] font-black uppercase text-stone-400 tracking-wider mb-2">Coleta</h4>
                      <p className="text-[15px] leading-relaxed text-stone-600 whitespace-pre-line">
                        {LiturgyService.cleanVersesText(liturgyData.oracoes.coleta)}
                      </p>
                    </div>
                  )}

                  {/* Primeira Leitura */}
                  {liturgyData.leituras?.primeiraLeitura?.map((l, i) => (
                    <div key={i} className="bg-white p-5 rounded-[24px] border border-stone-200/40 shadow-xs space-y-3">
                      <div className="flex justify-between items-baseline border-b border-stone-100 pb-2">
                        <h4 className="text-[11px] font-black uppercase text-amber-700 tracking-wider">1ª Leitura</h4>
                        <span className="text-[10px] font-black text-stone-400 uppercase tracking-widest">{l.referencia}</span>
                      </div>
                      <h5 className="text-[14px] font-black text-stone-800 italic leading-tight">{l.titulo}</h5>
                      <p className="text-[15px] leading-relaxed text-stone-600 whitespace-pre-line">
                        {LiturgyService.cleanVersesText(l.texto)}
                      </p>
                    </div>
                  ))}

                  {/* Salmo Responsorial */}
                  {liturgyData.leituras?.salmo?.map((s, i) => (
                    <div key={i} className="bg-white p-5 rounded-[24px] border border-stone-200/40 shadow-xs space-y-3">
                      <div className="flex justify-between items-baseline border-b border-stone-100 pb-2">
                        <h4 className="text-[11px] font-black uppercase text-amber-700 tracking-wider">Salmo Responsorial</h4>
                        <span className="text-[10px] font-black text-stone-400 uppercase tracking-widest">{s.referencia}</span>
                      </div>
                      <div className="bg-amber-50/50 p-4.5 rounded-2xl border border-amber-100/50 text-[14px] font-black text-amber-900 leading-snug">
                        Refrão: {LiturgyService.cleanVersesText(s.refrao)}
                      </div>
                      <p className="text-[15px] leading-relaxed text-stone-600 whitespace-pre-line">
                        {LiturgyService.cleanVersesText(s.texto)}
                      </p>
                    </div>
                  ))}

                  {/* Segunda Leitura */}
                  {liturgyData.leituras?.segundaLeitura?.map((l, i) => (
                    <div key={i} className="bg-white p-5 rounded-[24px] border border-stone-200/40 shadow-xs space-y-3">
                      <div className="flex justify-between items-baseline border-b border-stone-100 pb-2">
                        <h4 className="text-[11px] font-black uppercase text-amber-700 tracking-wider">2ª Leitura</h4>
                        <span className="text-[10px] font-black text-stone-400 uppercase tracking-widest">{l.referencia}</span>
                      </div>
                      <h5 className="text-[14px] font-black text-stone-800 italic leading-tight">{l.titulo}</h5>
                      <p className="text-[15px] leading-relaxed text-stone-600 whitespace-pre-line">
                        {LiturgyService.cleanVersesText(l.texto)}
                      </p>
                    </div>
                  ))}

                  {/* Evangelho */}
                  {liturgyData.leituras?.evangelho?.map((l, i) => (
                    <div key={i} className="bg-white p-5 rounded-[24px] border border-stone-200/40 shadow-xs space-y-3">
                      <div className="flex justify-between items-baseline border-b border-stone-100 pb-2">
                        <h4 className="text-[11px] font-black uppercase text-red-600 tracking-wider">Evangelho</h4>
                        <span className="text-[10px] font-black text-stone-400 uppercase tracking-widest">{l.referencia}</span>
                      </div>
                      <h5 className="text-[14px] font-black text-stone-800 italic leading-tight">{l.titulo}</h5>
                      <p className="text-[15px] leading-relaxed text-stone-600 whitespace-pre-line">
                        {LiturgyService.cleanVersesText(l.texto)}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-16 text-xs text-stone-400 font-bold uppercase tracking-wider">
                  Não foi possível carregar a liturgia.
                </div>
              )}
            </div>

            <DrawerFooter className="px-0 pt-4 shrink-0 border-t border-stone-200/50">
              <DrawerClose asChild>
                <Button variant="ghost" className="w-full text-stone-500 font-bold h-12 rounded-xl hover:bg-stone-100">
                  Fechar Leituras
                </Button>
              </DrawerClose>
            </DrawerFooter>
          </div>
        </DrawerContent>
      </Drawer>
    </Card>
  )
}
