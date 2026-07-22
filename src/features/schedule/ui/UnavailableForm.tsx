"use client"

import { useState, useEffect } from "react"
import { Calendar } from "@/shared/ui/calendar"
import { ptBR } from "date-fns/locale"
import { format } from "date-fns"
import { makeListUnavailableByProfile, makeToggleUnavailableDate } from "@/main/factories/usecases/profiles"
import { toast } from "sonner"
import { Loader2, CalendarX, AlertCircle } from "lucide-react"

interface UnavailableFormProps {
  profileId: string
  onClose: () => void
}

export function UnavailableForm({ profileId, onClose }: UnavailableFormProps) {
  const [unavailableDates, setUnavailableDates] = useState<Date[]>([])
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date())
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    loadUnavailableDates()
  }, [profileId])

  const loadUnavailableDates = async () => {
    try {
      setIsLoading(true)
      const datesStr = await makeListUnavailableByProfile().execute(profileId)
      // Ajuste de timezone: Adicionar T00:00:00 para evitar que vire o dia anterior
      const dates = datesStr.map(d => new Date(d + 'T00:00:00'))
      setUnavailableDates(dates)
    } catch (error) {
      toast.error("Erro ao carregar datas indisponíveis.")
    } finally {
      setIsLoading(false)
    }
  }

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
    } catch (error) {
      // Em caso de falha na API, reverter o estado
      setUnavailableDates(prev =>
        isCurrentlySelected
          ? [...prev, date]
          : prev.filter(d => format(d, "yyyy-MM-dd") !== dateStr)
      )
      toast.error("Erro ao atualizar data no servidor.")
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-60 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-stone-200" />
      </div>
    )
  }

  return (
    <div className="space-y-6 py-2">
      <div className="flex flex-col gap-1.5 px-1">
        <p className="text-xs text-stone-500 font-medium">
          Clique nos dias do calendário para marcar sua indisponibilidade.
        </p>
      </div>

      <div className="bg-white rounded-3xl border border-stone-100 shadow-xl shadow-stone-200/40 p-2 flex justify-center overflow-hidden">
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
            unavailable: "bg-red-500 text-white hover:bg-red-600 rounded-lg shadow-sm font-bold after:content-[''] after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:w-1 after:h-1 after:bg-white/50 after:rounded-full"
          }}
          className="rounded-2xl border-none shadow-none"
        />
      </div>

    </div>
  )
}
