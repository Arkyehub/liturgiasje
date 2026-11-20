"use client"

import { useEffect, useMemo, useState } from "react"
import { Mass } from "@/domain/models/Schedule"
import { BookOpen, CalendarDays, Check, CheckCircle, ChevronDown, Clock, ExternalLink, RefreshCw } from "lucide-react"
import { differenceInCalendarDays, format, isValid, parseISO, startOfDay } from "date-fns"
import { ptBR } from "date-fns/locale"
import { cn } from "@/shared/lib/utils"
import { roleLabel } from "@/shared/constants/roles"
import { LiturgyService, LiturgyData } from "@/shared/api/LiturgyService"
import { LiturgySheet } from "@/features/schedule/ui/LiturgySheet"

interface MyScheduleWidgetProps {
  schedule: Mass[]
  profileId?: string
  userName?: string
  userAvatar?: string | null
  onNavigateToSlot: (slotId: string, date: string) => void
  onConfirm: (slotId: string) => void
  onRequestSwap: (slotId: string) => void
  onCancelSwap: (slotId: string) => void
}

interface MySlot {
  id: string
  role: string
  isConfirmed: boolean
  isSwapRequested: boolean
  massDate: string
  massTime: string
  specialDescription?: string
}

function greeting(hour: number) {
  if (hour < 12) return "Bom dia"
  if (hour < 18) return "Boa tarde"
  return "Boa noite"
}

function whenLabel(days: number) {
  if (days <= 0) return "HOJE"
  if (days === 1) return "AMANHÃ"
  return `EM ${days} DIAS`
}

/** Referência bíblica da leitura da pessoa, quando a função tem uma leitura própria. */
function referenceFor(role: string, data: LiturgyData | null): string | null {
  if (!data) return null
  if (role === "1L" || role === "L") return data.leituras?.primeiraLeitura?.[0]?.referencia ?? null
  if (role === "2L") return data.leituras?.segundaLeitura?.[0]?.referencia ?? data.leituras?.primeiraLeitura?.[0]?.referencia ?? null
  return null
}

