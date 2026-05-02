"use client"

import { useMemo, useState } from "react"
import { Mass } from "@/domain/models/Schedule"
import { Card } from "@/shared/ui/card"
import { AlertCircle, CalendarDays, CheckCircle, ChevronDown, ChevronUp, ExternalLink } from "lucide-react"
import { format, isAfter, startOfDay, parseISO, isValid } from "date-fns"
import { ptBR } from "date-fns/locale"
import { cn } from "@/shared/lib/utils"
import { UserAvatar } from "@/shared/ui/UserAvatar"
import Image from "next/image"

interface MyScheduleWidgetProps {
  schedule: Mass[]
  userId?: string
  memberId?: string
  userName?: string
  userAvatar?: string | null
}

export function MyScheduleWidget({ schedule, userId, memberId, userName, userAvatar }: MyScheduleWidgetProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  // 1. Filtrar todas as escalas do usuário no mês
  const mySlots = useMemo(() => {
    const slots: any[] = []
    
    schedule.forEach(mass => {
      mass.slots.forEach(slot => {
        const isMine = slot.readerId ? slot.readerId === userId : (memberId && slot.memberId === memberId)
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
  }, [schedule, userId, memberId])

  // 2. Encontrar a próxima leitura (primeira leitura futura ou hoje)
  const nextReading = useMemo(() => {
    const today = startOfDay(new Date())
    return mySlots.find(slot => {
      const slotDate = parseISO(slot.massDate)
      return isAfter(slotDate, today) || format(slotDate, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd')
    })
  }, [mySlots])

  // 3. Função para scroll suave até o item
  const scrollToSlot = (slotId: string) => {
    const element = document.getElementById(`slot-${slotId}`)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' })
      
      // Feedback visual temporário
      element.classList.add('ring-4', 'ring-amber-500', 'ring-offset-2', 'transition-all', 'duration-500')
      setTimeout(() => {
        element.classList.remove('ring-4', 'ring-amber-500', 'ring-offset-2')
      }, 3000)
    }
  }

  const currentMonthName = useMemo(() => {
    if (mySlots.length > 0) {
      const date = parseISO(mySlots[0].massDate)
      return isValid(date) ? format(date, "MMMM", { locale: ptBR }) : ""
    }
    return format(new Date(), "MMMM", { locale: ptBR })
  }, [mySlots])

  if (mySlots.length === 0) {
    return (
      <Card className="p-3 bg-white border-amber-200 border-dashed">
        <div className="flex items-center justify-center gap-2 text-amber-700/60 py-1">
          <CalendarDays className="h-4 w-4" />
          <span className="text-sm font-medium italic">Você não tem leituras neste mês.</span>
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
    <Card className={cn(
      "relative overflow-hidden border transition-all duration-500 bg-white",
      !nextReading.isConfirmed 
        ? "border-amber-600 shadow-lg shadow-amber-200/50 ring-2 ring-amber-500/20 ring-offset-1 animate-glow-pulse" 
        : "border-stone-200 shadow-sm"
    )}>
      {/* Background Decorativo - Book SVG */}
      <div className="absolute right-[-5px] top-[-5px] opacity-[0.08] rotate-[15deg] pointer-events-none">
        <Image 
          src="/book-svgrepo-com.svg" 
          alt="Book Icon" 
          width={130} 
          height={130} 
          className="sepia hue-rotate-30 saturate-200 contrast-125"
        />
      </div>

      <div className="relative">
        {/* Header Principal - Próxima Leitura */}
        <div className="p-4">
          <p className="text-[11px] font-black text-amber-700 uppercase tracking-widest mb-3 px-0.5">
            Próxima leitura:
          </p>
          
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              <div className="relative shrink-0">
                <UserAvatar 
                  name={userName || "Usuário"} 
                  src={userAvatar} 
                  isClaimed={true}
                  className={cn(
                    "h-12 w-12 shrink-0 shadow-sm",
                    !nextReading.isConfirmed ? "border-2 border-amber-600" : "border-2 border-green-400"
                  )}
                />
                {!nextReading.isConfirmed && (
                  <div className="absolute -top-1.5 -right-1.5 bg-amber-600 text-white rounded-full p-1 shadow-md animate-bounce">
                    <AlertCircle className="h-3.5 w-3.5" />
                  </div>
                )}
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-3 mb-1.5">
                  <span className="text-[15px] font-black text-amber-950 leading-none uppercase tracking-tight">
                    {isValid(parseISO(nextReading.massDate)) ? format(parseISO(nextReading.massDate), "dd/MM", { locale: ptBR }) : "---"}
                  </span>
                  <span className="text-[15px] font-black text-amber-950 leading-none uppercase tracking-tight">
                    {nextReading.massTime.substring(0, 5)}
                  </span>
                  <div className="bg-amber-600 text-white text-[10px] font-black px-2 py-1 rounded-md uppercase leading-none shadow-sm">
                    Próxima
                  </div>
                </div>
                <h3 className="text-lg font-black text-stone-900 leading-tight truncate">
                  {roleNameMap[nextReading.role] || nextReading.role}
                </h3>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button 
                onClick={() => scrollToSlot(nextReading.id)}
                className="p-2.5 bg-amber-100 text-amber-900 rounded-full hover:bg-amber-200 active:scale-90 transition-all shadow-sm"
                title="Ver na escala"
              >
                <ExternalLink className="h-5 w-5" />
              </button>
              
              {mySlots.length > 1 && (
                <button 
                  onClick={() => setIsExpanded(!isExpanded)}
                  className={cn(
                    "p-2.5 rounded-full transition-all active:scale-90 shadow-sm",
                    isExpanded ? "bg-amber-800 text-white" : "bg-white border-2 border-amber-200 text-amber-800 hover:bg-amber-50"
                  )}
                >
                  {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Lista Expandida de Escalas */}
        {isExpanded && mySlots.length > 1 && (
          <div className="px-4 pb-4 pt-1 space-y-3 animate-in slide-in-from-top-2 duration-300">
            <div className="h-px bg-amber-100 w-full mb-3" />
            <p className="text-[11px] font-black text-amber-700 uppercase tracking-widest px-1">
              Todas as suas escalas do mês de {currentMonthName}
            </p>
            <div className="grid gap-2.5">
              {mySlots.map((slot) => {
                const sDate = parseISO(slot.massDate)
                const isNext = slot.id === nextReading.id
                
                return (
                  <button
                    key={slot.id}
                    onClick={() => scrollToSlot(slot.id)}
                    className={cn(
                      "flex items-center justify-between p-3.5 rounded-2xl border-2 transition-all text-left",
                      isNext 
                        ? "bg-amber-50 border-amber-300 shadow-sm" 
                        : "bg-white border-stone-100 hover:border-amber-200"
                    )}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-3 mb-1">
                        <span className="text-[14px] font-black text-amber-950 uppercase">
                          {isValid(sDate) ? format(sDate, "dd/MM") : "---"}
                        </span>
                        <span className="text-[14px] font-black text-amber-950 uppercase">
                          {slot.massTime.substring(0, 5)}
                        </span>
                        {isNext && (
                          <span className="bg-amber-500 text-white text-[9px] font-black px-2 py-0.5 rounded uppercase">
                            Próxima
                          </span>
                        )}
                      </div>
                      <p className="text-[15px] font-black text-stone-800 truncate">
                        {roleNameMap[slot.role] || slot.role}
                      </p>
                    </div>
                    
                    <div className="shrink-0 flex items-center gap-2">
                      {slot.isConfirmed ? (
                        <div className="flex items-center justify-center w-10 h-10 bg-green-100 text-green-700 rounded-full border-2 border-green-200 shadow-sm">
                          <CheckCircle className="h-6 w-6" />
                        </div>
                      ) : (
                        <AlertCircle className={cn("h-6 w-6", isNext ? "text-amber-600 animate-pulse" : "text-amber-200")} />
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Alerta de Confirmação Ocupando o Rodapé */}
        {!nextReading.isConfirmed && !isExpanded && (
          <button 
            onClick={() => scrollToSlot(nextReading.id)}
            className="w-full bg-amber-600 text-white px-4 py-2.5 flex items-center justify-center gap-3 border-t border-amber-500/50 hover:bg-amber-700 transition-colors shadow-lg"
          >
            <AlertCircle className="h-4 w-4 text-white animate-pulse" />
            <span className="text-[12px] font-black uppercase tracking-widest">
              Toque aqui para confirmar agora
            </span>
          </button>
        )}
      </div>
    </Card>
  )
}
