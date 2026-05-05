"use client"

import { useState, useEffect } from "react"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { Label } from "@/shared/ui/label"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/shared/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/shared/ui/popover"
import { makeListMembers } from "@/main/factories/usecases/members"
import { 
  makeCheckMassExists, 
  makeGetMembersUsage, 
  makeDeleteMass, 
  makeUpdateMass, 
  makeCreateMassWithSlots,
  makeListOccupiedDatesForMonth,
  makeListSchedulesForMonth
} from "@/main/factories/usecases/schedule"
import { makeListUnavailableByDate } from "@/main/factories/usecases/user"
import { Member } from "@/domain/models/Member"
import { Plus, Search, Trash2, Type, CheckCircle2, User, AlertCircle, Eye } from "lucide-react"
import { format, isValid } from "date-fns"
import { ptBR } from "date-fns/locale"
import { toast } from "sonner"
import { cn } from "@/shared/lib/utils"
import { TimeRoller } from "@/shared/ui/TimeRoller"

interface ScheduleFormProps {
  currentMonth: Date
  onSuccess: () => void
  onClose: () => void
  initialData?: any
}

interface Slot {
  id: string
  roleType: "C" | "L" | "P"
  roleLabel: string
  memberId: string
  memberName: string
  isOpen: boolean
}

interface Session {
  dbId?: string
  tempId: string
  time: string
  description: string
  slots: Slot[]
}