export function MyScheduleWidget({
  schedule,
  profileId,
  userName,
  onNavigateToSlot,
  onConfirm,
  onRequestSwap,
  onCancelSwap,
}: MyScheduleWidgetProps) {
  const [isListOpen, setIsListOpen] = useState(false)
  const [isLiturgyOpen, setIsLiturgyOpen] = useState(false)
  const [liturgy, setLiturgy] = useState<{ date: string; data: LiturgyData | null } | null>(null)

  // Minhas escalas, em ordem cronológica
  const mySlots = useMemo(() => {
    const slots: MySlot[] = []
    schedule.forEach(mass => {
      mass.slots.forEach(slot => {
        if (slot.profileId === profileId) {
          slots.push({
            id: slot.id,
            role: slot.role,
            isConfirmed: !!slot.isConfirmed,
            isSwapRequested: !!slot.isSwapRequested,
            massDate: mass.date,
            massTime: mass.time,
            specialDescription: mass.specialDescription,
          })
        }
      })
    })
    return slots.sort((a, b) =>
      new Date(`${a.massDate}T${a.massTime}`).getTime() - new Date(`${b.massDate}T${b.massTime}`).getTime()
    )
  }, [schedule, profileId])

  // Próxima leitura: de hoje em diante
  const futureSlots = useMemo(() => {
    const todayKey = format(startOfDay(new Date()), "yyyy-MM-dd")
    return mySlots.filter(slot => slot.massDate >= todayKey)
  }, [mySlots])

  const next = futureSlots[0]
  const otherReadings = futureSlots.slice(1)

  // Liturgia da próxima leitura (para mostrar a referência no botão "Ler e ensaiar")
  const nextDate = next?.massDate
  useEffect(() => {
    if (!nextDate) return
    let cancelled = false
    LiturgyService.getLiturgyForDate(nextDate)
      .then(data => { if (!cancelled) setLiturgy({ date: nextDate, data }) })
      .catch(() => { if (!cancelled) setLiturgy({ date: nextDate, data: null }) })
    return () => { cancelled = true }
  }, [nextDate])

  const now = new Date()
  const firstName = (userName || "").trim().split(/\s+/)[0]
  const liturgyData = liturgy && liturgy.date === nextDate ? liturgy.data : null

  const renderCard = () => {
    if (mySlots.length === 0) {
      return (
        <div className="flex items-center justify-center gap-2 py-3 text-[#6B5D50]">
          <CalendarDays className="h-4 w-4" />
          <span className="text-sm font-medium italic">Você não tem leituras futuras.</span>
        </div>
      )
    }
    if (!next) {
      return (
        <div className="flex items-center justify-center gap-2 py-3 text-[#1E6B43]">
          <CheckCircle className="h-5 w-5" />
          <span className="text-sm font-bold">Suas leituras deste mês foram concluídas!</span>
        </div>
      )
    }

    const date = parseISO(next.massDate)
    const validDate = isValid(date)
    const days = validDate ? differenceInCalendarDays(date, startOfDay(now)) : 0
    const monthShort = validDate ? format(date, "MMM", { locale: ptBR }).replace(".", "").toUpperCase() : "--"
    const weekdayShort = validDate
      ? format(date, "EEEE", { locale: ptBR }).normalize("NFD").replace(/[̀-ͯ]/g, "").slice(0, 3).toUpperCase()
      : "--"
    const reference = referenceFor(next.role, liturgyData)
    const time = next.massTime.substring(0, 5)

    return (
      <>
        <button
          type="button"
          onClick={() => onNavigateToSlot(next.id, next.massDate)}
          className="flex w-full items-center gap-4 text-left"
          aria-label="Ver esta leitura na escala"
        >
          <span className="flex h-[88px] w-[72px] shrink-0 flex-col items-center justify-center rounded-2xl bg-[#E8B21E] leading-none text-[#322113]">
            <span className="text-[11px] font-extrabold tracking-wider">{monthShort}</span>
            <span className="my-1 text-[32px] font-black">{validDate ? format(date, "d") : "--"}</span>
            <span className="text-[11px] font-extrabold tracking-wider">{weekdayShort}</span>
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#8A5A00]">
              Sua próxima leitura · {whenLabel(days)}
            </span>
            <span className="text-[22px] font-black leading-tight tracking-tight text-[#241A10]">
              {roleLabel(next.role)} · {time}
            </span>
            {next.specialDescription && (
              <span className="truncate text-sm text-[#6B5D50]">{next.specialDescription}</span>
            )}
          </span>
          <ExternalLink className="h-[18px] w-[18px] shrink-0 self-start text-[#8A7A66]" aria-hidden="true" />
        </button>

        {/* Situação da presença */}
        {next.isSwapRequested ? (
          <div className="mt-4 flex items-center gap-2 rounded-xl bg-[#FDEBDD] px-3 py-2.5 text-sm font-bold text-[#A23F06]">
            <RefreshCw className="h-[18px] w-[18px] shrink-0" />
            Troca solicitada · aguardando alguém assumir
          </div>
        ) : next.isConfirmed ? (
          <div className="mt-4 flex items-center gap-2 rounded-xl bg-[#E6F2EA] px-3 py-2.5 text-sm font-bold text-[#1E6B43]">
            <Check className="h-[18px] w-[18px] shrink-0" strokeWidth={3} />
            Presença confirmada
          </div>
        ) : (
          <>
            <div className="mt-4 flex items-center gap-2 rounded-xl bg-[#FFF3D1] px-3 py-2.5 text-sm font-bold text-[#7A4F00]">
              <Clock className="h-[18px] w-[18px] shrink-0" />
              A equipe aguarda sua confirmação
            </div>
            <button
              type="button"
              onClick={() => onConfirm(next.id)}
              className="mt-3 flex h-[54px] w-full items-center justify-center gap-2 rounded-2xl bg-[#322113] text-base font-extrabold text-white shadow-sm transition-all active:scale-[0.98]"
            >
              <Check className="h-5 w-5 text-[#E8B21E]" strokeWidth={3} />
              Confirmar presença
            </button>
          </>
        )}

        {/* Ler e ensaiar / Pedir troca */}
        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => setIsLiturgyOpen(true)}
            className="flex min-h-[56px] items-center gap-2.5 rounded-2xl border border-[#E9DFCB] bg-[#FAF5E6] px-3 py-2 text-left transition-colors active:bg-[#F4EEDD]"
          >
            <BookOpen className="h-5 w-5 shrink-0 text-[#322113]" />
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="text-[15px] font-extrabold text-[#241A10]">Ler e ensaiar</span>
              <span className="truncate font-serif text-xs italic text-[#6B5D50]">{reference || "Liturgia do dia"}</span>
            </span>
          </button>

          {next.isSwapRequested ? (
            <button
              type="button"
              onClick={() => onCancelSwap(next.id)}
              className="flex min-h-[56px] items-center justify-center gap-2 rounded-2xl border border-red-200 bg-white px-3 py-2 text-[15px] font-extrabold text-red-700 transition-colors active:bg-red-50"
            >
              Cancelar troca
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onRequestSwap(next.id)}
              className="flex min-h-[56px] items-center justify-center gap-2 rounded-2xl border border-[#E9DFCB] bg-[#FAF5E6] px-3 py-2 text-[15px] font-extrabold text-[#241A10] transition-colors active:bg-[#F4EEDD]"
            >
              <RefreshCw className="h-[18px] w-[18px]" />
              Pedir troca
            </button>
          )}
        </div>

        {/* Outras leituras do mês */}
        {otherReadings.length > 0 && (
          <div className="mt-3 border-t border-[#F1EADC] pt-1">
            <button
              type="button"
              onClick={() => setIsListOpen(!isListOpen)}
              aria-expanded={isListOpen}
              className="flex min-h-11 w-full items-center justify-between text-sm font-bold text-[#6B5D50]"
            >
              <span>
                {otherReadings.length === 1 ? "Mais 1 leitura neste mês" : `Mais ${otherReadings.length} leituras neste mês`}
              </span>
              <ChevronDown className={cn("h-[18px] w-[18px] transition-transform duration-300", isListOpen && "rotate-180")} />
            </button>
            {isListOpen && (
              <ul className="animate-in slide-in-from-top-2 duration-300">
                {otherReadings.map(slot => {
                  const d = parseISO(slot.massDate)
                  return (
                    <li key={slot.id}>
                      <button
                        type="button"
                        onClick={() => onNavigateToSlot(slot.id, slot.massDate)}
                        className="flex min-h-11 w-full items-center justify-between gap-3 text-left text-[13px] font-bold text-[#322113]"
                      >
                        <span className="truncate">
                          <span className="capitalize">{isValid(d) ? format(d, "EEE dd/MM", { locale: ptBR }) : "--/--"}</span>
                          {" "}às {slot.massTime.substring(0, 5)} · {roleLabel(slot.role)}
                          {slot.isSwapRequested && <span className="text-[#A23F06]"> · troca aberta</span>}
                        </span>
                        <ExternalLink className="h-4 w-4 shrink-0 text-[#8A7A66]" aria-hidden="true" />
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )}

        <LiturgySheet
          dateKey={next.massDate}
          dateLabel={validDate ? format(date, "EEEE, dd/MM", { locale: ptBR }) : ""}
          open={isLiturgyOpen}
          onOpenChange={setIsLiturgyOpen}
          preloaded={liturgyData}
        />
      </>
    )
  }

  return (
    <div className="w-full">
      {/* Faixa marrom com saudação; o cartão invade a faixa */}
      <div className="rounded-b-[28px] bg-[#322113] px-4 pb-16 pt-5 text-white">
        <p className="text-[15px] capitalize text-[#E8D9BC]">{format(now, "EEEE, d 'de' MMMM", { locale: ptBR })}</p>
        <h2 className="mt-1 text-[32px] font-black leading-tight tracking-tight">
          {greeting(now.getHours())}{firstName ? `, ${firstName}` : ""}
        </h2>
      </div>
      <div className="-mt-11 px-4">
        <div className="rounded-[24px] border border-[#EFE6D2] bg-white p-4 shadow-[0_10px_30px_rgba(50,33,19,0.14)]">
          {renderCard()}
        </div>
      </div>
    </div>
  )
}
