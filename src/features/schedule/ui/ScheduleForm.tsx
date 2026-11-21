"use client"

import { scheduleErrorMessage } from '@/features/schedule/scheduleErrorMessage'

import { useState, useEffect, useRef } from "react"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
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
import { makeListProfiles } from "@/main/factories/usecases/profiles"
import { 
  makeCheckMassExists, 
  makeGetProfilesUsage, 
  makeSaveScheduleBatch,


  makeListOccupiedDatesForMonth,
  makeListSchedulesForMonth
} from "@/main/factories/usecases/schedule"
import { makeListUnavailableByDate } from "@/main/factories/usecases/profiles"
import { Profile } from "@/domain/models/Profile"
import { Plus, Trash2, AlertCircle, Eye, Pencil, Check, ChevronDown, ChevronLeft, ChevronRight, CalendarDays } from "lucide-react"
import { roleLabel as roleName } from "@/shared/constants/roles"
import { format, isValid } from "date-fns"
import { ptBR } from "date-fns/locale"
import { toast } from "sonner"
import { cn } from "@/shared/lib/utils"
import { TimeRoller } from "@/shared/ui/TimeRoller"

interface ScheduleFormProps {
  currentMonth: Date
  onSuccess: () => void
  onClose: () => void
  /** Avisa o dia escolhido (yyyy-MM-dd, ou "" sem escolha) para o título do sheet. */
  onDateChange?: (date: string) => void
  /** Avisa se há alterações não salvas (para confirmar antes de descartar). */
  onDirtyChange?: (dirty: boolean) => void
  /** Chamado pelo botão Cancelar (a tela pode pedir confirmação). Sem isso, usa onClose. */
  onRequestClose?: () => void
  initialData?: any
  /** Abre a edição do dia que já tem escala (aviso de duplicidade). */
  onEditExisting?: (date: string) => void
}

interface Slot {
  id: string
  roleType: "C" | "L" | "P"
  roleLabel: string
  profileId: string
  profileName: string
}

interface Session {
  dbId?: string
  scheduleRevision?: number
  tempId: string
  time: string
  description: string
  slots: Slot[]
  collapsed?: boolean
}

