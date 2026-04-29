"use client"

import { useState, useEffect } from "react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select"

interface BirthDatePickerProps {
  value: string // Formato YYYY-MM-DD
  onChange: (value: string) => void
}

export function BirthDatePicker({ value, onChange }: BirthDatePickerProps) {
  const [day, setDay] = useState("")
  const [month, setMonth] = useState("")
  const [year, setYear] = useState("")

  // Inicializar estados a partir do valor (YYYY-MM-DD)
  useEffect(() => {
    if (value) {
      const [vYear, vMonth, vDay] = value.split("-")
      setYear(vYear)
      setMonth(vMonth)
      setDay(vDay)
    }
  }, [value])

  const days = Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, "0"))
  const months = [
    { value: "01", label: "Janeiro" },
    { value: "02", label: "Fevereiro" },
    { value: "03", label: "Março" },
    { value: "04", label: "Abril" },
    { value: "05", label: "Maio" },
    { value: "06", label: "Junho" },
    { value: "07", label: "Julho" },
    { value: "08", label: "Agosto" },
    { value: "09", label: "Setembro" },
    { value: "10", label: "Outubro" },
    { value: "11", label: "Novembro" },
    { value: "12", label: "Dezembro" },
  ]
  const currentYear = new Date().getFullYear()
  const years = Array.from({ length: 100 }, (_, i) => String(currentYear - i))

  const handleUpdate = (newDay: string, newMonth: string, newYear: string) => {
    if (newDay && newMonth && newYear) {
      onChange(`${newYear}-${newMonth}-${newDay}`)
    }
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      {/* Dia */}
      <Select 
        value={day} 
        onValueChange={(v) => { 
          const val = v || "";
          setDay(val); 
          handleUpdate(val, month, year); 
        }}
      >
        <SelectTrigger className="rounded-2xl border-stone-100 h-12 text-stone-800 font-bold focus:ring-stone-200">
          <SelectValue placeholder="Dia" />
        </SelectTrigger>
        <SelectContent className="max-h-[300px] w-[var(--radix-select-trigger-width)] min-w-0">
          {days.map((d) => (
            <SelectItem key={d} value={d} className="font-bold">{d}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Mês */}
      <Select 
        value={month} 
        onValueChange={(v) => { 
          const val = v || "";
          setMonth(val); 
          handleUpdate(day, val, year); 
        }}
      >
        <SelectTrigger className="rounded-2xl border-stone-100 h-12 text-stone-800 font-bold focus:ring-stone-200">
          <SelectValue placeholder="Mês" />
        </SelectTrigger>
        <SelectContent className="max-h-[300px] w-[var(--radix-select-trigger-width)] min-w-0">
          {months.map((m) => (
            <SelectItem key={m.value} value={m.value} className="font-bold">{m.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Ano */}
      <Select 
        value={year} 
        onValueChange={(v) => { 
          const val = v || "";
          setYear(val); 
          handleUpdate(day, month, val); 
        }}
      >
        <SelectTrigger className="rounded-2xl border-stone-100 h-12 text-stone-800 font-bold focus:ring-stone-200">
          <SelectValue placeholder="Ano" />
        </SelectTrigger>
        <SelectContent className="max-h-[300px] w-[var(--radix-select-trigger-width)] min-w-0">
          {years.map((y) => (
            <SelectItem key={y} value={y} className="font-bold">{y}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
