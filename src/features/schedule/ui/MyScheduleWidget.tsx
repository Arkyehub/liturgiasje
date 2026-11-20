"use client"

import { useMemo, useState } from "react"
import { Mass } from "@/domain/models/Schedule"
import { Card } from "@/shared/ui/card"
import { AlertCircle, CalendarDays, CheckCircle, ChevronDown, ChevronRight, ExternalLink } from "lucide-react"
import { format, isAfter, startOfDay, parseISO, isValid } from "date-fns"
import { ptBR } from "date-fns/locale"
import { cn } from "@/shared/lib/utils"
import { roleName } from "@/features/schedule/roles"

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

  // 4. Filtrar para mostrar apenas a próxima e as subsequentes (ignorar passadas)
  const futureSlots = useMemo(() => {
    if (!nextReading) return []
    const index = mySlots.findIndex(s => s.id === nextReading.id)
    return mySlots.slice(index)
  }, [mySlots, nextReading])

  const otherReadings = futureSlots.slice(1)

  if (mySlots.length === 0) {
    return (
      <Card className="rounded-none border-x-0 border-t-0 border-dashed border-[#E9DFCB] bg-white p-3 shadow-none ring-0">
        <div className="flex items-center justify-center gap-2 py-1 text-[#6B5D50]">
          <CalendarDays className="h-4 w-4" />
          <span className="text-sm font-medium italic">Você não tem leituras futuras.</span>
        </div>
      </Card>
    )
  }

  if (!nextReading) {
    return (
      <Card className="rounded-none border-x-0 border-t-0 border-dashed border-green-200 bg-white p-3 shadow-none ring-0">
        <div className="flex items-center justify-center gap-2 py-1 text-green-700">
          <CheckCircle className="h-5 w-5" />
          <span className="text-sm font-bold uppercase tracking-tight">Suas leituras deste mês foram concluídas!</span>
        </div>
      </Card>
    )
  }

  const tone = isAlertMode
    ? { bar: "bg-[#322113]", press: "active:bg-[#241810]", divider: "border-white/15", icon: "bg-[#E8B21E] text-[#322113]", label: "text-[#E8C76A]", accent: "text-[#E8C76A]" }
    : isSwapActive
      ? { bar: "bg-[#7c2d12]", press: "active:bg-[#661f0b]", divider: "border-white/15", icon: "bg-orange-300 text-[#7c2d12]", label: "text-orange-200", accent: "text-orange-200" }
      : { bar: "bg-[#064e3b]", press: "active:bg-[#054031]", divider: "border-white/15", icon: "bg-emerald-300 text-[#064e3b]", label: "text-emerald-200", accent: "text-emerald-200" }

  const label = isAlertMode ? "Confirmar escala" : isSwapActive ? "Troca solicitada" : "Próxima leitura"

  const renderWhen = (slot: any) => {
    const date = parseISO(slot.massDate)
    return (
      <>
        <span className="capitalize">{isValid(date) ? format(date, "EEE dd/MM", { locale: ptBR }) : "--/--"}</span>
        {" "}às {slot.massTime.substring(0, 5)} · {roleName(slot.role)}
      </>
    )
  }

  return (
    <div className="w-full">
      {/* Barra Principal - Próxima Leitura ou Alerta de Confirmação */}
      <div className={cn("relative overflow-hidden text-white transition-colors duration-500", tone.bar)}>
        <div className="flex items-stretch">
          <button
            onClick={() => {
              if (!isAlertMode && otherReadings.length > 0) {
                setIsExpanded(!isExpanded)
              } else {
                onNavigateToSlot(activeSlot.id, activeSlot.massDate)
              }
            }}
            aria-expanded={!isAlertMode && otherReadings.length > 0 ? isExpanded : undefined}
            className={cn("flex min-h-14 min-w-0 flex-1 items-center gap-3 py-2 pl-4 pr-3 text-left transition-colors", tone.press)}
          >
            <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full", tone.icon)}>
              {isAlertMode ? <AlertCircle className="h-[18px] w-[18px]" /> : <CalendarDays className="h-[18px] w-[18px]" />}
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className={cn("text-[11px] font-extrabold uppercase tracking-widest", tone.label)}>{label}</span>
              <span className="truncate text-sm font-bold">{renderWhen(activeSlot)}</span>
            </span>
            {!isAlertMode && otherReadings.length > 0 && (
              <ChevronDown className={cn("h-[18px] w-[18px] shrink-0 transition-transform duration-300", tone.accent, isExpanded && "rotate-180")} />
            )}
            {isAlertMode && <ChevronRight className={cn("h-[18px] w-[18px] shrink-0", tone.accent)} />}
          </button>

          {/* Botão de Scroll Direto */}
          <button
            onClick={(e) => {
              e.stopPropagation()
              onNavigateToSlot(activeSlot.id, activeSlot.massDate)
            }}
            className={cn("flex w-[52px] shrink-0 items-center justify-center border-l transition-colors", tone.divider, tone.press)}
            title="Ver na escala"
            aria-label="Ver na escala"
          >
            <ExternalLink className="h-[18px] w-[18px]" />
          </button>
        </div>
      </div>

      {/* Lista Expandida - Outras Leituras */}
      {isExpanded && otherReadings.length > 0 && (
        <div className="grid divide-y divide-[#E9DFCB] border-b border-[#E9DFCB] bg-[#F4EEDD] animate-in slide-in-from-top-2 duration-300">
          {otherReadings.map((slot, index) => (
            <div key={slot.id} className="flex items-stretch">
              <button
                onClick={() => onNavigateToSlot(slot.id, slot.massDate)}
                className="flex min-h-12 min-w-0 flex-1 items-center gap-3 px-4 py-2 text-left text-[#322113] transition-colors active:bg-[#EADFCB]"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#EADFCB] text-[11px] font-extrabold">
                  {index + 2}
                </span>
                <span className="truncate text-[13px] font-bold">{renderWhen(slot)}</span>
              </button>
              <button
                onClick={() => onNavigateToSlot(slot.id, slot.massDate)}
                className="flex w-[52px] shrink-0 items-center justify-center border-l border-[#E9DFCB] text-[#322113]/60 transition-colors active:bg-[#EADFCB]"
                title="Ver na escala"
                aria-label="Ver na escala"
              >
                <ExternalLink className="h-[18px] w-[18px]" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