export function ScheduleForm({ currentMonth, onSuccess, onClose, initialData, onEditExisting, onDateChange, onDirtyChange, onRequestClose }: ScheduleFormProps) {
  const [date, setDate] = useState("")
  // Depois de escolher o dia, o calendário some; o lápis reabre. Evita trocar de dia sem querer.
  const [calendarOpen, setCalendarOpen] = useState(!initialData)
  const onDateChangeRef = useRef(onDateChange)
  useEffect(() => {
    onDateChangeRef.current = onDateChange
  })
  useEffect(() => {
    onDateChangeRef.current?.(date)
  }, [date])
  useEffect(() => {
    setCalendarOpen(!initialData)
  }, [initialData])
  // Mês exibido no calendário (o admin pode navegar sem fechar o sheet)
  const [viewMonth, setViewMonth] = useState(() => new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1))
  useEffect(() => {
    setViewMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1))
  }, [currentMonth])
  const [sessions, setSessions] = useState<Session[]>([])
  const [removedMasses, setRemovedMasses] = useState<{ id: string; expectedRevision?: number }[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [usageCounts, setUsageCounts] = useState<Record<string, number>>({})
  const [activeMonthRef, setActiveMonthRef] = useState(format(currentMonth, "yyyy-MM"))
  const [isSaving, setIsSaving] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [pickerTarget, setPickerTarget] = useState<{ sessTempId: string; slotId: string } | null>(null)
  const [unavailableUserIds, setUnavailableUserIds] = useState<string[]>([])
  const [hasExistingScale, setHasExistingScale] = useState(false)
  const [existingMassesFromDb, setExistingMassesFromDb] = useState<any[]>([])
  const [occupiedDates, setOccupiedDates] = useState<string[]>([])
  const [allMonthMasses, setAllMonthMasses] = useState<any[]>([])
  // Contadores de requisição: respostas atrasadas de um dia/mês anterior são descartadas
  const unavailableReqRef = useRef(0)
  const sessionsRef = useRef<Session[]>([])
  const monthReqRef = useRef(0)
  // Alterações não salvas: nova escala = algo preenchido; edição = diferente do que foi carregado
  const baselineRef = useRef<string | null>(null)
  const snapshotOf = (list: Session[]) => JSON.stringify(list.map(x => [x.time, x.description, x.slots.map(sl => [sl.roleType, sl.profileId])]))
  sessionsRef.current = sessions

  // Missas já gravadas no dia que NÃO estão no formulário (as do formulário valem pelo estado atual)
  const otherDbMassTimes = (): string[] =>
    existingMassesFromDb
      .filter(m => !sessions.some(o => o.dbId === m.id) && !removedMasses.some(removed => removed.id === m.id))
      .map(m => String(m.time).substring(0, 5))

  const hasTimeConflict = (sess: Session): boolean => {
    if (!sess.time) return false
    return sessions.some(o => o.tempId !== sess.tempId && o.time === sess.time) || otherDbMassTimes().includes(sess.time)
  }

  // Sugere o próximo horário livre para não nascer uma missa repetida
  const nextFreeTime = (): string => {
    const used = new Set([...sessions.map(x => x.time), ...otherDbMassTimes()])
    const preferred = ["07:00", "09:00", "11:00", "19:00"]
    const candidates = [...preferred, ...Array.from({ length: 17 }, (_, i) => `${String(i + 6).padStart(2, "0")}:00`)]
    return candidates.find(t => !used.has(t)) ?? "07:00"
  }

  const createEmptySession = (): Session => ({
    tempId: Math.random().toString(36).substring(2, 9),
    time: nextFreeTime(),
    description: "",
    slots: []
  })

  const loadAllMonthMasses = async (mRef: string) => {
    const reqId = ++monthReqRef.current
    try {
      const d = new Date(`${mRef}-01T00:00:00`)
      const masses = await makeListSchedulesForMonth().execute(d, true)
      if (reqId !== monthReqRef.current) return
      setAllMonthMasses(masses)
    } catch (error) {
      console.error("Erro ao carregar missas do mês para tooltip:", error)
    }
  }

  useEffect(() => {
    loadProfiles()
    loadUsage(activeMonthRef)
    loadAllMonthMasses(activeMonthRef)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- carga inicial: só no mount
  }, [])

  // Dias já com escala cadastrada: recarrega se o mês exibido mudar
  const occupiedMonthRef = format(viewMonth, "yyyy-MM")
  useEffect(() => {
    let cancelled = false
    makeListOccupiedDatesForMonth().execute(occupiedMonthRef)
      .then(dates => { if (!cancelled) setOccupiedDates(dates) })
      .catch(console.error)
    return () => { cancelled = true }
  }, [occupiedMonthRef])

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reage somente à troca de data
  }, [date])

  const loadUnavailableForDate = async (d: string) => {
    const reqId = ++unavailableReqRef.current
    try {
      const [ids, existingMasses] = await Promise.all([
        makeListUnavailableByDate().execute(d),
        makeCheckMassExists().execute(d)
      ])
      // Descarta resposta de um dia que já não é o selecionado
      if (reqId !== unavailableReqRef.current) return
      setUnavailableUserIds(ids)
      // Nova escala: quem já foi escolhido e está indisponível neste dia sai da função
      if (!initialData) {
        const removed = sessionsRef.current
          .flatMap(sess => sess.slots)
          .filter(slot => slot.profileId && ids.includes(slot.profileId))
          .map(slot => slot.profileName || "Leitor")
        if (removed.length > 0) {
          setSessions(prev => prev.map(sess => ({
            ...sess,
            slots: sess.slots.map(slot =>
              slot.profileId && ids.includes(slot.profileId) ? { ...slot, profileId: "", profileName: "" } : slot
            )
          })))
          const names = Array.from(new Set(removed)).join(", ")
          const plural = removed.length > 1
          toast.warning(`${names} ${plural ? "estão indisponíveis" : "está indisponível"} neste dia e ${plural ? "foram removidos" : "foi removido(a)"} da escala.`)
        }
      }
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
    setRemovedMasses([])
    if (initialData && Array.isArray(initialData)) {
      // Entrou em modo edição (inclusive vindo do aviso "já existe escala"): o aviso deixa de valer
      setHasExistingScale(false)
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
            profileId: s.profileId,
            profileName: s.readerName || s.profileName || s.reader?.fullName
          }
        })

        return {
          dbId: item.id,
          scheduleRevision: item.scheduleRevision,
          tempId: Math.random().toString(36).substring(2, 9),
          time: item.time?.substring(0, 5) || "",
          description: item.specialDescription || item.specialTitle || "",
          slots: mappedSlots,
          collapsed: true
        }
      })
      baselineRef.current = snapshotOf(mappedSessions)
      setSessions(mappedSessions)
    } else {
      setSessions([])
    }
  }, [initialData])

  const loadProfiles = async () => {
    try {
      const profilesList = await makeListProfiles().execute()
      setProfiles(profilesList)
    } catch (error) {
      console.error("Erro ao carregar leitores:", error)
    }
  }

  const loadUsage = async (mRef: string) => {
    try {
      const counts = await makeGetProfilesUsage().execute(mRef)
      setUsageCounts(counts)
    } catch (error) {
      console.error("Erro ao carregar uso de perfis:", error)
    }
  }

  const getProfileSchedules = (profileId: string) => {
    const schedules: { date: string; time: string; role: string }[] = []

    allMonthMasses.forEach(mass => {
      mass.slots?.forEach((s: any) => {
        if (s.profileId === profileId) {
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
        if (s.profileId === profileId && sess.time && date) {
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

  const checkPreference = (profile: Profile, massTime: string, massDate: string) => {
    if (!profile.preferences?.day_preferences) return false
    
    // Obter dia da semana (0-6, 0 é domingo)
    try {
      const dateObj = new Date(massDate + 'T00:00:00')
      const dayOfWeek = dateObj.getDay()
      
      // O app usa "6" para Domingo nas preferências do perfil
      const dayKey = dayOfWeek === 0 ? "6" : dayOfWeek.toString()
      
      const prefs = profile.preferences.day_preferences[dayKey]
      return Array.isArray(prefs) && (prefs.includes(massTime) || prefs.includes(massTime.substring(0, 5)))
    } catch {
      return false
    }
  }

  const addSession = () => {
    setSessions([...sessions, createEmptySession()])
  }

  const removeSession = (tempId: string, dbId?: string) => {
    const index = sessions.findIndex(item => item.tempId === tempId)
    const session = sessions[index]
    if (!session) return
    if (dbId) setRemovedMasses(previous => [...previous, { id: dbId, expectedRevision: session.scheduleRevision }])
    setSessions(previous => previous.filter(item => item.tempId !== tempId))
    toast.message(`Missa das ${session.time} excluída`, {
      duration: 8000,
      action: {
        label: "Desfazer",
        onClick: () => {
          if (dbId) setRemovedMasses(previous => previous.filter(removed => removed.id !== dbId))
          setSessions(previous => {
            const next = [...previous]
            next.splice(Math.min(index, next.length), 0, session)
            return next
          })
        }
      }
    })
  }
  const updateSessionField = (tempId: string, field: keyof Session, value: any) => {
    setSessions(sessions.map(s => s.tempId === tempId ? { ...s, [field]: value } : s))
  }

  const addSlot = (sessionTempId: string, roleType: "C" | "L" | "P") => {
    const newSlot: Slot = {
      id: Math.random().toString(36).substring(2, 9),
      roleType,
      roleLabel: "",
      profileId: "",
      profileName: ""
    }
    setSessions(sessions.map(sess => {
      if (sess.tempId === sessionTempId) {
        const updatedSlots = [...sess.slots, newSlot]
        return { ...sess, slots: updateRoleLabels(updatedSlots) }
      }
      return sess
    }))
    // Já abre a lista de leitores: um toque na função basta
    setPickerTarget({ sessTempId: sessionTempId, slotId: newSlot.id })
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

  const updateSlotProfile = (sessionTempId: string, slotId: string, profile: Profile) => {
    setSessions(sessions.map(sess => {
      if (sess.tempId === sessionTempId) {
        const updatedSlots = sess.slots.map(s => 
          s.id === slotId ? { ...s, profileId: profile.id, profileName: profile.fullName } : s
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
    if (sessions.some(sess => !sess.collapsed)) {
      toast.error('Conclua todas as missas antes de salvar.')
      return
    }
    for (const sess of sessions) {
      if (!sess.time) {
        toast.error("Preencha o horário de todas as missas")
        return
      }
      // Missa sem funções (sem leitores) é permitida, mas precisa de descrição.
      if (sess.slots.length === 0 && !sess.description.trim()) {
        toast.error(`Escreva a descrição da missa das ${sess.time}, que não tem funções.`)
        return
      }
      if (sess.slots.some(slot => !slot.profileId)) {
        toast.error(`Escolha um leitor para todas as funções da missa das ${sess.time}.`)
        return
      }
      
    }

    // Nova escala: nenhum leitor indisponível no dia (cobre troca de dia e dados desatualizados)
    if (!initialData) {
      const unavailableSlot = sessions.flatMap(s => s.slots).find(slot => slot.profileId && unavailableUserIds.includes(slot.profileId))
      if (unavailableSlot) {
        toast.error(`${unavailableSlot.profileName || "Um leitor"} está indisponível neste dia.`)
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

    // Um leitor não pode aparecer mais de uma vez no mesmo dia
    const seenProfiles = new Map<string, string>()
    for (const sess of sessions) {
      for (const slot of sess.slots) {
        if (!slot.profileId) continue
        if (seenProfiles.has(slot.profileId)) {
          toast.error(`${slot.profileName || seenProfiles.get(slot.profileId)} está escalado(a) mais de uma vez neste dia.`)
          return
        }
        seenProfiles.set(slot.profileId, slot.profileName)
      }
    }

    // Validação de duplicidade contra o banco de dados
    for (const sess of sessions) {
      if (otherDbMassTimes().includes(sess.time)) {
        toast.error(`Já existe uma missa cadastrada para o horário ${sess.time} neste dia.`)
        return
      }
    }

    setIsSaving(true)
    try {
      const actualMonthRef = format(new Date(date + 'T00:00:00'), "yyyy-MM")
      const entries = sessions.map(sess => ({
        massId: sess.dbId,
        massData: { expectedRevision: sess.scheduleRevision, date, time: `${sess.time}:00`, specialDescription: sess.description, monthReference: actualMonthRef },
        slots: sess.slots.map(slot => ({ id: /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(slot.id) ? slot.id : undefined, role: slot.roleLabel, profileId: slot.profileId }))
      }))
      await makeSaveScheduleBatch().execute(entries, removedMasses)
      toast.success("Escala salva com sucesso!")
      onSuccess()
      onClose()
    } catch (error) {
      toast.error(scheduleErrorMessage(error, "Erro ao salvar escala. Tente novamente."))
    } finally {
      setIsSaving(false)
    }
  }


  const closePicker = () => {
    setPickerTarget(null)
    setSearchTerm("")
  }

  const isDirty = !isSaving && (initialData
    ? removedMasses.length > 0 || (baselineRef.current !== null && snapshotOf(sessions) !== baselineRef.current)
    : sessions.length > 1 || sessions.some(x => x.slots.length > 0 || x.description.trim() !== ""))
  const onDirtyChangeRef = useRef(onDirtyChange)
  useEffect(() => {
    onDirtyChangeRef.current = onDirtyChange
  })
  useEffect(() => {
    onDirtyChangeRef.current?.(isDirty)
  }, [isDirty])

  const missingCount = sessions.reduce((n, sess) => n + sess.slots.filter(sl => !sl.profileId).length, 0)
  const blockedByExisting = hasExistingScale && !initialData && !!onEditExisting
  const dateObj = date ? new Date(date + 'T00:00:00') : null
  const dateIsValid = !!dateObj && isValid(dateObj)
  const dateLong = dateObj && dateIsValid ? format(dateObj, "EEEE, d 'de' MMMM", { locale: ptBR }) : ""
  const dateShortWeekday = dateObj && dateIsValid ? format(dateObj, "EEE, d 'de' MMMM", { locale: ptBR }) : ""
  const dayShort = dateObj && dateIsValid ? format(dateObj, "d 'de' MMMM", { locale: ptBR }) : ""
  const hasAnyTimeConflict = sessions.some(hasTimeConflict)
  const hasUnavailableChosen = !initialData && sessions.some(s => s.slots.some(slot => !!slot.profileId && unavailableUserIds.includes(slot.profileId)))
  const needsDescriptionCount = sessions.filter(s => s.slots.length === 0 && !s.description.trim()).length
  // Só salva com todas as missas concluídas (cards recolhidos pelo "Concluir missa").
  const openCount = sessions.filter(s => !s.collapsed).length
  const canSave = !isSaving && !!date && !blockedByExisting && !hasAnyTimeConflict && !hasUnavailableChosen && sessions.length > 0 && needsDescriptionCount === 0 && openCount === 0 && !sessions.some(s => !s.time || s.slots.some(slot => !slot.profileId))

  let footerSummary: React.ReactNode
  if (!date) footerSummary = "Escolha o dia da escala para começar."
  else if (blockedByExisting) footerSummary = "Escolha um dia sem escala para continuar."
  else if (hasAnyTimeConflict) footerSummary = <strong className="font-bold text-[#A23F06]">Corrija os horários repetidos para salvar.</strong>
  else if (openCount > 0) {
    footerSummary = (
      <>
        <strong className="font-bold text-[#A23F06]">{openCount === 1 ? "1 missa aberta" : `${openCount} missas abertas`}</strong>
        <br />
        Toque em "Concluir missa" para salvar.
      </>
    )
  } else if (missingCount > 0) {
    footerSummary = (
      <>
        <strong className="font-bold text-[#A23F06]">{missingCount === 1 ? "1 função sem leitor" : `${missingCount} funções sem leitor`}</strong>
        <br />
        Reabra a missa e escolha um leitor para cada função.
      </>
    )
  } else {
    footerSummary = sessions.length === 1 ? "1 missa pronta para salvar." : `${sessions.length} missas prontas para salvar.`
  }


  const pickerSession = pickerTarget ? sessions.find(x => x.tempId === pickerTarget.sessTempId) : undefined
  const pickerSlot = pickerSession?.slots.find(x => x.id === pickerTarget?.slotId)

  const isScheduledElsewhere = (profileId: string, exceptSlotId: string) =>
    sessions.some(s => s.slots.some(sl => sl.profileId === profileId && sl.id !== exceptSlotId))

  const renderPickerItem = (p: Profile, kind: "pref" | "available" | "unavailable") => {
    if (!pickerSession || !pickerSlot) return null
    const isAlreadyScheduled = isScheduledElsewhere(p.id, pickerSlot.id)
    const isUnavailable = kind === "unavailable"
    const isBlocked = isUnavailable || isAlreadyScheduled
    const used = usageCounts[p.id] || 0
    return (
      <CommandItem
        key={p.id}
        value={p.fullName}
        disabled={isBlocked}
        onSelect={() => {
          if (isBlocked) {
            toast.warning(
              isAlreadyScheduled
                ? `${p.fullName} já está escalado(a) neste dia.`
                : `${p.fullName} informou que não poderá participar nesta data.`,
              { duration: 5000, icon: <AlertCircle className="h-4 w-4 text-amber-600" /> }
            )
            return
          }
          updateSlotProfile(pickerSession.tempId, pickerSlot.id, p)
          closePicker()
        }}
        className="flex min-h-[60px] items-center justify-between gap-3 rounded-[14px] px-2.5 py-2"
      >
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className={cn("truncate text-[16px] font-bold", isBlocked ? "text-black/50" : "text-black")}>{p.fullName}</span>
          <span className={cn("text-xs", isBlocked ? "font-bold text-[#A23F06]" : "text-[#6B5D50]")}>
            {isAlreadyScheduled
              ? "Já escalado neste dia"
              : isUnavailable
                ? "Informou indisponibilidade"
                : used > 0
                  ? `${used}x neste mês`
                  : "Ainda sem escala neste mês"}
          </span>
        </span>
        {isAlreadyScheduled ? (
          <span className="shrink-0 rounded-full bg-[#FFF3D1] px-2.5 py-1 text-xs font-bold text-[#6B3F00]">Já escalado</span>
        ) : isUnavailable ? (
          <span className="shrink-0 rounded-full bg-[#FDEBDD] px-2.5 py-1 text-xs font-bold text-[#A23F06]">Indisponível</span>
        ) : kind === "pref" ? (
          <span className="shrink-0 rounded-full bg-[#E6F3EB] px-2.5 py-1 text-xs font-bold text-[#1E6B43]">Preferência</span>
        ) : null}
      </CommandItem>
    )
  }

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-[#FAF5E6]">
      {/* Área de Conteúdo com Scroll */}
      <div className="flex-1 space-y-6 overflow-y-auto px-4 pb-8 pt-6">

        {/* Passo 1: Dia da escala */}
        <div className="space-y-3.5">
          <StepTitle n={1}>Dia da escala</StepTitle>

          {calendarOpen ? (() => {
            const year = viewMonth.getFullYear()
            const month = viewMonth.getMonth()
            const daysInMonth = new Date(year, month + 1, 0).getDate()
            const firstDayOfWeek = new Date(year, month, 1).getDay() // 0 = Domingo
            const days = Array.from({ length: daysInMonth }, (_, i) => i + 1)
            const weekDays = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB']

            return (
              <div className="space-y-2.5 rounded-[22px] border border-[#E9DFCB] bg-white p-3">
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    aria-label="Mês anterior"
                    onClick={() => setViewMonth(new Date(year, month - 1, 1))}
                    className="flex h-11 w-11 items-center justify-center rounded-full text-[#322113] transition-colors hover:bg-[#FAF5E6] active:scale-95"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <span className="text-[15px] font-extrabold text-[#322113] first-letter:uppercase">{format(viewMonth, "MMMM yyyy", { locale: ptBR })}</span>
                  <button
                    type="button"
                    aria-label="Próximo mês"
                    onClick={() => setViewMonth(new Date(year, month + 1, 1))}
                    className="flex h-11 w-11 items-center justify-center rounded-full text-[#322113] transition-colors hover:bg-[#FAF5E6] active:scale-95"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {weekDays.map((day, i) => (
                    <div key={`header-${i}`} className={cn("pb-1 text-center text-[11px] font-bold tracking-wide", i === 0 ? "text-[#322113]" : "text-[#6B5D50]")}>
                      {day}
                    </div>
                  ))}

                  {Array.from({ length: firstDayOfWeek }).map((_, i) => (
                    <div key={`empty-${i}`} className="h-12 w-full" />
                  ))}

                  {days.map(day => {
                    const dayStr = String(day).padStart(2, '0')
                    const monthStr = String(month + 1).padStart(2, '0')
                    const fullDate = `${year}-${monthStr}-${dayStr}`
                    const isSelected = date === fullDate
                    const isOccupied = occupiedDates.includes(fullDate)
                    const isSunday = new Date(year, month, day).getDay() === 0

                    return (
                      <button
                        key={day}
                        type="button"
                        aria-label={`${day} de ${format(new Date(year, month, day), "MMMM", { locale: ptBR })}${isOccupied ? ", já tem escala" : ""}`}
                        disabled={!!initialData && !isSelected}
                        onClick={() => {
                          if (initialData) return
                          setDate(fullDate)
                          setCalendarOpen(false)
                          if (sessions.length === 0) setSessions([createEmptySession()])
                        }}
                        className={cn(
                          "flex h-12 w-full flex-col items-center justify-center rounded-xl border text-[15px] leading-none transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100",
                          isSelected
                            ? "border-[#322113] bg-[#322113] font-extrabold text-[#FFF8E8]"
                            : isOccupied
                              ? "border-[#E8B21E] bg-[#FFF6D6] font-extrabold text-[#6B3F00]"
                              : cn("border-[#E9DFCB] bg-white text-[#241A10] hover:bg-[#FAF5E6]", isSunday ? "font-extrabold" : "font-semibold")
                        )}
                      >
                        {day}
                        {isOccupied && <span aria-hidden="true" className="mt-[3px] h-[5px] w-[5px] rounded-full bg-[#E8B21E]" />}
                      </button>
                    )
                  })}
                </div>
                <div className="flex items-center gap-2 px-1 text-xs text-[#6B5D50]">
                  <span aria-hidden="true" className="inline-block h-3 w-3 rounded-[4px] border border-[#E8B21E] bg-[#FFF6D6]" />
                  Dia que já tem escala
                  <span aria-hidden="true" className="ml-2.5 inline-block h-3 w-3 rounded-[4px] bg-[#322113]" />
                  Dia escolhido
                </div>
                {initialData && (
                  <p className="px-1 text-xs text-[#6B5D50]">Você está editando este dia. Para escolher outro dia, feche e abra de novo.</p>
                )}
              </div>
            )
          })() : null}

          {!calendarOpen && date && dateLong && (
            <div className="flex min-h-14 items-center gap-3 rounded-[22px] border border-[#E9DFCB] bg-white p-2 pl-4">
              <CalendarDays className="h-[18px] w-[18px] shrink-0 text-[#322113]" />
              <p className="min-w-0 flex-1 text-[15px] font-extrabold leading-tight text-[#322113] first-letter:uppercase" title={dateLong}>{dateShortWeekday}</p>
              {!initialData && (
                <button
                  type="button"
                  aria-label="Alterar data"
                  onClick={() => setCalendarOpen(true)}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#E9DFCB] bg-[#FAF5E6] text-[#322113] transition-transform active:scale-95"
                >
                  <Pencil className="h-[18px] w-[18px]" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Aviso de Escala Existente */}
        {hasExistingScale && !initialData && (
          <div role="alert" className="space-y-3 rounded-[20px] border border-[#F2CDB0] bg-[#FDEBDD] p-4 animate-in fade-in zoom-in duration-300">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-[#A23F06]">
                <AlertCircle className="h-[18px] w-[18px]" />
              </span>
              <div className="space-y-1">
                <p className="text-base font-extrabold leading-snug text-[#6B2A02]">
                  Já existe escala em {dayShort}
                </p>
                <p className="text-sm leading-snug text-[#7A4A2A]">
                  Para incluir outro horário nesse dia, edite a escala que já está no mural, assim nada é duplicado.
                </p>
              </div>
            </div>
            {onEditExisting && (
              <Button
                type="button"
                onClick={() => onEditExisting(date)}
                className="h-12 w-full gap-2 rounded-[14px] bg-[#322113] text-[15px] font-extrabold text-[#FFF8E8] hover:bg-[#241709]"
              >
                <Pencil className="h-[18px] w-[18px]" />
                Editar a escala do dia {dateObj && dateIsValid ? format(dateObj, "d") : ""}
              </Button>
            )}
          </div>
        )}

        {/* Passo 2: Missas do dia */}
        {date && !blockedByExisting && (
          <div className="space-y-3.5 animate-in fade-in slide-in-from-top-4 duration-500">
            <StepTitle n={2}>Missas do dia</StepTitle>

            {sessions.map((sess, sessIndex) => {
              const sessMissing = sess.slots.filter(sl => !sl.profileId).length
              const timeConflict = hasTimeConflict

              if (sess.collapsed) {
                return (
                  <section
                    key={sess.tempId}
                    aria-label={`Missa das ${sess.time}`}
                    onClick={() => updateSessionField(sess.tempId, 'collapsed', false)}
                    className="cursor-pointer space-y-3 rounded-[22px] border border-[#E9DFCB] bg-white py-3.5 pl-4 pr-2 pb-4"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-[28px] font-extrabold tabular-nums tracking-tight">{sess.time}</span>
                      {timeConflict(sess) ? (
                        <span className="inline-flex items-center rounded-full bg-[#FDEBDD] px-2.5 py-0.5 text-xs font-bold text-[#A23F06]">Horário repetido</span>
                      ) : sessMissing === 0 && sess.slots.length > 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#E6F3EB] px-2.5 py-0.5 text-xs font-bold text-[#1E6B43]">
                          <Check className="h-3 w-3" strokeWidth={3} />
                          Completa
                        </span>
                      ) : (
                        <span className={cn(
                          "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold",
                          sess.slots.length === 0 ? "bg-[#F4EEDD] text-[#6B5D50]" : "bg-[#FDEBDD] text-[#A23F06]"
                        )}>
                          {sess.slots.length === 0 ? "Sem funções" : sessMissing === 1 ? "1 função sem leitor" : `${sessMissing} funções sem leitor`}
                        </span>
                      )}
                      <span className="flex-1" />
                      <button
                        type="button"
                        aria-label={`Editar missa das ${sess.time}`}
                        aria-expanded={false}
                        onClick={(e) => {
                          e.stopPropagation()
                          updateSessionField(sess.tempId, 'collapsed', false)
                        }}
                        className="flex h-11 w-11 items-center justify-center rounded-full border border-[#D9CDB8] bg-white text-[#322113] transition-colors hover:bg-[#FAF5E6]"
                      >
                        <Pencil className="h-[18px] w-[18px]" />
                      </button>
                    </div>
                    {sess.description && <p className="pr-2 text-[15px] font-bold">{sess.description}</p>}
                    {sess.slots.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pr-2">
                        {sess.slots.map(slot => (
                          <span
                            key={slot.id}
                            className={cn(
                              "rounded-full border px-2.5 py-1 text-[13px]",
                              slot.profileId ? "border-[#E9DFCB] bg-[#F4EEDD] text-[#241A10]" : "border-dashed border-[#C9B99C] text-[#A23F06]"
                            )}
                          >
                            <strong className="font-extrabold text-[#322113]">{slot.roleLabel}</strong>
                            {"  "}
                            {slot.profileId ? slot.profileName : "sem leitor"}
                          </span>
                        ))}
                      </div>
                    )}
                  </section>
                )
              }

              return (
                <section key={sess.tempId} className={cn("space-y-4 rounded-[22px] border bg-white p-4", timeConflict(sess) ? "border-[#E0824A]" : "border-[#E9DFCB]")}>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold tracking-[0.1em] text-[#6B5D50]">MISSA {sessIndex + 1} · HORÁRIO</span>
                    {sessions.length > 1 && (
                      <button
                        type="button"
                        aria-label="Excluir esta missa"
                        title="Excluir esta missa"
                        className="flex h-11 w-11 items-center justify-center rounded-xl text-[#B5472A] transition-colors hover:bg-red-50"
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          removeSession(sess.tempId, sess.dbId)
                        }}
                      >
                        <Trash2 className="pointer-events-none h-[18px] w-[18px]" />
                      </button>
                    )}
                  </div>

                  <div className="-mt-2 flex w-full items-center justify-center">
                    <TimeRoller
                      value={sess.time || "07:00"}
                      onChange={(val) => updateSessionField(sess.tempId, 'time', val)}
                    />
                    <div className="mt-3 flex flex-wrap justify-center gap-2" role="group" aria-label="Atalhos de hora">
                      {["07:00", "09:00", "11:00", "19:00"].map((t) => (
                        <button
                          key={t}
                          type="button"
                          aria-pressed={sess.time === t}
                          onClick={() => updateSessionField(sess.tempId, 'time', t)}
                          className={cn(
                            "h-11 min-w-[4.5rem] rounded-full border px-3 text-sm font-bold transition-colors active:scale-95",
                            sess.time === t ? "border-[#322113] bg-[#322113] text-[#FFF8E8]" : "border-[#D9CDB8] bg-white text-[#322113] hover:bg-[#FAF5E6]"
                          )}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                  {timeConflict(sess) && (
                    <p role="alert" className="-mt-1 flex items-start gap-2 rounded-xl bg-[#FDEBDD] px-3 py-2 text-[13px] font-semibold leading-snug text-[#A23F06]">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                      Já existe uma missa às {sess.time} neste dia. Altere o horário.
                    </p>
                  )}

                  <div className="space-y-1.5">
                    <label htmlFor={`desc-${sess.tempId}`} className="pl-0.5 text-xs font-bold text-[#6B5D50]">{sess.slots.length === 0 ? "Descrição da missa" : "Celebração (opcional)"}</label>
                    <Input
                      id={`desc-${sess.tempId}`}
                      placeholder="Ex.: 1º Domingo do Advento"
                      value={sess.description}
                      onChange={(e) => updateSessionField(sess.tempId, 'description', e.target.value)}
                      aria-required={sess.slots.length === 0}
                      className="h-12 rounded-[14px] border-[#E9DFCB] bg-[#FAF5E6] px-3.5 text-[15px] font-semibold placeholder:font-normal placeholder:text-[#6B5D50]"
                    />

                  </div>

                  {/* Funções da missa */}
                  <div className="space-y-3.5">
                    {sess.slots.map((slot) => {
                      const slotProfile = slot.profileId ? profiles.find(p => p.id === slot.profileId) : undefined
                      const isPref = !!slotProfile && checkPreference(slotProfile, sess.time, date)
                      const isAlready = !!slot.profileId && sessions.some(s => s.slots.some(sl => sl.profileId === slot.profileId && sl.id !== slot.id))
                      const used = slot.profileId ? usageCounts[slot.profileId] || 0 : 0
                      const schedules = slot.profileId ? getProfileSchedules(slot.profileId) : []
                      const showMeta = !!slot.profileId && (isPref || isAlready || used > 0 || schedules.length > 0)

                      return (
                        <div key={slot.id} className="flex items-start gap-2.5">
                          <span className="mt-5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#E9DFCB] bg-[#F4EEDD] text-[15px] font-extrabold text-[#322113]">
                            {slot.roleLabel}
                          </span>

                          <div className="flex min-w-0 flex-1 flex-col gap-1">
                            <span className="text-xs font-bold leading-4 text-[#6B5D50]">{roleName(slot.roleLabel)}</span>
                            <button
                              type="button"
                              onClick={() => setPickerTarget({ sessTempId: sess.tempId, slotId: slot.id })}
                              className={cn(
                                "flex h-11 w-full min-w-0 items-center gap-2 rounded-xl px-3 text-left text-[15px] font-bold transition-colors",
                                slot.profileId
                                  ? "border border-[#D9CDB8] bg-white text-black hover:bg-[#FAF5E6]"
                                  : "border-[1.5px] border-dashed border-[#C9B99C] text-[#A23F06] hover:bg-[#FDEBDD]/50"
                              )}
                            >
                              {slot.profileId ? (
                                <>
                                  <span className="flex-1 truncate">{slot.profileName}</span>
                                  <ChevronDown className="h-4 w-4 shrink-0 text-[#6B5D50]" />
                                </>
                              ) : (
                                <>
                                  <Plus className="h-4 w-4 shrink-0" />
                                  Escolher leitor
                                </>
                              )}
                            </button>

                            {showMeta && (
                              <div className="flex min-h-6 flex-wrap items-center gap-x-2 gap-y-0.5">
                                {isPref && !isAlready && <span className="rounded-full bg-[#E6F3EB] px-2.5 py-0.5 text-xs font-bold text-[#1E6B43]">Preferência</span>}
                                {isAlready && <span className="rounded-full bg-[#FFF3D1] px-2.5 py-0.5 text-xs font-bold text-[#6B3F00]">Já escalado neste dia</span>}
                                {used > 0 && <span className="text-xs text-[#6B5D50]">{used}x no mês</span>}
                                {schedules.length > 0 && (
                                  <Popover>
                                    <PopoverTrigger render={
                                      <button
                                        type="button"
                                        className="inline-flex h-7 items-center gap-1 text-xs font-bold text-[#322113] underline underline-offset-[3px]"
                                      >
                                        <Eye className="h-3.5 w-3.5" />
                                        Ver escalas
                                      </button>
                                    } />
                                    <PopoverContent side="top" align="start" className="z-[70] w-auto rounded-xl border border-[#E9DFCB] bg-white p-2 shadow-xl">
                                      <p className="mb-2 px-1 text-[10px] font-bold uppercase tracking-wider text-[#6B5D50]">
                                        Escalas neste mês
                                      </p>
                                      <div className="space-y-1">
                                        {schedules.map((sch, i) => (
                                          <div
                                            key={i}
                                            className={cn(
                                              "whitespace-nowrap rounded-md border px-2 py-1.5 text-xs font-medium",
                                              sch.date === date
                                                ? "border-[#E8B21E] bg-[#FFF6D6] text-[#6B3F00]"
                                                : "border-[#F1EADC] bg-[#FAF5E6] text-[#241A10]"
                                            )}
                                          >
                                            {format(new Date(sch.date + 'T00:00:00'), 'dd/MM')} - {sch.time} ({sch.role})
                                          </div>
                                        ))}
                                      </div>
                                    </PopoverContent>
                                  </Popover>
                                )}
                              </div>
                            )}
                          </div>

                          <button
                            type="button"
                            aria-label={`Remover ${roleName(slot.roleLabel)}`}
                            className="mt-5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[#B5472A] transition-colors hover:bg-red-50"
                            onClick={() => removeSlot(sess.tempId, slot.id)}
                          >
                            <Trash2 className="h-[18px] w-[18px]" />
                          </button>
                        </div>
                      )
                    })}
                  </div>

                  {/* Adicionar função */}
                  <div className="space-y-2 border-t border-[#F1EADC] pt-3">
                    <span className="pl-0.5 text-xs font-bold text-[#6B5D50]">Adicionar função</span>
                    <div className="flex flex-wrap gap-2">
                      {([["C", "Comentarista"], ["L", "Leitor"], ["P", "Preces"]] as const).map(([type, label]) => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => addSlot(sess.tempId, type)}
                          className="inline-flex h-11 items-center gap-1.5 rounded-full border border-[#322113] bg-white px-3.5 text-[13px] font-bold text-[#322113] transition-colors hover:bg-[#FAF5E6]"
                        >
                          <Plus className="h-3.5 w-3.5" strokeWidth={2.4} />
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <Button
                    type="button"
                    disabled={timeConflict(sess) || (sess.slots.length === 0 && !sess.description.trim()) || sessMissing > 0}
                    onClick={() => updateSessionField(sess.tempId, 'collapsed', true)}
                    className="h-[52px] w-full gap-2 rounded-2xl bg-[#322113] text-[15px] font-extrabold text-[#FFF8E8] hover:bg-[#241709] disabled:bg-[#EFE8D6] disabled:text-[#6B5D50] disabled:opacity-100"
                  >
                    <Check className="h-[18px] w-[18px]" strokeWidth={2.6} />
                    Concluir missa
                  </Button>
                  {!timeConflict(sess) && (sess.slots.length === 0 ? !sess.description.trim() : sessMissing > 0) && (
                    <p role="status" className="text-center text-xs font-bold text-[#A23F06]">
                      {sess.slots.length === 0
                        ? "Missa sem funções precisa de descrição para ser concluída."
                        : sessMissing === 1
                          ? "Escolha o leitor da função que está vazia para concluir a missa."
                          : `Escolha o leitor das ${sessMissing} funções vazias para concluir a missa.`}
                    </p>
                  )}
                </section>
              )
            })}

            <Button
              type="button"
              variant="outline"
              onClick={addSession}
              className="h-14 w-full gap-2 rounded-[18px] border-[1.5px] border-dashed border-[#C9B99C] bg-transparent text-[15px] font-bold text-[#322113] hover:bg-[#F4EEDD]"
            >
              <Plus className="h-[18px] w-[18px]" strokeWidth={2.4} />
              Adicionar outro Horário
            </Button>
          </div>
        )}
      </div>

      {/* Rodapé Fixo */}
      <div className="z-50 shrink-0 space-y-2.5 border-t border-[#E9DFCB] bg-white px-4 pb-5 pt-3 shadow-[0_-10px_30px_rgba(50,33,19,0.06)]">
        <p className="text-center text-[13px] leading-snug text-[#6B5D50]">{footerSummary}</p>
        <div className="flex gap-2.5">
          <Button
            type="button"
            variant="outline"
            onClick={onRequestClose ?? onClose}
            disabled={isSaving}
            className="h-[52px] flex-1 rounded-2xl border-[#D9CDB8] bg-white text-[15px] font-bold text-[#322113] hover:bg-[#FAF5E6]"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={!canSave}
            onClick={handleSaveMass}
            className="h-[52px] flex-[1.5] rounded-2xl bg-[#322113] text-[15px] font-extrabold text-[#FFF8E8] hover:bg-[#241709] disabled:bg-[#EFE8D6] disabled:text-[#6B5D50] disabled:opacity-100"
          >
            {isSaving ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#FFF8E8] border-t-transparent" />
            ) : (
              initialData ? "Salvar alterações" : "Salvar Rascunho"
            )}
          </Button>
        </div>
      </div>

      {/* Gaveta de escolha do leitor (dentro do sheet, sem portal) */}
      {pickerTarget && pickerSession && pickerSlot && (
        <div className="absolute inset-0 z-[60] flex flex-col justify-end" role="dialog" aria-modal="true" aria-label={`Escolher ${roleName(pickerSlot.roleLabel)}`} onKeyDown={(e) => { if (e.key === "Escape") closePicker() }}>
          <button type="button" aria-label="Fechar seleção de leitor" className="absolute inset-0 bg-[#241A10]/55" onClick={closePicker} />
          <div className="relative flex max-h-[85%] flex-col rounded-t-[28px] bg-[#FBF7EE] shadow-2xl animate-in slide-in-from-bottom duration-200">
            <span aria-hidden="true" className="mx-auto mt-3 h-[5px] w-10 shrink-0 rounded-full bg-[#D9CDB8]" />
            <div className="shrink-0 space-y-1 px-5 pb-3 pt-4">
              <h3 className="text-[22px] font-extrabold tracking-tight">Escolher {roleName(pickerSlot.roleLabel)}</h3>
              <p className="text-sm text-[#4A3D31] first-letter:uppercase">
                Missa das {pickerSession.time} · {dateLong.toLowerCase()}
              </p>
            </div>
            <Command className="min-h-0 flex-1 bg-transparent">
              <div className="shrink-0 px-4 pb-1.5">
                <CommandInput
                  placeholder="Buscar leitor"
                  value={searchTerm}
                  onValueChange={setSearchTerm}
                />
              </div>
              <CommandList className="max-h-none flex-1 px-3 pb-6">
                <CommandEmpty>Nenhum leitor encontrado.</CommandEmpty>
                {pickerSlot.profileId && (
                  <CommandGroup>
                    <CommandItem
                      value="liberar vaga"
                      onSelect={() => {
                        setSessions(current => current.map(session => session.tempId === pickerSession.tempId ? { ...session, slots: session.slots.map(item => item.id === pickerSlot.id ? { ...item, profileId: "", profileName: "" } : item) } : session))
                        closePicker()
                      }}
                      className="min-h-12 rounded-[14px] px-2.5 font-bold text-[#A23F06]"
                    >
                      Liberar vaga
                    </CommandItem>
                  </CommandGroup>
                )}
                {(() => {
                  // Quem foi menos escalado no mês aparece primeiro (equilibra a escala); empate: ordem alfabética
                  const byName = (a: Profile, b: Profile) => (usageCounts[a.id] || 0) - (usageCounts[b.id] || 0) || a.fullName.localeCompare(b.fullName)
                  const isUn = (p: Profile) => (!!p.id && unavailableUserIds.includes(p.id)) || isScheduledElsewhere(p.id, pickerSlot.id)
                  const preferred = profiles.filter(p => !isUn(p) && checkPreference(p, pickerSession.time, date)).sort(byName)
                  const available = profiles.filter(p => !isUn(p) && !checkPreference(p, pickerSession.time, date)).sort(byName)
                  const unavailable = profiles.filter(isUn).sort(byName)
                  return (
                    <>
                      {preferred.length > 0 && (
                        <CommandGroup heading="Preferem este horário · menos escalados primeiro">
                          {preferred.map(p => renderPickerItem(p, "pref"))}
                        </CommandGroup>
                      )}
                      {available.length > 0 && (
                        <CommandGroup heading="Disponíveis · menos escalados primeiro">
                          {available.map(p => renderPickerItem(p, "available"))}
                        </CommandGroup>
                      )}
                      {unavailable.length > 0 && (
                        <CommandGroup heading="Não podem neste dia">
                          {unavailable.map(p => renderPickerItem(p, "unavailable"))}
                        </CommandGroup>
                      )}
                    </>
                  )
                })()}
              </CommandList>
            </Command>
          </div>
        </div>
      )}
    </div>
  )
}

function StepTitle({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-[#E8B21E] text-[13px] font-extrabold text-[#322113]">{n}</span>
      <h2 className="text-lg font-extrabold text-black">{children}</h2>
    </div>
  )
}
