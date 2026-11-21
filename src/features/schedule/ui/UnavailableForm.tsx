"use client"

import { useState, useEffect } from "react"
import { Calendar } from "@/shared/ui/calendar"
import { ptBR } from "date-fns/locale"
import { format } from "date-fns"
import { makeListUnavailableByProfile, makeToggleUnavailableDate } from "@/main/factories/usecases/profiles"
import { toast } from "sonner"
import { Loader2, CalendarX } from "lucide-react"

interface UnavailableFormProps {
  profileId: string
  onClose: () => void
}

export function UnavailableForm({ profileId }: UnavailableFormProps) {
  const [unavailableDates, setUnavailableDates] = useState<Date[]>([])
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date())
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setIsLoading(true)
        const datesStr = await makeListUnavailableByProfile().execute(profileId)
        // Ajuste de timezone: Adicionar T00:00:00 para evitar que vire o dia anterior
        const dates = datesStr.map(d => new Date(d + 'T00:00:00'))
        if (!cancelled) setUnavailableDates(dates)
      } catch {
        if (!cancelled) toast.error("Erro ao carregar datas indisponíveis.")
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [profileId])

  const handleSelect = async (date: Date | undefined) => {
    if (!date) return

    // Evitar cliques em datas que não são do mês atual
    if (date.getMonth() !== currentMonth.getMonth() || date.getFullYear() !== currentMonth.getFullYear()) {
      return
    }

    const dateStr = format(date, "yyyy-MM-dd")
    const isCurrentlySelected = unavailableDates.some(d => format(d, "yyyy-MM-dd") === dateStr)

    // Atualização otimista imediata para resposta instantânea ao toque do usuário
    setUnavailableDates(prev =>
      isCurrentlySelected
        ? prev.filter(d => format(d, "yyyy-MM-dd") !== dateStr)
        : [...prev, date]
    )

    try {
      await makeToggleUnavailableDate().execute(profileId, dateStr)
    } catch {
      // Em caso de falha na API, reverter o estado
      setUnavailableDates(prev =>
        isCurrentlySelected
          ? [...prev, date]
          : prev.filter(d => format(d, "yyyy-MM-dd") !== dateStr)
      )
      toast.error("Erro ao atualizar data no servidor.")
    }
  }

  const monthCount = unavailableDates.filter(
    d => d.getMonth() === currentMonth.getMonth() && d.getFullYear() === currentMonth.getFullYear()
  ).length

  if (isLoading) {
    return (
      <div className="flex h-60 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-stone-200" />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-center overflow-hidden rounded-2xl border border-[#E9DFCB] bg-[#FAF5E6] p-1">
        <Calendar
          mode="single"
          selected={undefined}
          onSelect={handleSelect}
          locale={ptBR}
          month={currentMonth}
          onMonthChange={setCurrentMonth}
          showOutsideDays={false}
          disabled={(date) => date.getMonth() !== currentMonth.getMonth() || date.getFullYear() !== currentMonth.getFullYear()}
          modifiers={{
            unavailable: unavailableDates
          }}
          modifiersClassNames={{
            unavailable: "bg-[#A23F06] text-white hover:bg-[#8A3505] rounded-lg font-bold"
          }}
          className="rounded-2xl border-none bg-transparent shadow-none"
        />
      </div>
      <p className="flex items-center justify-center gap-1.5 text-xs font-semibold text-[#6B5D50]">
        <CalendarX className="h-3.5 w-3.5" />
        {monthCount === 0
          ? "Nenhum dia marcado neste mês"
          : monthCount === 1
            ? "1 dia marcado neste mês"
            : `${monthCount} dias marcados neste mês`}
      </p>
    </div>
  )
}