export function ScheduleForm({ currentMonth, onSuccess, onClose, initialData }: ScheduleFormProps) {
  const [date, setDate] = useState("")
  const [sessions, setSessions] = useState<Session[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [usageCounts, setUsageCounts] = useState<Record<string, number>>({})
  const [activeMonthRef, setActiveMonthRef] = useState(format(currentMonth, "yyyy-MM"))
  const [isSaving, setIsSaving] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [unavailableUserIds, setUnavailableUserIds] = useState<string[]>([])
  const [hasExistingScale, setHasExistingScale] = useState(false)
  const [existingMassesFromDb, setExistingMassesFromDb] = useState<any[]>([])
  const [occupiedDates, setOccupiedDates] = useState<string[]>([])
  const [allMonthMasses, setAllMonthMasses] = useState<any[]>([])

  const createEmptySession = (): Session => ({
    tempId: Math.random().toString(36).substring(2, 9),
    time: "07:00",
    description: "",
    slots: []
  })

  const loadAllMonthMasses = async (mRef: string) => {
    try {
      const d = new Date(`${mRef}-01T00:00:00`)
      const masses = await makeListSchedulesForMonth().execute(d, true)
      setAllMonthMasses(masses)
    } catch (error) {
      console.error("Erro ao carregar missas do mês para tooltip:", error)
    }
  }

  useEffect(() => {
    loadMembers()
    loadUsage(activeMonthRef)
    loadAllMonthMasses(activeMonthRef)
    // Carrega os dias já com escala cadastrada para o mês atual
    makeListOccupiedDatesForMonth().execute(format(currentMonth, "yyyy-MM"))
      .then(setOccupiedDates)
      .catch(console.error)
  }, [])

  useEffect(() => {
    if (date) {
      loadUnavailableForDate(date)
      // Recarregar contadores se o mês da data selecionada for diferente do atual
      try {
        const newMonthRef = format(new Date(date + 'T00:00:00'), "yyyy-MM")
        if (newMonthRef !== activeMonthRef) {
          setActiveMonthRef(newMonthRef)
          loadUsage(newMonthRef)
          loadAllMonthMasses(newMonthRef)
        }
      } catch (e) {
        console.error("Erro ao processar data para contadores:", e)
      }
    }
  }, [date])

  const loadUnavailableForDate = async (d: string) => {
    try {
      const [ids, existingMasses] = await Promise.all([
        makeListUnavailableByDate().execute(d),
        makeCheckMassExists().execute(d)
      ])
      setUnavailableUserIds(ids)
      setExistingMassesFromDb(existingMasses)
      
      // Se não houver data inicial (nova escala) e já existirem missas, avisar
      if (!initialData && existingMasses.length > 0) {
        setHasExistingScale(true)
      } else {
        setHasExistingScale(false)
      }
    } catch (error) {
      console.error("Erro ao carregar indisponibilidades/duplicidade:", error)
    }
  }

  useEffect(() => {
    if (initialData && Array.isArray(initialData)) {
      setDate(initialData[0].date)
      
      const mappedSessions = initialData.map((item: any) => {
        const mappedSlots = item.slots.map((s: any) => {
          let roleType: "C" | "L" | "P" = "L"
          if (s.role.includes('C')) roleType = "C"
          else if (s.role.includes('P')) roleType = "P"

          return {
            id: s.id,
            roleType,
            roleLabel: s.role,
            memberId: s.memberId,
            memberName: s.readerName || s.memberName || s.reader?.fullName,
            isOpen: false
          }
        })

        return {
          dbId: item.id,
          tempId: Math.random().toString(36).substring(2, 9),
          time: item.time?.substring(0, 5) || "",
          description: item.specialDescription || item.specialTitle || "",
          slots: mappedSlots
        }
      })
      setSessions(mappedSessions)
    } else {
      setSessions([])
    }
  }, [initialData])

  const loadMembers = async () => {
    try {
      const membersList = await makeListMembers().execute()
      setMembers(membersList)
    } catch (error) {
      console.error("Erro ao carregar leitores:", error)
    }
  }

  const loadUsage = async (mRef: string) => {
    try {
      const counts = await makeGetMembersUsage().execute(mRef)
      setUsageCounts(counts)
    } catch (error) {
      console.error("Erro ao carregar uso de membros:", error)
    }
  }

  const getMemberSchedules = (memberId: string) => {
    const schedules: { date: string; time: string; role: string }[] = []

    allMonthMasses.forEach(mass => {
      mass.slots?.forEach((s: any) => {
        if (s.memberId === memberId) {
          schedules.push({
            date: mass.date,
            time: mass.time.substring(0, 5),
            role: s.role?.match(/[CLP]/)?.[0] || 'L'
          })
        }
      })
    })

    sessions.forEach(sess => {
      sess.slots.forEach(s => {
        if (s.memberId === memberId && sess.time && date) {
          schedules.push({
            date: date,
            time: sess.time,
            role: s.roleType
          })
        }
      })
    })

    const unique = schedules.filter((v, i, a) => 
      a.findIndex(t => (t.date === v.date && t.time === v.time && t.role === v.role)) === i
    )

    return unique.sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date)
      return a.time.localeCompare(b.time)
    })
  }

  const updateRoleLabels = (currentSlots: Slot[]) => {
    const counts = { C: 0, L: 0, P: 0 }
    currentSlots.forEach(s => counts[s.roleType]++)

    return currentSlots.map(s => {
      const sameTypeSlots = currentSlots.filter(prev => prev.roleType === s.roleType)
      if (counts[s.roleType] <= 1) {
        return { ...s, roleLabel: s.roleType }
      }
      const index = sameTypeSlots.findIndex(prev => prev.id === s.id) + 1
      return { ...s, roleLabel: `${index}${s.roleType}` }
    })
  }

  const checkPreference = (member: Member, massTime: string, massDate: string) => {
    if (!member.claimedUser?.preferences?.day_preferences) return false
    
    // Obter dia da semana (0-6, 0 é domingo)
    try {
      const dateObj = new Date(massDate + 'T00:00:00')
      const dayOfWeek = dateObj.getDay()
      
      // O app usa "6" para Domingo nas preferências do perfil
      const dayKey = dayOfWeek === 0 ? "6" : dayOfWeek.toString()
      
      const prefs = member.claimedUser.preferences.day_preferences[dayKey]
      return Array.isArray(prefs) && (prefs.includes(massTime) || prefs.includes(massTime.substring(0, 5)))
    } catch {
      return false
    }
  }

  const addSession = () => {
    setSessions([...sessions, createEmptySession()])
  }

  const removeSession = async (tempId: string, dbId?: string) => {
    if (dbId) {
      try {
        await makeDeleteMass().execute(dbId)
        toast.success("Horário excluído.")
      } catch (error) {
        console.error("Erro ao excluir:", error)
        toast.error("Erro ao excluir horário.")
        return
      }
    }
    setSessions(prev => prev.filter(s => s.tempId !== tempId))
  }

  const updateSessionField = (tempId: string, field: keyof Session, value: any) => {
    setSessions(sessions.map(s => s.tempId === tempId ? { ...s, [field]: value } : s))
  }

  const addSlot = (sessionTempId: string, roleType: "C" | "L" | "P") => {
    const newSlot: Slot = {
      id: Math.random().toString(36).substr(2, 9),
      roleType,
      roleLabel: "",
      memberId: "",
      memberName: "",
      isOpen: false
    }
    setSessions(sessions.map(sess => {
      if (sess.tempId === sessionTempId) {
        const updatedSlots = [...sess.slots, newSlot]
        return { ...sess, slots: updateRoleLabels(updatedSlots) }
      }
      return sess
    }))
  }

  const removeSlot = (sessionTempId: string, slotId: string) => {
    setSessions(sessions.map(sess => {
      if (sess.tempId === sessionTempId) {
        const updatedSlots = sess.slots.filter(s => s.id !== slotId)
        return { ...sess, slots: updateRoleLabels(updatedSlots) }
      }
      return sess
    }))
  }

  const updateSlotMember = (sessionTempId: string, slotId: string, member: Member) => {
    setSessions(sessions.map(sess => {
      if (sess.tempId === sessionTempId) {
        const updatedSlots = sess.slots.map(s => 
          s.id === slotId ? { ...s, memberId: member.id, memberName: member.fullName, isOpen: false } : s
        )
        return { ...sess, slots: updatedSlots }
      }
      return sess
    }))
  }

  const setSlotPopoverOpen = (sessionTempId: string, slotId: string, isOpen: boolean) => {
    setSessions(sessions.map(sess => {
      if (sess.tempId === sessionTempId) {
        const updatedSlots = sess.slots.map(s => 
          s.id === slotId ? { ...s, isOpen } : s
        )
        return { ...sess, slots: updatedSlots }
      }
      return sess
    }))
  }

  const handleSaveMass = async () => {
    if (!date) {
      toast.error("Preencha a data")
      return
    }

    // Validações de campos
    for (const sess of sessions) {
      if (!sess.time) {
        toast.error("Preencha o horário de todas as missas")
        return
      }
      
      // Se houver slots adicionados, eles precisam ter um leitor selecionado
      const unassigned = sess.slots.find(s => !s.memberId)
      if (unassigned) {
        toast.error(`Escolha um leitor para ${unassigned.roleLabel} na missa das ${sess.time}`)
        return
      }
    }

    // Validação de duplicidade no formulário
    const timesInForm = sessions.map(s => s.time)
    const hasDuplicateInForm = timesInForm.some((t, i) => timesInForm.indexOf(t) !== i)
    if (hasDuplicateInForm) {
      toast.error("Existem missas com o mesmo horário neste formulário.")
      return
    }

    // Validação de duplicidade contra o banco de dados
    for (const sess of sessions) {
      const conflict = existingMassesFromDb.find(m => 
        m.time.substring(0, 5) === sess.time && m.id !== sess.dbId
      )
      
      if (conflict) {
        toast.error(`Já existe uma missa cadastrada para o horário ${sess.time} neste dia.`)
        return
      }
    }

    setIsSaving(true)
    try {
      // Salva cada sessão sequencialmente
      for (const sess of sessions) {
        const actualMonthRef = format(new Date(date + 'T00:00:00'), "yyyy-MM")
        
        const massData = {
          date,
          time: `${sess.time}:00`,
          specialDescription: sess.description,
          monthReference: actualMonthRef
        }
        
        const slotsData = sess.slots.map(s => ({
          role: s.roleLabel,
          memberId: s.memberId
        }))

        if (sess.dbId) {
          await makeUpdateMass().execute(sess.dbId, massData, slotsData)
        } else {
          await makeCreateMassWithSlots().execute(massData, slotsData)
        }
      }

      toast.success("Escala salva com sucesso!")
      onSuccess()
      onClose()
    } catch (error) {
      toast.error("Erro ao salvar escala. Tente novamente.")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="flex flex-col h-full relative overflow-hidden bg-stone-50/50">
      {/* Área de Conteúdo com Scroll */}
      <div className="flex-1 overflow-y-auto space-y-4 px-6 pt-1 pb-8">
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
          
          {/* Seletor de Dia */}
          <div className="space-y-1">
            <Label className="text-[10px] uppercase font-bold text-stone-400 ml-1">Dia da Escala</Label>

            {/* Grade de Dias */}
            {(() => {
              const year = currentMonth.getFullYear()
              const month = currentMonth.getMonth()
              const daysInMonth = new Date(year, month + 1, 0).getDate()
              const firstDayOfWeek = new Date(year, month, 1).getDay() // 0 = Domingo
              const days = Array.from({ length: daysInMonth }, (_, i) => i + 1)
              const weekDays = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']

              return (
                <div className="grid gap-1" style={{ gridTemplateColumns: 'repeat(7, 1fr)' }}>
                  {/* Cabeçalho dos dias da semana */}
                  {weekDays.map((day, i) => (
                    <div key={`header-${i}`} className="text-center text-[10px] font-bold text-stone-400 mb-1">
                      {day}
                    </div>
                  ))}
                  
                  {/* Espaços em branco antes do primeiro dia */}
                  {Array.from({ length: firstDayOfWeek }).map((_, i) => (
                    <div key={`empty-${i}`} className="h-9 w-full" />
                  ))}

                  {/* Dias do mês */}
                  {days.map(day => {
                    const dayStr = String(day).padStart(2, '0')
                    const monthStr = String(month + 1).padStart(2, '0')
                    const fullDate = `${year}-${monthStr}-${dayStr}`
                    const isSelected = date === fullDate
                    const isOccupied = occupiedDates.includes(fullDate) && !isSelected

                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => {
                          setDate(fullDate)
                          if (sessions.length === 0) setSessions([createEmptySession()])
                        }}
                        className={cn(
                          "h-9 w-full rounded-xl text-[12px] font-bold transition-all active:scale-95 border flex flex-col items-center justify-center",
                          isSelected
                            ? "bg-stone-800 text-white border-stone-800 shadow-md"
                            : isOccupied
                              ? "bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100"
                              : "bg-white text-stone-700 border-stone-200 hover:bg-stone-50 hover:border-stone-400"
                        )}
                        title={isOccupied ? "Já há escala neste dia" : undefined}
                      >
                        <span>{day}</span>
                        {isOccupied && (
                          <span className="text-[6px] font-black leading-none text-amber-500 mt-0.5">●</span>
                        )}
                      </button>
                    )
                  })}
                </div>
              )
            })()}

            {/* Data selecionada por extenso */}
            {date && (
              <p className="text-xs font-semibold text-stone-600 ml-1 mt-1.5 capitalize">
                📅 {isValid(new Date(date + 'T00:00:00')) 
                  ? format(new Date(date + 'T00:00:00'), "EEEE, dd 'de' MMMM", { locale: ptBR })
                  : "Data inválida"}
              </p>
            )}
          </div>

          <div className="h-px bg-stone-100 mt-1" />

          {/* Aviso de Escala Existente */}
          {hasExistingScale && (
            <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 flex items-start gap-3 animate-in fade-in zoom-in duration-300">
              <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-xs font-bold text-amber-900 leading-tight">
                  Já existe uma escala para este dia!
                </p>
                <p className="text-[10px] text-amber-700 leading-snug">
                  Se você deseja adicionar mais horários a este dia, cancele este formulário e edite o card que já aparece no mural.
                </p>
              </div>
            </div>
          )}

          {/* Lista de Sessões e Botão de Adicionar outro Horário (Condicional à Data) */}
          {date && (
            <div className="space-y-4 animate-in fade-in slide-in-from-top-4 duration-500">
              {sessions.map((sess, sessIndex) => (
                <div key={sess.tempId} className="space-y-3 p-4 rounded-2xl border border-stone-200 bg-white relative shadow-sm">
                  
                  {/* Botão excluir — absoluto no canto superior direito */}
                  {sessions.length > 1 && (
                    <button 
                      type="button"
                      className="absolute top-2 right-2 h-7 w-7 flex items-center justify-center text-red-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors focus:outline-none"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        removeSession(sess.tempId, sess.dbId)
                      }}
                      title="Excluir Horário"
                    >
                      <Trash2 className="h-3.5 w-3.5 pointer-events-none" />
                    </button>
                  )}

                  {/* Cabeçalho da Sessão + Seletor de Horário */}
                  <div className="flex items-center justify-center mb-3">
                    <TimeRoller
                      value={sess.time || "07:00"}
                      prefix="Missa das"
                      onChange={(val) => updateSessionField(sess.tempId, 'time', val)}
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase font-bold text-stone-400 ml-1">Descrição</Label>
                    <div className="relative">
                      <Type className="absolute left-3 top-2.5 h-4 w-4 text-stone-400" />
                      <Input 
                        placeholder="" 
                        value={sess.description}
                        onChange={(e) => updateSessionField(sess.tempId, 'description', e.target.value)}
                        className="pl-10 h-10 rounded-xl bg-stone-50/50 border-stone-600"
                      />
                    </div>
                  </div>

                  {/* Lista de Slots da Sessão */}
                  <div className="space-y-1.5 pt-1">
                    {sess.slots.map((slot) => (
                      <div key={slot.id} className="flex items-center gap-2">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700 font-black text-[10px] border border-amber-200">
                          {slot.roleLabel}
                        </div>
                        
                        <div className="flex-1">
                          <Popover open={slot.isOpen} onOpenChange={(open) => setSlotPopoverOpen(sess.tempId, slot.id, open)}>
                            <PopoverTrigger render={
                              <Button
                                variant="outline"
                                className={cn(
                                  "w-full h-8 justify-between font-bold rounded-lg border-stone-600 bg-white px-2",
                                  !slot.memberId && "text-stone-500 font-bold"
                                )}
                              >
                                <div className="flex items-center truncate">
                                  <User className="mr-2 h-3.5 w-3.5 text-stone-400 shrink-0" />
                                  <span className="truncate text-[13px]">
                                    {slot.memberId ? slot.memberName : "Selecionar..."}
                                  </span>
                                </div>
                                <Search className="ml-2 h-3 w-3 opacity-50 shrink-0" />
                              </Button>
                            } />
                            <PopoverContent className="w-[300px] p-0" align="start">
                              <Command>
                                <CommandInput 
                                  placeholder="Pesquisar leitor..." 
                                  value={searchTerm}
                                  onValueChange={setSearchTerm}
                                  autoFocus
                                />
                                <CommandList>
                                  <CommandEmpty>Nenhum leitor encontrado.</CommandEmpty>
                                  <CommandGroup>
                                    {(() => {
                                      const sortedMembers = [...members].sort((a, b) => {
                                        const prefA = checkPreference(a, sess.time, date) ? 1 : 0
                                        const prefB = checkPreference(b, sess.time, date) ? 1 : 0
                                        if (prefA !== prefB) return prefB - prefA

                                        const unA = a.claimedBy && unavailableUserIds.includes(a.claimedBy) ? 1 : 0
                                        const unB = b.claimedBy && unavailableUserIds.includes(b.claimedBy) ? 1 : 0
                                        if (unA !== unB) return unA - unB

                                        return a.fullName.localeCompare(b.fullName)
                                      })

                                      return sortedMembers.map((member) => {
                                        const isUnavailable = member.claimedBy ? unavailableUserIds.includes(member.claimedBy) : false
                                        const isPreference = checkPreference(member, sess.time, date)
                                        const isAlreadyScheduled = sessions.some(s => 
                                          s.slots.some(sl => sl.memberId === member.id && sl.id !== slot.id)
                                        )
                                        
                                        return (
                                          <CommandItem
                                            key={member.id}
                                            value={member.fullName}
                                            onSelect={() => {
                                              if (isAlreadyScheduled) {
                                                toast.warning(`${member.fullName} já está escalado(a) neste dia!`, {
                                                  duration: 5000,
                                                  icon: <AlertCircle className="h-4 w-4 text-amber-600" />
                                                })
                                              } else if (isUnavailable) {
                                                toast.warning(`${member.fullName} informou que não poderá participar nesta data.`, {
                                                  duration: 5000,
                                                  icon: <AlertCircle className="h-4 w-4 text-amber-600" />
                                                })
                                              }
                                              updateSlotMember(sess.tempId, slot.id, member)
                                              setSearchTerm("")
                                            }}
                                            className="flex items-center justify-between"
                                          >
                                            <span className={cn(
                                              "font-medium transition-colors",
                                              isUnavailable && "text-red-500 font-bold",
                                              isAlreadyScheduled && !isUnavailable && "text-amber-600 font-bold",
                                              isPreference && !isUnavailable && !isAlreadyScheduled && "text-green-600 font-bold"
                                            )}>
                                              {member.fullName}
                                              {isUnavailable && " (Indisponível)"}
                                              {isAlreadyScheduled && !isUnavailable && " (Já escalado)"}
                                              {isPreference && !isUnavailable && !isAlreadyScheduled && " (Preferência)"}
                                            </span>
                                            <div className="flex items-center gap-2">
                                              {usageCounts[member.id] > 0 && (
                                                <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-black rounded-md">
                                                  {usageCounts[member.id]}x
                                                </span>
                                              )}
                                            </div>
                                          </CommandItem>
                                        )
                                      })
                                    })()}
                                  </CommandGroup>
                                </CommandList>
                              </Command>
                            </PopoverContent>
                          </Popover>
                        </div>

                        <div className="flex items-center gap-0.5 shrink-0">
                          {(() => {
                            if (!slot.memberId) return null
                            const schedules = getMemberSchedules(slot.memberId)
                            if (schedules.length === 0) return null

                            return (
                              <Popover>
                                <PopoverTrigger render={
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-8 w-8 text-stone-400 hover:text-stone-600 hover:bg-stone-100 rounded-lg shrink-0"
                                    title="Ver escalas do mês"
                                  >
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                } />
                                <PopoverContent side="top" align="start" className="w-auto p-2 rounded-xl border border-stone-200 shadow-xl bg-white z-50">
                                  <p className="text-[10px] font-bold text-stone-500 uppercase tracking-wider mb-2 px-1">
                                    Escalas neste mês
                                  </p>
                                  <div className="space-y-1">
                                    {schedules.map((sch, i) => {
                                      const isCurrentDay = sch.date === date;
                                      return (
                                        <div 
                                          key={i} 
                                          className={cn(
                                            "text-xs font-medium px-2 py-1.5 rounded-md border whitespace-nowrap",
                                            isCurrentDay 
                                              ? "bg-amber-100 text-amber-800 border-amber-200" 
                                              : "text-stone-700 bg-stone-50 border-stone-100"
                                          )}
                                        >
                                          {format(new Date(sch.date + 'T00:00:00'), 'dd/MM')} - {sch.time} ({sch.role})
                                        </div>
                                      )
                                    })}
                                  </div>
                                </PopoverContent>
                              </Popover>
                            )
                          })()}

                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-stone-600 hover:text-red-500 hover:bg-red-50 rounded-lg"
                            onClick={() => removeSlot(sess.tempId, slot.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Botão de Adicionar Leitura (Dentro da Sessão) */}
                  <DropdownMenu>
                    <DropdownMenuTrigger render={
                      <Button variant="outline" size="sm" className="h-7 px-3 font-black text-[9px] uppercase tracking-wider rounded-lg border-stone-500 text-stone-600 bg-white hover:bg-stone-50">
                        <Plus className="mr-1 h-3 w-3" />
                        Adicionar Leitura
                      </Button>
                    } />
                    <DropdownMenuContent align="start" className="rounded-xl p-1.5">
                      <DropdownMenuItem onClick={() => addSlot(sess.tempId, "C")} className="font-bold text-xs text-stone-700">Comentarista (C)</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => addSlot(sess.tempId, "L")} className="font-bold text-xs text-stone-700">Leitor (L)</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => addSlot(sess.tempId, "P")} className="font-bold text-xs text-stone-700">Preces (P)</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                </div>
              ))}

              {/* Botão de Adicionar outro Horário */}
              <div className="pt-1">
                <Button 
                  variant="outline" 
                  onClick={addSession}
                  className="w-full h-10 border-dashed border-stone-500 text-stone-600 font-black rounded-xl hover:bg-stone-100 transition-all text-[10px] uppercase tracking-wider bg-white"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Adicionar outro Horário
                </Button>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Rodapé Fixo (Sticky) */}
      <div className="shrink-0 bg-white border-t border-stone-200 p-4 pb-5 shadow-[0_-10px_40px_rgba(0,0,0,0.04)] z-50">
        <Button 
          disabled={isSaving || !date || sessions.some(s => !s.time || s.slots.some(slot => !slot.memberId))}
          className="w-full h-11 bg-green-600 hover:bg-green-700 text-white font-black tracking-widest uppercase text-[10px] rounded-xl shadow-xl shadow-green-200/50 transition-all active:scale-95 disabled:opacity-50"
          onClick={handleSaveMass}
        >
          {isSaving ? (
            <div className="h-4 w-4 animate-spin border-2 border-white border-t-transparent rounded-full" />
          ) : (
            <>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Salvar Escala do Dia
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
