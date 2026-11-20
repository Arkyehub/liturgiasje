"use client"

import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { useRouter } from "next/navigation"
import { AnnouncementCard } from "@/features/announcements/ui/AnnouncementCard"
import { ScheduleCard } from "@/features/schedule/ui/ScheduleCard"
import { ReadAnnouncementsGroup } from "@/features/announcements/ui/ReadAnnouncementsGroup"
import { MassSummaryGrid } from "@/features/schedule/ui/MassSummaryGrid"
import { PastDaysGroup } from "@/features/schedule/ui/PastDaysGroup"
import { SectionTitle } from "@/shared/ui/SectionTitle"
import { MyScheduleWidget } from "@/features/schedule/ui/MyScheduleWidget"
import { BirthdayCard } from "@/shared/ui/BirthdayCard"
import { Button } from "@/shared/ui/button"
import { ChevronLeft, ChevronRight, Loader2, Plus, Plane, CheckCircle, FileText, Share2, X } from "lucide-react"
import { addMonths, format, subMonths, isToday, parseISO, isValid, startOfDay } from "date-fns"
import { ptBR } from "date-fns/locale"
import { roleLabel } from "@/shared/constants/roles"
import Link from "next/link"

import { useAuth } from "@/shared/hooks/useAuth"
import { AnnouncementForm } from "@/features/announcements/ui/AnnouncementForm"
import { useAnnouncementStore } from "@/features/announcements/store/useAnnouncementStore"
import { ScheduleForm } from "@/features/schedule/ui/ScheduleForm"
import { UnavailableForm } from "@/features/schedule/ui/UnavailableForm"
import { useAnnouncements } from "@/features/announcements/hooks/useAnnouncements"
import { useSchedule } from "@/features/schedule/hooks/useSchedule"
import { useUser } from "@/features/profile/hooks/useUser"
import { supabase } from "@/shared/api/supabase"
import { cn } from "@/shared/lib/utils"
import { toast } from "sonner"
import { APP_VERSION } from "@/shared/constants/version"
import { scheduleErrorMessage } from "@/features/schedule/scheduleErrorMessage"
import { usePullToRefresh } from "@/shared/hooks/usePullToRefresh"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetDescription,
} from "@/shared/ui/sheet"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/shared/ui/drawer"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog"
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/ui/avatar"
import { UserAvatar } from "@/shared/ui/UserAvatar"
import { AlertTriangle } from "lucide-react"

