"use client"

import { useState, useEffect } from "react"
import { Calendar } from "@/shared/ui/calendar"
import { ptBR } from "date-fns/locale"
import { format } from "date-fns"
import { makeListUnavailableByUser, makeToggleUnavailableDate } from "@/main/factories/usecases/schedule"
import { toast } from "sonner"
import { Loader2, CalendarX, AlertCircle } from "lucide-react"

interface UnavailableFormProps {
  userId: string
  onClose: () => void
}

export function UnavailableForm({ userId, onClose }: UnavailableFormProps) {
  const [unavailableDates, setUnavailableDates] = useState<Date[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    loadUnavailableDates()
  }, [userId])

  const loadUnavailableDates = async () => {
    try {
      setIsLoading(true)
      const datesStr = await makeListUnavailableByUser().execute(userId)
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

    const dateStr = format(date, "yyyy-MM-dd")
    try {
      const result = await makeToggleUnavailableDate().execute(userId, dateStr)
      if (result.action === 'added') {
        setUnavailableDates(prev => [...prev, date])
      } else {
        setUnavailableDates(prev => prev.filter(d => format(d, "yyyy-MM-dd") !== dateStr))
      }
    } catch (error) {
      toast.error("Erro ao atualizar data.")
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
