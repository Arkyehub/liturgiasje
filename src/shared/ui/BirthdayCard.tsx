"use client"

import { useState } from "react"
import { Card } from "@/shared/ui/card"
import { UserAvatar } from "@/shared/ui/UserAvatar"
import { cn } from "@/shared/lib/utils"
import { Cake, ChevronDown, ChevronUp, PartyPopper } from "lucide-react"
import { format, isToday, parseISO } from "date-fns"
import { ptBR } from "date-fns/locale"

interface BirthdayMember {
  id: string
  fullName: string
  avatarUrl?: string
  birthDate: string
  isClaimed?: boolean
}

interface BirthdayCardProps {
  members: BirthdayMember[]
  currentMonth: Date
}

export function BirthdayCard({ members, currentMonth }: BirthdayCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  // Filtrar aniversariantes DO DIA (com base no horário local do browser)
  const todayBirthdays = members.filter(m => {
    if (!m.birthDate) return false
    const date = parseISO(m.birthDate)
    const today = new Date()
    return date.getDate() === today.getDate() && date.getMonth() === today.getMonth()
  })

  // Ordenar aniversariantes do mês por dia
  const monthBirthdays = [...members].sort((a, b) => {
    const dayA = parseISO(a.birthDate).getDate()
    const dayB = parseISO(b.birthDate).getDate()
    return dayA - dayB
  })

  if (members.length === 0) return null

  return (
    <Card className="overflow-hidden border-stone-200 bg-white shadow-sm transition-all">
      {/* CAPA DO CARD */}
      <div 
        onClick={() => setIsExpanded(!isExpanded)}
        className="cursor-pointer px-3 py-2 hover:bg-stone-50 transition-colors"
      >
        <div className="flex items-center justify-between">
          <div className="flex flex-col w-full">
            {todayBirthdays.length > 0 ? (
              // Modo Parabéns (Se houver alguém fazendo hoje)
              <div className="space-y-1">
                {todayBirthdays.map((m) => (
                  <div key={m.id} className="flex items-center gap-3">
                    <div className="relative">
                      <UserAvatar 
                        name={m.fullName}
                        src={m.avatarUrl}
                        isClaimed={m.isClaimed}
                        className="h-9 w-9 border-2 border-amber-200"
                      />
                      {/* Chapéu de Aniversário */}
                      <img 
                        src="/hat-birthday-svgrepo-com.svg" 
                        alt="Chapéu" 
                        className="absolute -top-3.5 -left-1 w-6 h-6 -rotate-12 drop-shadow-sm pointer-events-none"
                      />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[11px] font-black uppercase tracking-tight text-amber-600 flex items-center gap-1">
                         É hoje! Parabéns! <PartyPopper className="h-3 w-3" />
                      </span>
                      <span className="text-sm font-bold text-stone-800 leading-tight">{m.fullName}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              // Modo Padrão
              <div className="flex items-center gap-3">
                <div className="bg-amber-50 p-1.5 rounded-xl text-amber-600">
                  <Cake className="h-4 w-4" />
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-bold text-stone-800">
                    Aniversariantes do Mês de <span className="capitalize">{format(currentMonth, "MMMM", { locale: ptBR })}</span>
                  </span>
                </div>
              </div>
            )}
          </div>
          
          <div className="text-stone-300">
            {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
          </div>
        </div>
      </div>

      {/* LISTA EXPANDIDA */}
      {isExpanded && (
        <div className="border-t border-stone-100 bg-stone-50/30 p-4 space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
          <p className="text-[10px] font-black uppercase tracking-widest text-stone-400 mb-2">
            Lista de {format(currentMonth, "MMMM", { locale: ptBR })}
          </p>
          <div className="grid gap-3">
            {monthBirthdays.map((m) => {
              const birthDate = parseISO(m.birthDate)
              const today = new Date()
              const isTodayBirthday = birthDate.getDate() === today.getDate() && birthDate.getMonth() === today.getMonth()
              
              return (
                <div key={m.id} className="flex items-center justify-between bg-white p-3 rounded-2xl border border-stone-100 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <UserAvatar 
                        name={m.fullName}
                        src={m.avatarUrl}
                        isClaimed={m.isClaimed}
                        className="h-10 w-10"
                      />
                      {isTodayBirthday && (
                        <img 
                          src="/hat-birthday-svgrepo-com.svg" 
                          alt="Chapéu" 
                          className="absolute -top-4 -left-1 w-7 h-7 -rotate-12 pointer-events-none"
                        />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-stone-800">{m.fullName}</p>
                      <p className="text-[10px] text-stone-500 font-medium capitalize">
                        Dia {format(birthDate, "dd 'de' MMMM", { locale: ptBR })}
                      </p>
                    </div>
                  </div>
                  {isTodayBirthday && (
                    <div className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-tighter border border-amber-200">
                      HOJE! 🎂
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </Card>
  )
}