export default function Home() {
  const { user, profile, isActive, loading, signInWithGoogle, signOut } = useAuth()
  // Valores primitivos para dependências de efeitos: o objeto `profile` não deve disparar recargas.
  const profileId = profile?.id ?? null
  const isAdminRole = profile?.role === "admin"
  const lastFocusReloadAt = useRef(0)
  const router = useRouter()
  const [currentDate, setCurrentDate] = useState(new Date())
  const pendingScrollSlotId = useRef<string | null>(null)

  const { isFormOpen, setIsFormOpen } = useAnnouncementStore()
  const [isHydrated, setIsHydrated] = useState(false)

  useEffect(() => {
    setIsHydrated(true)
  }, [])
  
  const { 
    announcements, 
    loading: isLoadingAnnouncements, 
    loadAnnouncements, 
    markAsRead, 
    deleteAnnouncement,
    createAnnouncement,
    updateAnnouncement
  } = useAnnouncements()

  const {
    schedule,
    upcomingSchedule,
    swaps,
    loading: isLoadingSchedule,
    loadingSwaps,
    loadSchedule,
    loadUpcomingSchedule,
    loadSwaps,
    confirmSlot,
    requestSwap,
    cancelSwap,
    acceptSwap,
    deleteMasses,
    publishMonth,
    updateMassesStatus
  } = useSchedule()

  const { birthdays: allBirthdays, loadBirthdays } = useUser()

  const [announcementToEdit, setAnnouncementToEdit] = useState<any | null>(null)
  const [announcementToDelete, setAnnouncementToDelete] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isScheduleSheetOpen, setIsScheduleSheetOpen] = useState(false)
  const [scheduleToEdit, setScheduleToEdit] = useState<any | null>(null)
  const [scheduleToDelete, setScheduleToDelete] = useState<string[] | null>(null)
  const [isDeletingSchedule, setIsDeletingSchedule] = useState(false)
  const [swapTargetSlot, setSwapTargetSlot] = useState<any | null>(null)
  const [takeSwapTarget, setTakeSwapTarget] = useState<any | null>(null)
  const [isRequestingSwap, setIsRequestingSwap] = useState(false)
  const [isAcceptingSwap, setIsAcceptingSwap] = useState(false)
  const [isUnavailableDrawerOpen, setIsUnavailableDrawerOpen] = useState(false)
  const [isPublishing, setIsPublishing] = useState(false)
  const processedHashRef = useRef<string | null>(null)
  
  const [isUnconfirmedAlertOpen, setIsUnconfirmedAlertOpen] = useState(false)
  const [shareSwapOnRequest, setShareSwapOnRequest] = useState(true)
  const [isReadGroupOpen, setIsReadGroupOpen] = useState(false)
  const [isConfirmingPending, setIsConfirmingPending] = useState(false)

  // Lista de escalas do usuário logado que não foram confirmadas
  const myUnconfirmedSlots = useMemo(() => {
    if (!profile) return []
    const list: any[] = []
    upcomingSchedule.forEach(mass => {
      mass.slots.forEach(slot => {
        if (slot.profileId === profile.id && !slot.isConfirmed && !slot.isSwapRequested) {
          list.push({
            ...slot,
            massId: mass.id,
            massDate: mass.date,
            massTime: mass.time,
            specialDescription: mass.specialDescription
          })
        }
      })
    })
    return list
  }, [upcomingSchedule, profile])

  // Lista de trocas ordenadas por data (da mais próxima para a mais distante)
  const sortedSwaps = useMemo(() => {
    return [...swaps]
      .filter(s => s.mass)
      .sort((a, b) => {
        const dateTimeA = new Date(`${a.mass.date}T${a.mass.time}`)
        const dateTimeB = new Date(`${b.mass.date}T${b.mass.time}`)
        return dateTimeA.getTime() - dateTimeB.getTime()
      })
  }, [swaps])

  // Abrir o Dialog assim que carregar as escalas pendentes não confirmadas
  useEffect(() => {
    if (myUnconfirmedSlots.length > 0) {
      setIsUnconfirmedAlertOpen(true)
    } else {
      setIsUnconfirmedAlertOpen(false)
    }
  }, [myUnconfirmedSlots.length])

  const triggerRefresh = useCallback(async () => {
    if (user?.id && profile) {
      await Promise.all([
        loadAnnouncements(profile.id, true),
        loadSchedule(currentDate, profile?.role === "admin", true),
        loadUpcomingSchedule(profile.id),
        loadSwaps()
      ])
    }
  }, [user?.id, profile, currentDate, loadAnnouncements, loadSchedule, loadUpcomingSchedule, loadSwaps])

  // Pull to Refresh
  const handleRefreshAll = useCallback(async () => {
    if (user?.id && profile) {
      await Promise.all([
        loadAnnouncements(profile.id, true),
        loadSchedule(currentDate, profile?.role === "admin", true),
        loadUpcomingSchedule(profile.id),
        loadSwaps(),
        loadBirthdays()
      ])
    }
  }, [user?.id, profile, currentDate, loadAnnouncements, loadSchedule, loadUpcomingSchedule, loadSwaps, loadBirthdays])

  const { isRefreshing, pullDistance } = usePullToRefresh(handleRefreshAll)
  
  // Lógica de Redirecionamento e Onboarding
  useEffect(() => {
    if (loading) return

    console.log("[Page] Redirection check:", { 
      userId: user?.id, 
      isActive, 
      hasProfile: !!profile, 
      loading 
    })

    if (user) {
      if (!isActive) {
        // 1. Usuário logado mas não vinculado a nenhum perfil
        console.log("[Page] Redirecionando para /bemvindo (não ativo)")
        router.push("/bemvindo")
      } else if (profile) {
        // 2. Tem perfil, mas verificar se está completo (Data Nasc + Missa Preferencial)
        const hasBirthDate = !!profile.birthDate
        const hasPreferences = (profile.preferences?.day_preferences?.[6]?.length || 0) > 0
        
        if (!hasBirthDate || !hasPreferences) {
          console.log("[Page] Redirecionando para /perfil (perfil incompleto)")
          router.push("/perfil")
        }
      }
    }
  }, [user, isActive, profile, loading, router])

  const handlePrevMonth = () => setCurrentDate(subMonths(currentDate, 1))
  const handleNextMonth = () => setCurrentDate(addMonths(currentDate, 1))

  const monthName = isValid(currentDate) ? format(currentDate, "MMMM yyyy", { locale: ptBR }) : "Data Inválida"

  const handlePublish = async () => {
    try {
      setIsPublishing(true)
      const monthRef = format(currentDate, "yyyy-MM")
      await publishMonth(monthRef)
      toast.success("Escala publicada e notificações enviadas!")
      triggerRefresh()
    } catch (error) {
      toast.error("Erro ao publicar escala.")
    } finally {
      setIsPublishing(false)
    }
  }

  // Lógica de Scroll Pendente (para navegação entre meses)
  useEffect(() => {
    if (pendingScrollSlotId.current && !isLoadingSchedule) {
      const slotId = pendingScrollSlotId.current
      // Pequeno timeout para garantir que o DOM renderizou
      const timer = setTimeout(() => {
        const element = document.getElementById(`slot-${slotId}`)
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' })
          element.classList.add('ring-4', 'ring-emerald-500', 'ring-offset-1', 'transition-all', 'duration-500')
          setTimeout(() => {
            element.classList.remove('ring-4', 'ring-emerald-500', 'ring-offset-1')
          }, 3000)
          pendingScrollSlotId.current = null
        }
      }, 300)
      return () => clearTimeout(timer)
    }
  }, [schedule, isLoadingSchedule])

  const handleNavigateToSlot = useCallback((slotId: string, dateStr: string) => {
    const slotDate = parseISO(dateStr)
    const isDifferentMonth = format(slotDate, 'yyyy-MM') !== format(currentDate, 'yyyy-MM')

    if (isDifferentMonth) {
      pendingScrollSlotId.current = slotId
      setCurrentDate(slotDate)
    } else {
      // Se for o mesmo mês, rola direto
      const element = document.getElementById(`slot-${slotId}`)
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' })
        element.classList.add('ring-4', 'ring-emerald-500', 'ring-offset-1', 'transition-all', 'duration-500')
        setTimeout(() => {
          element.classList.remove('ring-4', 'ring-emerald-500', 'ring-offset-1')
        }, 3000)
      }
    }
  }, [currentDate])
  
  const handleShareSchedule = useCallback(() => {
    if (schedule.length === 0) {
      toast.error("Não há escala para compartilhar neste mês.")
      return
    }

    // Agrupar e ordenar como na renderização
    const grouped = schedule.reduce((acc: any, item: any) => {
      const dateKey = item.date;
      if (!acc[dateKey]) {
        acc[dateKey] = {
          date: dateKey,
          items: []
        }
      }
      acc[dateKey].items.push(item)
      return acc
    }, {})

    const sortedDays = Object.values(grouped).sort((a: any, b: any) => {
      const dateA = new Date(a.date + 'T00:00:00');
      const dateB = new Date(b.date + 'T00:00:00');
      return (isValid(dateA) ? dateA.getTime() : 0) - (isValid(dateB) ? dateB.getTime() : 0);
    })

    const roleWeights: Record<string, number> = {
      'C': 1,
      '1L': 2,
      'L': 2,
      '2L': 3,
      'P': 4
    }

    let shareText = `*Escala de Leitores - ${format(currentDate, "MMMM/yyyy", { locale: ptBR })}*\n\n`

    sortedDays.forEach((day: any) => {
      const dateStr = isValid(new Date(day.date + 'T00:00:00'))
        ? format(new Date(day.date + 'T00:00:00'), "EEEE - dd/MM", { locale: ptBR })
        : "Data Inválida"
      
      shareText += `*${dateStr}*\n`

      day.items.forEach((mass: any) => {
        shareText += `${mass.time.substring(0, 5)} - ${mass.specialDescription || "Missa"}\n`
        
        const sortedSlots = [...mass.slots].sort((a: any, b: any) => 
          (roleWeights[a.role] || 99) - (roleWeights[b.role] || 99)
        )

        sortedSlots.forEach((slot: any) => {
          shareText += `${slot.role} - ${slot.readerName || "---"}\n`
        })
        shareText += `\n`
      })
    })

    const encodedText = encodeURIComponent(shareText)
    const whatsappUrl = `https://wa.me/?text=${encodedText}`
    
    window.open(whatsappUrl, '_blank')
  }, [schedule, currentDate])

  const handleShareSwap = useCallback((swap: any) => {
    const massDate = new Date(swap.mass.date + 'T00:00:00');
    const dia = format(massDate, "dd/MM (EEEE)", { locale: ptBR });
    const horario = swap.mass.time.substring(0, 5);
    const papel = roleLabel(swap.role);
    const shareLink = `${window.location.origin}/#slot-${swap.id}`;
    
    const text = `Infelizmente não vou poder ler ${dia} às ${horario} - ${papel}. Alguém poderia trocar comigo?\n\nVeja no aplicativo: ${shareLink}`;
    
    const encodedText = encodeURIComponent(text);
    const whatsappUrl = `https://wa.me/?text=${encodedText}`;
    
    const opened = window.open(whatsappUrl, '_blank');
    return !!opened;
  }, [])

  // Lógica de Scroll para Recado via Hash (#ann-ID) ou Slot (#slot-ID)
  useEffect(() => {
    if (isHydrated && !isLoadingAnnouncements && !isLoadingSchedule) {
      const hash = window.location.hash
      if (!hash || hash === processedHashRef.current) return

      // Marcar como processado e limpar da URL
      processedHashRef.current = hash
      router.replace("/", { scroll: false })

      if (hash.startsWith('#ann-')) {
        const id = hash.replace('#ann-', '')
        if (announcements.some(a => a.id === id && a.isRead)) setIsReadGroupOpen(true)
        const timer = setTimeout(() => {
          const el = document.getElementById(`ann-${id}`)
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' })
            el.classList.add('ring-4', 'ring-lime-400', 'bg-lime-300', 'ring-offset-1', 'transition-all', 'duration-500')
            setTimeout(() => {
              el.classList.remove('ring-4', 'ring-lime-400', 'bg-lime-300', 'ring-offset-1')
            }, 5000)
          }
        }, 800)
        return () => clearTimeout(timer)
      }

      if (hash.startsWith('#slot-')) {
        const id = hash.replace('#slot-', '')
        const timer = setTimeout(() => {
          const el = document.getElementById(`slot-${id}`)
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' })
            el.classList.add('ring-4', 'ring-amber-500', 'ring-offset-1', 'transition-all', 'duration-500')
            setTimeout(() => {
              el.classList.remove('ring-4', 'ring-amber-500', 'ring-offset-1')
            }, 3000)
          }
        }, 1000)
        return () => clearTimeout(timer)
      }
    }
  }, [isHydrated, isLoadingAnnouncements, isLoadingSchedule])


  useEffect(() => {
    if (user?.id && isActive && profileId) {
      loadAnnouncements(profileId)
      loadSchedule(currentDate, isAdminRole)
      loadUpcomingSchedule(profileId)
      loadSwaps()
      loadBirthdays()
    }
  }, [user?.id, profileId, isAdminRole, isActive, loadAnnouncements, loadSchedule, loadUpcomingSchedule, loadSwaps, loadBirthdays, currentDate])

  // Recarregar dados ao focar na janela (volta ao PWA ou aba)
  useEffect(() => {
    const handleFocus = () => {
      // No máximo uma atualização por minuto ao voltar para a aba
      if (Date.now() - lastFocusReloadAt.current < 60_000) return
      if (user?.id && isActive && profileId) {
        lastFocusReloadAt.current = Date.now()
        loadAnnouncements(profileId, true)
        loadSchedule(currentDate, isAdminRole, true)
        loadSwaps()
      }
    }
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [user?.id, isActive, profileId, isAdminRole, currentDate, loadAnnouncements, loadSchedule, loadSwaps])

  // Garantir que a página comece no topo absoluto ao carregar
  useEffect(() => {
    if (!loading) {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' as any })
      const mainContainer = document.querySelector('.overflow-y-auto')
      if (mainContainer) {
        mainContainer.scrollTop = 0
      }
    }
  }, [loading])


  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-stone-50">
        <Loader2 className="h-8 w-8 animate-spin text-stone-300" />
      </div>
    )
  }

  const handleConfirmSlot = async (slotId: string) => {
    if (!profile) return
    try {
      await confirmSlot(slotId, profile.id)
      toast.success("Presença confirmada!")
      triggerRefresh()
    } catch {
      toast.error("Erro ao confirmar.")
    }
  }

  const handleOpenSwapRequest = (slotId: string) => {
    let targetMass: any = null
    let targetSlot: any = null
    schedule.forEach(mass => {
      const found = mass.slots.find((sl: any) => sl.id === slotId)
      if (found) {
        targetMass = mass
        targetSlot = found
      }
    })
    if (targetMass && targetSlot) {
      const d = new Date(targetMass.date + 'T00:00:00')
      setSwapTargetSlot({
        id: slotId,
        role: targetSlot.role,
        roleName: roleLabel(targetSlot.role),
        massDate: format(d, "dd/MM"),
        dateLabel: `${format(d, "EEEE", { locale: ptBR }).slice(0, 3)}, ${format(d, "dd/MM")}`,
        rawMassDate: targetMass.date,
        massTime: targetMass.time.substring(0, 5),
        rawMassTime: targetMass.time,
        description: targetMass.specialDescription || "Missa"
      })
    }
  }

  const handleCancelSwapSlot = async (slotId: string) => {
    try {
      await cancelSwap(slotId)
      toast.success("Pedido de troca cancelado!")
      triggerRefresh()
    } catch {
      toast.error("Erro ao cancelar troca.")
    }
  }

  const handleTakeSwapSlot = (slotId: string) => {
    if (!user) return
    let targetMass: any = null
    let targetSlot: any = null
    schedule.forEach(mass => {
      const found = mass.slots.find((sl: any) => sl.id === slotId)
      if (found) {
        targetMass = mass
        targetSlot = found
      }
    })
    if (targetMass && targetSlot) {
      setTakeSwapTarget(buildTakeSwapTarget(slotId, targetMass.date, targetMass.time, targetSlot.role, targetMass.specialDescription))
    }
  }

  const buildTakeSwapTarget = (slotId: string, date: string, time: string, role: string, description?: string) => {
    const d = new Date(date + 'T00:00:00')
    return {
      slotId,
      dateLabel: isValid(d) ? `${format(d, "EEEE", { locale: ptBR }).slice(0, 3)}, ${format(d, "dd/MM")}` : "--/--",
      time: time.substring(0, 5),
      roleName: roleLabel(role),
      description: description || "Missa",
    }
  }

  const handleConfirmPending = async (slotIds: string[]) => {
    if (!profile || slotIds.length === 0) return
    setIsConfirmingPending(true)
    try {
      for (const id of slotIds) {
        await confirmSlot(id, profile.id)
      }
      toast.success(slotIds.length === 1 ? "Presença confirmada!" : "Presenças confirmadas!")
    } catch {
      toast.error("Erro ao confirmar. Tente novamente.")
    } finally {
      await triggerRefresh()
      setIsConfirmingPending(false)
    }
  }

  // Recados já lidos (só vale para quem está logado) ficam agrupados; os não lidos ganham destaque
  const isReadByMe = (ann: any) => !!user && !!ann.isRead
  const unreadAnnouncements = announcements.filter((a: any) => !isReadByMe(a))
  const readAnnouncements = announcements.filter(isReadByMe)

  const renderAnnouncement = (ann: any) => (
                  <AnnouncementCard
      key={ann.id}
      {...ann}
      createdAt={ann.createdAt}
      authorId={ann.createdBy}
      currentUserId={profile?.id}
      isAdmin={profile?.role === "admin"}
      isLoggedIn={!!user}
      onRead={async (id) => {
        if (!profile) {
          toast.error("Faça login para marcar como lido.")
          return
        }
        try {
          await markAsRead(id, profile.id)
          await loadAnnouncements(profile.id, true)
        } catch (error) {
          console.error(error)
        }
      }}
      onUpdate={async (id, data) => {
        try {
          await updateAnnouncement(id, data)
          toast.success("Aviso atualizado!")
          if (profile) await loadAnnouncements(profile.id, true)
        } catch (error) {
          toast.error("Erro ao atualizar aviso.")
        }
      }}
      onDelete={(id) => setAnnouncementToDelete(id)}
      onEdit={(ann) => {
        setAnnouncementToEdit(ann)
        setIsFormOpen(true)
      }}
      onAcceptSwap={async (slotId) => {
        if (!user) {
          toast.error("Faça login para aceitar trocas.")
          return
        }

        // Buscar detalhes da troca na lista global de swaps
        const swap = swaps.find(s => s.id === slotId);

        if (swap && swap.mass) {
          setTakeSwapTarget(buildTakeSwapTarget(slotId, swap.mass.date, swap.mass.time, swap.role, swap.mass.specialDescription));
        }
      }}
    />
  )

  return (
    <div className="flex min-h-screen flex-col relative">
      {/* Camada de Background Isolada (Festa Junina em Junho + Fundo da Página) */}
      <div className="fixed inset-0 z-0 pointer-events-none" style={{ isolation: 'isolate' }}>
        <div className="absolute inset-0 bg-stone-50/30" />
        {new Date().getMonth() === 5 && (
          <div 
            className="absolute inset-0 opacity-15"
            style={{
              backgroundImage: "url('/bandeirinhas.webp')",
              backgroundSize: "cover",
              backgroundPosition: "center",
              backgroundRepeat: "no-repeat",
              mixBlendMode: "multiply"
            }}
          />
        )}
      </div>
      
      {/* Indicador de Pull to Refresh */}
      <div 
        className="absolute left-0 right-0 flex justify-center pointer-events-none z-50 overflow-hidden"
        style={{ 
          height: `${pullDistance}px`, 
          top: '0',
          opacity: pullDistance > 20 ? 1 : 0,
          transition: isRefreshing ? 'none' : 'height 0.2s ease, opacity 0.2s ease'
        }}
      >
        <div className="bg-white rounded-full p-2 shadow-lg border border-stone-100 mt-2">
          <Loader2 className={cn("h-5 w-5 text-amber-600", isRefreshing && "animate-spin")} />
        </div>
      </div>

      <main className="relative z-10 flex-1 overflow-hidden flex flex-col">
        {/* Tarja de Próxima Escala (Colada ao Header) */}
        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-8 pb-20">
          {user && profile && (
            <div className="-mx-4 -mt-6 animate-in fade-in slide-in-from-top-4 duration-500">
              <MyScheduleWidget
                schedule={upcomingSchedule}
                profileId={profile.id}
                userName={profile?.fullName}
                userAvatar={profile?.avatarUrl}
                onNavigateToSlot={handleNavigateToSlot}
                onConfirm={handleConfirmSlot}
                onRequestSwap={handleOpenSwapRequest}
                onCancelSwap={handleCancelSwapSlot}
              />
            </div>
          )}
          
          {/* Precisam de você: pedidos de troca abertos */}
          {sortedSwaps.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-baseline justify-between gap-3 px-1">
                <h2 className="text-xl font-black tracking-tight text-stone-800">Precisam de você</h2>
                <span className="text-sm text-[#6B5D50]">
                  {sortedSwaps.length === 1 ? "1 troca aberta" : `${sortedSwaps.length} trocas abertas`}
                </span>
              </div>
              <ul className="space-y-3">
                {sortedSwaps.map((swap) => {
                  const massDate = new Date(swap.mass.date + 'T00:00:00')
                  const isMine = swap.profileId === profile?.id
                  const requesterName = swap.profile?.fullName || "---"
                  const weekday = isValid(massDate) ? format(massDate, "EEEE", { locale: ptBR }) : ""
                  const when = isValid(massDate)
                    ? `${weekday.charAt(0).toUpperCase()}${weekday.slice(1, 3)}, ${format(massDate, "dd/MM")}`
                    : "--/--"

                  return (
                    <li
                      key={swap.id}
                      className="flex items-center gap-3 rounded-[20px] border border-[#E9DFCB] bg-white p-3 shadow-[0_2px_10px_rgba(50,33,19,0.05)]"
                    >
                      <button
                        type="button"
                        onClick={() => handleNavigateToSlot(swap.id, swap.mass.date)}
                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                        aria-label="Ver este pedido na escala"
                      >
                        <UserAvatar
                          name={requesterName}
                          src={swap.profile?.avatarUrl}
                          isClaimed={!!swap.profile?.authUserId}
                          className="h-11 w-11 shrink-0"
                        />
                        <span className="flex min-w-0 flex-col gap-0.5">
                          <span className="text-[15px] font-extrabold leading-tight text-black">
                            {when} · {swap.mass?.time?.substring(0, 5) || "--:--"}
                          </span>
                          <span className="text-[13px] leading-snug text-[#6B5D50]">
                            {roleLabel(swap.role, true)} · {isMine ? "seu pedido" : `pedido de ${requesterName}`}
                          </span>
                        </span>
                      </button>
                      {isMine ? (
                        <button
                          type="button"
                          onClick={() => handleShareSwap(swap)}
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#E6F2EA] text-emerald-700 transition-colors active:bg-emerald-100"
                          title="Avisar no WhatsApp"
                          aria-label="Avisar no WhatsApp"
                        >
                          <Share2 className="h-5 w-5" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleTakeSwapSlot(swap.id)}
                          className="h-11 shrink-0 rounded-xl bg-[#E8B21E] px-4 text-[15px] font-extrabold text-[#241A10] shadow-sm transition-all active:scale-95"
                        >
                          Assumir
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            </section>
          )}

          {/* Sessão 1: Mural de Recados (oculto quando não há recados; admin mantém o botão de adicionar) */}
          {(announcements.length > 0 || profile?.role === "admin") && (
          <section className="space-y-4">
            {announcements.length > 0 && <SectionTitle>Mural de Recados</SectionTitle>}
            
            <div className="space-y-2">
              {announcements.length === 0 ? null : (
                <>
                  {unreadAnnouncements.map(renderAnnouncement)}
                  {readAnnouncements.length >= 2 ? (
                    <ReadAnnouncementsGroup
                      count={readAnnouncements.length}
                      open={isReadGroupOpen}
                      onOpenChange={setIsReadGroupOpen}
                    >
                      {readAnnouncements.map(renderAnnouncement)}
                    </ReadAnnouncementsGroup>
                  ) : (
                    readAnnouncements.map(renderAnnouncement)
                  )}
                </>
              )}
            </div>

            {profile?.role === "admin" && (
              <div className="pt-2">
                <Sheet open={isHydrated && isFormOpen} modal={false} onOpenChange={(open) => {
                  setIsFormOpen(open);
                  if (!open) setAnnouncementToEdit(null);
                }}>
                  <SheetTrigger render={
                      <Button 
                        variant="outline" 
                        className="w-full h-12 border-dashed border-stone-400 text-stone-500 hover:text-amber-800 hover:border-amber-400 hover:bg-amber-50 rounded-2xl group transition-all font-bold text-xs"
                        onClick={() => setAnnouncementToEdit(null)}
                      >
                        <Plus className="mr-2 h-4 w-4 group-hover:scale-110 transition-transform" />
                        Adicionar Recado
                      </Button>
                  } />
                  <SheetContent side="right" className="w-full sm:max-w-lg border-l-stone-100 p-6 overflow-y-auto">
                    <SheetHeader>
                      <SheetTitle className="text-stone-800 uppercase tracking-tighter font-black text-xl mb-4">
                        {announcementToEdit ? "Editar Aviso" : "Novo Aviso"}
                      </SheetTitle>
                    </SheetHeader>
                    <AnnouncementForm 
                      initialData={announcementToEdit}
                      onSave={async (data) => {
                        try {
                          if (data.id) {
                            // Atualização
                            await updateAnnouncement(data.id, {
                              ...data,
                              expiresAt: data.expiresAt ? data.expiresAt.toISOString() : undefined
                            })
                            toast.success("Aviso atualizado!")
                          } else {
                            // Criação
                            await createAnnouncement({ 
                              ...data, 
                              type: 'Aviso',
                              expiresAt: data.expiresAt ? data.expiresAt.toISOString() : undefined
                            })
                            toast.success("Aviso publicado com sucesso!")
                          }
                          triggerRefresh()
                          setIsFormOpen(false)
                          setAnnouncementToEdit(null)
                        } catch (error) {
                          toast.error("Erro ao salvar aviso. Tente novamente.")
                          throw error
                        }
                      }}
                      onClose={() => {
                        setIsFormOpen(false)
                        setAnnouncementToEdit(null)
                      }}
                    />
                  </SheetContent>
                </Sheet>
              </div>
            )}
          </section>
          )}

          {/* Drawer de Confirmação de Exclusão */}
          <Drawer open={!!announcementToDelete} onOpenChange={(open) => !open && setAnnouncementToDelete(null)}>
            <DrawerContent>
              <div className="mx-auto w-full max-w-sm">
                <DrawerHeader className="text-center">
                  <DrawerTitle className="text-stone-800">Excluir Recado?</DrawerTitle>
                  <DrawerDescription>
                    Esta ação não pode ser desfeita. O aviso será removido permanentemente.
                  </DrawerDescription>
                </DrawerHeader>
                <DrawerFooter className="flex flex-col gap-2 pb-8">
                  <Button 
                    variant="destructive" 
                    className="w-full font-bold h-12 rounded-xl"
                    disabled={isDeleting}
                    onClick={async () => {
                      if (!announcementToDelete) return
                      setIsDeleting(true)
                      try {
                        await deleteAnnouncement(announcementToDelete)
                        toast.success("Aviso excluído.")
                        triggerRefresh()
                        setAnnouncementToDelete(null)
                      } catch (error) {
                        toast.error("Erro ao excluir.")
                      } finally {
                        setIsDeleting(false)
                      }
                    }}
                  >
                    {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Apagar"}
                  </Button>
                  <DrawerClose asChild>
                    <Button variant="ghost" className="w-full text-stone-500 font-medium h-12">
                      Cancelar
                    </Button>
                  </DrawerClose>
                </DrawerFooter>
              </div>
            </DrawerContent>
          </Drawer>

          {/* Seção: Aniversariantes do Mês */}
          <section>
            <BirthdayCard 
              currentMonth={currentDate}
              members={allBirthdays.filter(m => {
                if (!m.birthDate) return false
                const birthMonth = new Date(m.birthDate).getUTCMonth()
                return birthMonth === currentDate.getMonth()
              }).map(m => ({
                id: m.id,
                fullName: m.fullName,
                birthDate: m.birthDate,
                avatarUrl: m.avatarUrl ?? undefined,
                isClaimed: !!m.isActive
              }))}
            />
          </section>

          {/* Sessão Interativa: Seletor de Mês */}
          <section className="flex flex-col items-center gap-4 py-2">
            <div className="grid w-full grid-cols-[44px_1fr_44px] items-center">
              <div className="flex justify-start">
                {profile?.role === "admin" && (
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-11 w-11 rounded-full bg-white text-emerald-700 border-2 border-emerald-600 shadow-sm hover:bg-emerald-50 transition-all active:scale-95"
                    onClick={handleShareSchedule}
                    title="Compartilhar no WhatsApp"
                    aria-label="Compartilhar escala no WhatsApp"
                  >
                    <Share2 className="h-5 w-5" strokeWidth={2.5} />
                  </Button>
                )}
              </div>

              <SectionTitle>Escala de Leitores</SectionTitle>

              <div className="flex justify-end">
                {user && (
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-11 w-11 rounded-full bg-white text-[#A23F06] border-2 border-[#A23F06] shadow-sm hover:bg-[#FDEBDD] hover:text-[#A23F06] transition-all active:scale-95"
                    onClick={() => setIsUnavailableDrawerOpen(true)}
                    title="Meus Dias Indisponíveis"
                    aria-label="Meus dias indisponíveis"
                  >
                    <Plane className="h-5 w-5" strokeWidth={2.5} />
                  </Button>
                )}
              </div>
            </div>


            <div className="flex items-center justify-between w-full bg-white rounded-full border border-[#E9DFCB] px-1.5 py-1 shadow-sm">
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-11 w-11 rounded-full text-stone-500 hover:text-stone-900"
                aria-label="Mês anterior"
                onClick={handlePrevMonth}
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
              
              <span className="text-sm font-bold text-stone-800 capitalize tracking-tight">
                {monthName}
              </span>

              <Button 
                variant="ghost" 
                size="icon" 
                className="h-11 w-11 rounded-full text-stone-500 hover:text-stone-900"
                aria-label="Próximo mês"
                onClick={handleNextMonth}
              >
                <ChevronRight className="h-5 w-5" />
              </Button>
            </div>

            {profile?.role === "admin" && (
              <div className="w-full">
                <Sheet open={isScheduleSheetOpen} onOpenChange={setIsScheduleSheetOpen}>
                  <SheetTrigger render={
                    <Button 
                      variant="outline" 
                      className="w-full h-12 border-dashed border-stone-400 text-stone-500 hover:text-amber-800 hover:border-amber-400 hover:bg-amber-50 rounded-2xl group transition-all font-bold text-xs"
                    >
                      <Plus className="mr-2 h-4 w-4 group-hover:scale-110 transition-transform" />
                      Adicionar Dia
                    </Button>
                  } />
                  <SheetContent side="right" showCloseButton={false} className="w-full data-[side=right]:w-full sm:max-w-lg data-[side=right]:sm:max-w-lg border-l-stone-100 bg-[#FAF5E6] p-0 flex flex-col gap-0">
                    <div className="flex shrink-0 items-start justify-between rounded-b-[28px] bg-[#322113] pb-5 pl-5 pr-4 pt-5">
                      <SheetHeader className="gap-1 p-0">
                        <span className="text-[11px] font-bold tracking-[0.12em] text-[#E8C76A]">
                          {scheduleToEdit ? "EDITAR ESCALA" : "NOVA ESCALA"}
                        </span>
                        <SheetTitle className="text-[26px] font-extrabold capitalize leading-tight tracking-tight text-[#FFF8E8]">
                          {scheduleToEdit && scheduleToEdit[0]?.date && isValid(new Date(scheduleToEdit[0].date + 'T00:00:00'))
                            ? format(new Date(scheduleToEdit[0].date + 'T00:00:00'), "d 'de' MMMM", { locale: ptBR })
                            : format(currentDate, "MMMM yyyy", { locale: ptBR })}
                        </SheetTitle>
                      </SheetHeader>
                      <SheetClose
                        render={
                          <button
                            type="button"
                            aria-label="Fechar"
                            className="flex h-11 w-11 items-center justify-center rounded-full bg-[#FFF8E8]/15 text-[#FFF8E8] transition-colors hover:bg-[#FFF8E8]/25"
                          />
                        }
                      >
                        <X className="h-5 w-5" strokeWidth={2.2} />
                      </SheetClose>
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <ScheduleForm 
                        currentMonth={currentDate}
                        initialData={scheduleToEdit}
                        onEditExisting={(d) => {
                          const items = schedule.filter((i: any) => i.date === d)
                          if (items.length > 0) setScheduleToEdit(items)
                        }}
                        onSuccess={async () => {
                          await loadSchedule(currentDate, profile?.role === "admin", true)
                        }}
                        onClose={() => {
                          setIsScheduleSheetOpen(false)
                          setScheduleToEdit(null)
                        }}
                      />
                    </div>
                  </SheetContent>
                </Sheet>
              </div>
            )}
          </section>

          {/* Sessão 2: Escala do Mês */}
          <section className="space-y-4">
            <div className="space-y-4">
              {isLoadingSchedule ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-stone-300" />
                </div>
              ) : schedule.length === 0 ? (
                <p className="text-center text-xs text-stone-400 py-10">Não há missas cadastradas para este mês.</p>
              ) : (
                (() => {
                  const grouped = schedule.reduce((acc: any, item: any) => {
                    const dateKey = item.date;
                    if (!acc[dateKey]) {
                      acc[dateKey] = {
                        date: dateKey,
                        items: []
                      }
                    }
                    acc[dateKey].items.push(item)
                    return acc
                  }, {})

                  const sortedDays = Object.values(grouped).sort((a: any, b: any) => {
                    const dateA = new Date(a.date + 'T00:00:00');
                    const dateB = new Date(b.date + 'T00:00:00');
                    return (isValid(dateA) ? dateA.getTime() : 0) - (isValid(dateB) ? dateB.getTime() : 0);
                  })

                  // Pesos para ordenação litúrgica
                  const roleWeights: Record<string, number> = {
                    'C': 1,
                    '1L': 2,
                    'L': 2,
                    '2L': 3,
                    'P': 4
                  }

                  const renderDay = (day: any) => (
                    <ScheduleCard 
                      key={day.date} 
                       date={isValid(new Date(day.date + 'T00:00:00'))
                        ? format(new Date(day.date + 'T00:00:00'), "EEEE, dd/MM", { locale: ptBR })
                        : "Data Inválida"}
                      rawDate={isValid(new Date(day.date + 'T00:00:00')) ? new Date(day.date + 'T00:00:00') : new Date()}
                      items={day.items.map((item: any) => ({
                        id: item.id,
                        time: item.time.substring(0, 5),
                        specialTitle: item.specialDescription,
                        liturgicalColor: item.liturgicalColor,
                        slots: [...item.slots].sort((a: any, b: any) => 
                          (roleWeights[a.role] || 99) - (roleWeights[b.role] || 99)
                        ).map((s: any) => ({
                          id: s.id,
                          role: s.role,
                          roleName: roleLabel(s.role),
                          readerName: s.readerName,
                          readerArchived: !!s.profile?.archivedAt,
                          previousAssignments: s.previousAssignments,
                          avatarUrl: s.avatarUrl,
                          originalReaderName: s.originalProfile?.fullName,
                          originalReaderArchived: !!s.originalProfile?.archivedAt,
                          isConfirmed: s.isConfirmed,
                          isSwapRequested: s.isSwapRequested,
                          isClaimed: s.isClaimed,
                          isMine: s.profileId === profile?.id
                        }))
                      }))}
                      isAdmin={profile?.role === "admin"}
                      isPublished={day.items.every((i: any) => i.isPublished)}
                      onEdit={() => {
                        setScheduleToEdit(day.items) // Passa o array de missas do dia
                        setIsScheduleSheetOpen(true)
                      }}
                      onDelete={() => {
                        setScheduleToDelete(day.items.map((item: any) => item.id))
                      }}
                      onTogglePublish={async (isPublished) => {
                        try {
                          const massIds = day.items.map((item: any) => item.id)
                          await updateMassesStatus(massIds, isPublished)
                          toast.success(isPublished ? "Escala publicada!" : "Escala movida para rascunho")
                          triggerRefresh()
                        } catch (error) {
                          console.error("Erro detalhado ao alterar status:", error)
                          toast.error("Erro ao alterar status.")
                        }
                      }}
                      onConfirm={handleConfirmSlot}
                      onRequestSwap={handleOpenSwapRequest}
                      onCancelSwap={handleCancelSwapSlot}
                      onTakeSwap={handleTakeSwapSlot}
                    />
                  )

                  const todayStart = startOfDay(new Date())
                  const isPastDay = (day: any) => {
                    const d = new Date(day.date + 'T00:00:00')
                    return isValid(d) && d < todayStart
                  }
                  const pastDays = sortedDays.filter(isPastDay)
                  const upcomingDays = sortedDays.filter((d: any) => !isPastDay(d))

                  let pastRange = ""
                  if (pastDays.length > 0) {
                    const first = new Date((pastDays[0] as any).date + 'T00:00:00')
                    const last = new Date((pastDays[pastDays.length - 1] as any).date + 'T00:00:00')
                    pastRange = pastDays.length === 1
                      ? format(first, "d MMM", { locale: ptBR }).replace(".", "")
                      : `${format(first, "d", { locale: ptBR })} a ${format(last, "d MMM", { locale: ptBR }).replace(".", "")}`
                  }

                  return (
                    <>
                      {pastDays.length > 0 && (
                        <PastDaysGroup
                          massesCount={pastDays.reduce((n: number, d: any) => n + d.items.length, 0)}
                          rangeLabel={pastRange}
                        >
                          {pastDays.map(renderDay)}
                        </PastDaysGroup>
                      )}
                      {upcomingDays.map(renderDay)}
                    </>
                  )
                })()
              )}
            </div>
          </section>

          {/* Drawer de Confirmação de Exclusão de Escala */}
          <Drawer open={!!scheduleToDelete} onOpenChange={(open) => !open && setScheduleToDelete(null)}>
            <DrawerContent>
              <div className="mx-auto w-full max-w-sm">
                <DrawerHeader className="text-center">
                  <DrawerTitle className="text-stone-800">Excluir Missa da Escala?</DrawerTitle>
                  <DrawerDescription>
                    Esta ação removerá a missa e todos os leitores escalados para este dia.
                  </DrawerDescription>
                </DrawerHeader>
                <DrawerFooter className="flex flex-col gap-2 pb-8">
                  <Button 
                    variant="destructive" 
                    className="w-full font-bold h-12 rounded-xl"
                    disabled={isDeletingSchedule}
                    onClick={async () => {
                      if (!scheduleToDelete) return
                      setIsDeletingSchedule(true)
                      try {
                        // Exclui todos os horários vinculados ao card (dia)
                        await deleteMasses(scheduleToDelete)
                        toast.success("Dia removido da escala.")
                        triggerRefresh()
                        setScheduleToDelete(null)
                      } catch (error) {
                        toast.error(scheduleErrorMessage(error, "Erro ao excluir horários do dia."))
                      } finally {
                        setIsDeletingSchedule(false)
                      }
                    }}
                  >
                    {isDeletingSchedule ? <Loader2 className="h-4 w-4 animate-spin" /> : "Apagar"}
                  </Button>
                  <DrawerClose asChild>
                    <Button variant="ghost" className="w-full text-stone-500 font-medium h-12">
                      Cancelar
                    </Button>
                  </DrawerClose>
                </DrawerFooter>
              </div>
            </DrawerContent>
          </Drawer>

          {/* Drawer de Pedido de Troca (um passo) */}
          <Drawer open={!!swapTargetSlot} onOpenChange={(open) => !open && !isRequestingSwap && setSwapTargetSlot(null)}>
            <DrawerContent>
              <div className="mx-auto w-full max-w-sm px-4">
                <DrawerHeader className="px-0 text-center">
                  <DrawerTitle className="text-xl font-black text-stone-900">Pedir troca</DrawerTitle>
                  <DrawerDescription>
                    Seu pedido aparece para todos os leitores. Você continua escalado até alguém assumir.
                  </DrawerDescription>
                </DrawerHeader>

                <MassSummaryGrid
                  dateLabel={swapTargetSlot?.dateLabel}
                  time={swapTargetSlot?.massTime}
                  role={swapTargetSlot?.roleName}
                  celebration={swapTargetSlot?.description}
                />

                <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-2xl p-2">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-5 w-5 shrink-0 accent-[#1E6B43]"
                    checked={shareSwapOnRequest}
                    onChange={(e) => setShareSwapOnRequest(e.target.checked)}
                    disabled={isRequestingSwap}
                  />
                  <span className="flex flex-col">
                    <span className="text-sm font-bold text-black">Avisar também no grupo do WhatsApp</span>
                    <span className="text-xs text-[#6B5D50]">Abre o WhatsApp com a mensagem pronta e o link para assumir.</span>
                  </span>
                </label>

                {shareSwapOnRequest && swapTargetSlot && (
                  <div className="mt-1 rounded-2xl rounded-tl-sm bg-[#DCF8C6] px-3 py-2 text-left text-xs leading-snug text-black">
                    Infelizmente não vou poder ler {swapTargetSlot.dateLabel} às {swapTargetSlot.massTime} - {swapTargetSlot.roleName}. Alguém poderia trocar comigo?
                  </div>
                )}

                <DrawerFooter className="flex flex-col gap-2 px-0 pb-8">
                  <Button 
                    variant="default"
                    className="w-full font-bold h-12 rounded-xl bg-[#322113] hover:bg-[#241709] text-white"
                    disabled={isRequestingSwap}
                    onClick={async () => {
                      if (!swapTargetSlot || !user) return
                      const target = swapTargetSlot
                      setIsRequestingSwap(true)
                      try {
                        await requestSwap(target.id)
                        toast.success("Solicitação de troca publicada!")
                        triggerRefresh()
                        setSwapTargetSlot(null)

                        if (shareSwapOnRequest) {
                          const swapData = {
                            id: target.id,
                            role: target.roleName,
                            mass: { date: target.rawMassDate, time: target.rawMassTime }
                          }
                          if (!handleShareSwap(swapData)) {
                            // Popup bloqueado após o await: oferece o envio com um toque
                            toast("Quer avisar no WhatsApp?", {
                              action: { label: "Abrir WhatsApp", onClick: () => { handleShareSwap(swapData) } }
                            })
                          }
                        }
                      } catch (error) {
                        toast.error("Erro ao processar solicitação.")
                      } finally {
                        setIsRequestingSwap(false)
                      }
                    }}
                  >
                    {isRequestingSwap ? <Loader2 className="h-4 w-4 animate-spin" /> : "Publicar pedido"}
                  </Button>
                  <DrawerClose asChild>
                    <Button variant="ghost" className="w-full text-stone-500 font-medium h-12" disabled={isRequestingSwap}>
                      Cancelar
                    </Button>
                  </DrawerClose>
                </DrawerFooter>
              </div>
            </DrawerContent>
          </Drawer>

          {/* Drawer para ASSUMIR uma troca (mesmo padrão do "Pedir troca") */}
          <Drawer open={!!takeSwapTarget} onOpenChange={(open) => !open && !isAcceptingSwap && setTakeSwapTarget(null)}>
            <DrawerContent>
              <div className="mx-auto w-full max-w-sm px-4">
                <DrawerHeader className="px-0 text-center">
                  <DrawerTitle className="text-xl font-black text-stone-900">Assumir escala</DrawerTitle>
                  <DrawerDescription>
                    Ao confirmar, a leitura passa a ser sua e sua presença já fica confirmada.
                  </DrawerDescription>
                </DrawerHeader>

                <MassSummaryGrid
                  dateLabel={takeSwapTarget?.dateLabel}
                  time={takeSwapTarget?.time}
                  role={takeSwapTarget?.roleName}
                  celebration={takeSwapTarget?.description}
                />

                <DrawerFooter className="flex flex-col gap-2 px-0 pb-8">
                  <Button 
                    variant="default"
                    className="w-full font-bold h-12 rounded-xl bg-[#322113] hover:bg-[#241709] text-white"
                    disabled={isAcceptingSwap}
                    onClick={async () => {
                      if (!takeSwapTarget || !profile) return
                      setIsAcceptingSwap(true)
                      try {
                        await acceptSwap(takeSwapTarget.slotId, profile.id)
                        toast.success("Você assumiu a escala! Presença confirmada.")
                        triggerRefresh()
                        setTakeSwapTarget(null)
                      } catch (error) {
                        toast.error("Erro ao assumir troca.")
                      } finally {
                        setIsAcceptingSwap(false)
                      }
                    }}
                  >
                    {isAcceptingSwap ? <Loader2 className="h-4 w-4 animate-spin" /> : "Assumir escala"}
                  </Button>
                  <DrawerClose asChild>
                    <Button variant="ghost" className="w-full text-stone-500 font-medium h-12" disabled={isAcceptingSwap}>
                      Cancelar
                    </Button>
                  </DrawerClose>
                </DrawerFooter>
              </div>
            </DrawerContent>
          </Drawer>

          {/* Drawer de Datas Indisponíveis */}
          <Drawer open={isUnavailableDrawerOpen} onOpenChange={setIsUnavailableDrawerOpen}>
            <DrawerContent>
              <div className="mx-auto w-full max-w-sm px-4 overflow-y-auto max-h-[90vh]">
                <DrawerHeader className="px-0 text-center">
                  <DrawerTitle className="text-xl font-black text-stone-900">Dias indisponíveis</DrawerTitle>
                  <DrawerDescription>
                    Toque nos dias em que você <span className="font-bold text-[#A23F06]">não poderá</span> participar. Salvamos na hora.
                  </DrawerDescription>
                </DrawerHeader>
                {profile && (
                  <UnavailableForm
                    profileId={profile.id}
                    onClose={() => setIsUnavailableDrawerOpen(false)}
                  />
                )}
                <DrawerFooter className="px-0 pb-8">
                  <DrawerClose asChild>
                    <Button variant="default" className="w-full font-bold h-12 rounded-xl bg-[#322113] hover:bg-[#241709] text-white">
                      Concluir
                    </Button>
                  </DrawerClose>
                </DrawerFooter>
              </div>
            </DrawerContent>
          </Drawer>

          {/* Versão do App */}
          <div className="mt-12 mb-8 flex justify-center">
            <span className="text-[10px] font-bold text-[#8A7A66] uppercase tracking-widest">
              Versão {APP_VERSION}
            </span>
          </div>
 
        </div>

        {/* Drawer de confirmação de presença (escalas pendentes), mesmo padrão do "Pedir troca" */}
        <Drawer open={isUnconfirmedAlertOpen} onOpenChange={(open) => !isConfirmingPending && setIsUnconfirmedAlertOpen(open)}>
          <DrawerContent>
            <div className="mx-auto w-full max-w-sm px-4">
              <DrawerHeader className="px-0 text-center">
                <DrawerTitle className="text-xl font-black text-stone-900">Confirme sua presença</DrawerTitle>
                <DrawerDescription>
                  {myUnconfirmedSlots.length === 1
                    ? "Você tem 1 escala aguardando confirmação. A equipe conta com você."
                    : `Você tem ${myUnconfirmedSlots.length} escalas aguardando confirmação. A equipe conta com você.`}
                </DrawerDescription>
              </DrawerHeader>

              <ul className="max-h-[40vh] space-y-2 overflow-y-auto">
                {myUnconfirmedSlots.map((slot) => {
                  const slotDate = new Date(slot.massDate + 'T00:00:00')
                  const valid = isValid(slotDate)
                  const isSunday = valid && slotDate.getDay() === 0
                  const weekday = valid ? format(slotDate, "EEEE", { locale: ptBR }).normalize("NFD").replace(/[\u0300-\u036f]/g, "").slice(0, 3).toUpperCase() : "--"
                  return (
                    <li key={slot.id} className="flex items-center gap-3 rounded-2xl border border-[#E9DFCB] bg-[#FAF5E6] p-2.5">
                      <button
                        type="button"
                        onClick={() => {
                          handleNavigateToSlot(slot.id, slot.massDate)
                          setIsUnconfirmedAlertOpen(false)
                        }}
                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                        aria-label="Ver esta leitura na escala"
                      >
                        <span className={cn(
                          "flex h-[50px] w-11 shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl leading-none",
                          isSunday ? "bg-[#322113] text-[#FFF8E8]" : "border border-[#E9DFCB] bg-white text-[#241A10]"
                        )}>
                          <span className={cn("text-[10px] font-bold tracking-wide", isSunday ? "text-[#E8C76A]" : "text-[#6B5D50]")}>{weekday}</span>
                          <span className="text-lg font-extrabold leading-none">{valid ? format(slotDate, "d") : "--"}</span>
                        </span>
                        <span className="flex min-w-0 flex-col gap-0.5">
                          <span className="text-[15px] font-extrabold leading-tight text-black">
                            {roleLabel(slot.role, true)} · {slot.massTime.substring(0, 5)}
                          </span>
                          {slot.specialDescription && (
                            <span className="truncate text-xs text-[#6B5D50]">{slot.specialDescription}</span>
                          )}
                        </span>
                      </button>
                      {myUnconfirmedSlots.length > 1 && (
                        <button
                          type="button"
                          disabled={isConfirmingPending}
                          onClick={() => handleConfirmPending([slot.id])}
                          className="h-10 shrink-0 rounded-xl bg-[#E8B21E] px-3.5 text-sm font-extrabold text-[#241A10] shadow-sm transition-all active:scale-95 disabled:opacity-60"
                        >
                          Confirmar
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>

              <DrawerFooter className="flex flex-col gap-2 px-0 pb-8">
                <Button
                  variant="default"
                  className="w-full font-bold h-12 rounded-xl bg-[#322113] hover:bg-[#241709] text-white"
                  disabled={isConfirmingPending || myUnconfirmedSlots.length === 0}
                  onClick={() => handleConfirmPending(myUnconfirmedSlots.map((sl) => sl.id))}
                >
                  {isConfirmingPending
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : myUnconfirmedSlots.length > 1 ? `Confirmar todas (${myUnconfirmedSlots.length})` : "Confirmar presença"}
                </Button>
                <DrawerClose asChild>
                  <Button variant="ghost" className="w-full text-stone-500 font-medium h-12" disabled={isConfirmingPending}>
                    Decidir depois
                  </Button>
                </DrawerClose>
              </DrawerFooter>
            </div>
          </DrawerContent>
        </Drawer>

      </main>

      {/* Botões Flutuantes (Fora do scroll para garantir fixação) */}
      {profile?.role === "admin" && schedule.some(mass => !mass.isPublished) && (
        <div className="fixed bottom-6 left-6 z-50 w-[calc(100%-120px)] max-w-[280px]">
          <Button 
            className="w-full h-14 bg-green-600 hover:bg-green-700 text-white rounded-2xl shadow-xl border-t border-white/20 animate-in fade-in slide-in-from-bottom-8 duration-500 flex items-center justify-center gap-3"
            onClick={handlePublish}
            disabled={isPublishing}
          >
            {isPublishing ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <CheckCircle className="h-5 w-5" />
            )}
            <div className="flex flex-col items-start leading-none">
              <span className="text-[9px] font-bold opacity-80 tracking-widest uppercase">Publicar Escala de</span>
              <span className="text-base font-black uppercase">
                {format(currentDate, "MMMM", { locale: ptBR })}
              </span>
            </div>
          </Button>
        </div>
      )}
      
      <Link 
        href="/folheto"
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[#322113] text-white shadow-lg shadow-[#322113]/40 transition-all hover:scale-110 active:scale-95 animate-in fade-in zoom-in duration-500"
        title="Folheto da Missa"
      >
        <FileText className="h-6 w-6 text-[#E8B21E]" />
      </Link>
    </div>
  )
}
