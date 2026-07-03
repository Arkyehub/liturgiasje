"use client"

import { useMemo, useState } from "react"
import { Mass } from "@/domain/models/Schedule"
import { Card } from "@/shared/ui/card"
import { AlertCircle, CalendarDays, CheckCircle, ChevronDown, ChevronRight, ChevronUp, ExternalLink } from "lucide-react"
import { format, isAfter, startOfDay, parseISO, isValid } from "date-fns"
import { ptBR } from "date-fns/locale"
import { cn } from "@/shared/lib/utils"
import { UserAvatar } from "@/shared/ui/UserAvatar"
import Image from "next/image"

interface MyScheduleWidgetProps {
  schedule: Mass[]
  profileId?: string
  userName?: string
  userAvatar?: string | null
  onNavigateToSlot: (slotId: string, date: string) => void
}

export function MyScheduleWidget({ schedule, profileId, userName, userAvatar, onNavigateToSlot }: MyScheduleWidgetProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  // 1. Filtrar todas as escalas do usuário no mês
  const mySlots = useMemo(() => {
    const slots: any[] = []
    
    schedule.forEach(mass => {
      mass.slots.forEach(slot => {
        const isMine = slot.profileId === profileId
        if (isMine) {
          slots.push({
            ...slot,
            massDate: mass.date,
            massTime: mass.time,
            specialDescription: mass.specialDescription
          })
        }
      })
    })

    // Ordenar por data e hora
    return slots.sort((a, b) => {
      const dateA = new Date(`${a.massDate}T${a.massTime}`)
      const dateB = new Date(`${b.massDate}T${b.massTime}`)
      return dateA.getTime() - dateB.getTime()
    })
  }, [schedule, profileId])

  // 2. Encontrar a próxima leitura (primeira leitura futura ou hoje)
  const nextReading = useMemo(() => {
    const today = startOfDay(new Date())
    return mySlots.find(slot => {
      const slotDate = parseISO(slot.massDate)
      return isAfter(slotDate, today) || format(slotDate, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd')
    })
  }, [mySlots])

  // 3. Encontrar a primeira leitura NÃO CONFIRMADA (e sem troca solicitada)
  const firstUnconfirmed = useMemo(() => {
    return mySlots.find(slot => !slot.isConfirmed && !slot.isSwapRequested)
  }, [mySlots])

  const isAlertMode = !!firstUnconfirmed
  const activeSlot = isAlertMode ? firstUnconfirmed : nextReading
  const isSwapActive = !!activeSlot?.isSwapRequested

  // 3. Função para scroll suave até o item

  const currentMonthName = useMemo(() => {
    if (mySlots.length > 0) {
      const date = parseISO(mySlots[0].massDate)
      return isValid(date) ? format(date, "MMMM", { locale: ptBR }) : ""
    }
    return format(new Date(), "MMMM", { locale: ptBR })
  }, [mySlots])

  // 4. Filtrar para mostrar apenas a próxima e as subsequentes (ignorar passadas)
  const futureSlots = useMemo(() => {
    if (!nextReading) return []
    const index = mySlots.findIndex(s => s.id === nextReading.id)
    return mySlots.slice(index)
  }, [mySlots, nextReading])

  const otherReadings = futureSlots.slice(1)

  if (mySlots.length === 0) {
    return (
      <Card className="p-3 bg-white border-emerald-100 border-dashed rounded-none">
        <div className="flex items-center justify-center gap-2 text-emerald-700/60 py-1">
          <CalendarDays className="h-4 w-4" />
          <span className="text-sm font-medium italic">Você não tem leituras futuras.</span>
        </div>
      </Card>
    )
  }

  if (!nextReading) {
    return (
      <Card className="p-3 bg-white border-green-200 border-dashed">
        <div className="flex items-center justify-center gap-2 text-green-700 py-1">
          <CheckCircle className="h-5 w-5" />
          <span className="text-sm font-bold uppercase tracking-tight">Suas leituras deste mês foram concluídas!</span>
        </div>
      </Card>
    )
  }

  const roleNameMap: Record<string, string> = {
    'C': 'Comentarista',
    '1L': '1ª Leitura',
    '2L': '2ª Leitura',
    'P': 'Preces',
    'L': 'Leitura Única'
  }

  return (
    <div className="w-full">
      {/* Barra Principal - Próxima Leitura ou Alerta de Confirmação */}
      <div className={cn(
        "relative overflow-hidden text-white border-b transition-colors duration-500",
        isAlertMode 
          ? "bg-red-600 border-red-900/50" 
          : isSwapActive
            ? "bg-[#9a3412] border-orange-950/50"
            : "bg-[#064e3b] border-emerald-900/50"
      )}>
        <div className="flex items-center">
          <button 
            onClick={() => {
              if (!isAlertMode && otherReadings.length > 0) {
                setIsExpanded(!isExpanded);
              } else {
                onNavigateToSlot(activeSlot.id, activeSlot.massDate);
              }
            }}
            className={cn(
              "flex-1 flex items-center justify-between p-3 transition-all min-w-0",
              isAlertMode 
                ? "active:bg-red-700" 
                : isSwapActive
                  ? "active:bg-[#7c2d12]"
                  : "active:bg-[#054031]"
            )}
          >
            <div className="flex items-center gap-2 min-w-0">
              {isAlertMode ? (
                <AlertCircle className="h-4 w-4 text-white animate-pulse shrink-0" />
              ) : (
                <CalendarDays className={cn("h-4 w-4 shrink-0", isSwapActive ? "text-orange-300" : "text-emerald-400")} />
              )}
              <p className="text-[12px] font-black tracking-tight truncate uppercase">
                {isAlertMode ? (
                  <span className="flex items-center gap-1.5">
                    <span className="opacity-100">Confirmar Escala:</span>
                    {isValid(parseISO(activeSlot.massDate)) ? format(parseISO(activeSlot.massDate), "dd/MM") : "--/--"} às {activeSlot.massTime.substring(0, 5)} - {activeSlot.role}
                  </span>
                ) : (
                  <>
                    <span className="opacity-70 mr-1.5">{isSwapActive ? "Troca Solicitada:" : "Próxima Leitura:"}</span>
                    {isValid(parseISO(activeSlot.massDate)) ? format(parseISO(activeSlot.massDate), "dd/MM") : "--/--"} às {activeSlot.massTime.substring(0, 5)} - {activeSlot.role}
                  </>
                )}
              </p>
            </div>
            
            {!isAlertMode && otherReadings.length > 0 && (
              <div className={cn(
                "p-1 transition-transform duration-300 ml-2",
                isExpanded && "rotate-180"
              )}>
                <ChevronDown className="h-3.5 w-3.5 opacity-60" />
              </div>
            )}

            {isAlertMode && (
              <div className="ml-2">
                <ChevronRight className="h-3.5 w-3.5 opacity-60" />
              </div>
            )}
          </button>

          {/* Botão de Scroll Direto */}
          <button 
            onClick={(e) => {
              e.stopPropagation();
              onNavigateToSlot(activeSlot.id, activeSlot.massDate);
            }}
            className={cn(
              "p-3 transition-colors border-l",
              isAlertMode 
                ? "hover:bg-red-700 border-red-700/50" 
                : isSwapActive
                  ? "hover:bg-[#7c2d12] border-orange-900/50"
                  : "hover:bg-emerald-800 border-emerald-800/50"
            )}
            title="Ver na escala"
          >
            <ExternalLink className={cn("h-4 w-4", isAlertMode ? "text-white" : isSwapActive ? "text-orange-300" : "text-emerald-400")} />
          </button>
        </div>
      </div>

      {/* Lista Expandida - Outras Leituras */}
      {isExpanded && otherReadings.length > 0 && (
        <div className="grid divide-y divide-emerald-100 animate-in slide-in-from-top-2 duration-300">
          {otherReadings.map((slot, index) => {
            const sDate = parseISO(slot.massDate)
            return (
              <div key={slot.id} className="flex items-center bg-[#f0fdf4]">
                <button
                  onClick={() => onNavigateToSlot(slot.id, slot.massDate)}
                  className="flex-1 flex items-center justify-between p-3 text-[#064e3b] hover:bg-emerald-50 active:bg-emerald-100 transition-all text-left min-w-0"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[10px] font-black uppercase opacity-60 shrink-0">{index + 2}ª -</span>
                    <p className="text-[11px] font-black tracking-tight truncate uppercase">
                      {isValid(sDate) ? format(sDate, "dd/MM") : "--/--"} às {slot.massTime.substring(0, 5)} - {slot.role}
                    </p>
                  </div>
                </button>
                
                {/* Botão de Scroll Direto (Alinhado com o de cima) */}
                <button 
                  onClick={() => onNavigateToSlot(slot.id, slot.massDate)}
                  className="p-3 hover:bg-emerald-100 border-l border-emerald-100 transition-colors"
                  title="Ver na escala"
                >
                  <ExternalLink className="h-4 w-4 text-emerald-800 opacity-30" />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
