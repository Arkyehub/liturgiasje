"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import { AnnouncementCard } from "@/features/announcements/ui/AnnouncementCard"
import { ScheduleCard } from "@/features/schedule/ui/ScheduleCard"
import { MyScheduleWidget } from "@/features/schedule/ui/MyScheduleWidget"
import { BirthdayCard } from "@/shared/ui/BirthdayCard"
import { Button } from "@/shared/ui/button"
import { ChevronLeft, ChevronRight, Loader2, Plus, RefreshCw, Plane, CheckCircle, FileText } from "lucide-react"
import { addMonths, format, subMonths, isToday, parseISO, isValid } from "date-fns"
import { ptBR } from "date-fns/locale"
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
import { usePullToRefresh } from "@/shared/hooks/usePullToRefresh"
import {
  Sheet,
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
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/ui/avatar"
import { UserAvatar } from "@/shared/ui/UserAvatar"

export default function Home() {
  const { user, profile, member, isMember, loading, signInWithGoogle, signOut } = useAuth()
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
    deleteMass,
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
  const [refreshSignal, setRefreshSignal] = useState(0)

  const triggerRefresh = useCallback(() => {
    // Pequeno delay para garantir que o banco terminou de processar a escrita
    setTimeout(() => {
      setRefreshSignal(prev => prev + 1)
    }, 300)
  }, [])

  // Pull to Refresh
  const handleRefreshAll = useCallback(async () => {
    if (user?.id && isMember) {
      await Promise.all([
        loadAnnouncements(user.id, true),
        loadSchedule(currentDate, profile?.role === "admin", true),
        loadUpcomingSchedule(user.id, member?.id),
        loadSwaps(),
        loadBirthdays()
      ])
      toast.success("Dados atualizados")
    }
  }, [user?.id, isMember, currentDate, profile?.role, member?.id, loadAnnouncements, loadSchedule, loadUpcomingSchedule, loadSwaps, loadBirthdays])

  const { isRefreshing, pullDistance } = usePullToRefresh(handleRefreshAll)
  
  // Lógica de Redirecionamento e Onboarding
  useEffect(() => {
    if (loading) return

    if (user) {
      if (!isMember) {
        // 1. Usuário logado mas não vinculado à lista de membros
        router.push("/bemvindo")
      } else if (profile) {
        // 2. É membro, mas verificar se o perfil está completo (Data Nasc + Missa Preferencial)
        const hasBirthDate = !!profile.birthDate
        const hasPreferences = (profile.preferences?.day_preferences?.[6]?.length || 0) > 0
        
        if (!hasBirthDate || !hasPreferences) {
          router.push("/perfil")
        }
      }
    }
  }, [user, isMember, profile, loading, router])

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
          element.classList.add('ring-4', 'ring-emerald-500', 'ring-offset-2', 'transition-all', 'duration-500')
          setTimeout(() => {
            element.classList.remove('ring-4', 'ring-emerald-500', 'ring-offset-2')
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
        element.classList.add('ring-4', 'ring-emerald-500', 'ring-offset-2', 'transition-all', 'duration-500')
        setTimeout(() => {
          element.classList.remove('ring-4', 'ring-emerald-500', 'ring-offset-2')
        }, 3000)
      }
    }
  }, [currentDate])

  useEffect(() => {
    if (user?.id && isMember) {
      loadAnnouncements(user?.id, refreshSignal > 0)
      loadSchedule(currentDate, profile?.role === "admin", refreshSignal > 0)
      loadUpcomingSchedule(user.id, member?.id)
      loadSwaps()
      loadBirthdays()
    }
  }, [user?.id, member?.id, isMember, loadAnnouncements, loadSchedule, loadUpcomingSchedule, loadSwaps, loadBirthdays, currentDate, profile?.role, refreshSignal])

  // Recarregar dados ao focar na janela (volta ao PWA ou aba)
  useEffect(() => {
    const handleFocus = () => {
      if (user?.id && isMember) {
        loadAnnouncements(user.id, true)
        loadSchedule(currentDate, profile?.role === "admin", true)
        loadSwaps()
      }
    }
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [user?.id, isMember, currentDate, profile?.role, loadAnnouncements, loadSchedule, loadSwaps])


  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-stone-50">
        <Loader2 className="h-8 w-8 animate-spin text-stone-300" />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-stone-50/30 relative">
      
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

      <main className="flex-1 overflow-hidden flex flex-col">
        {/* Tarja de Próxima Escala (Colada ao Header) */}
        {user && (
          <div className="shrink-0 animate-in fade-in slide-in-from-top-4 duration-500 z-40">
            <MyScheduleWidget 
              schedule={upcomingSchedule} 
              userId={user.id} 
              memberId={member?.id}
              userName={profile?.fullName}
              userAvatar={profile?.avatarUrl}
              onNavigateToSlot={handleNavigateToSlot}
            />
          </div>
        )}
        
        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-8 pb-20">
          
          {/* Seção Nova: Solicitações de Troca */}
          {swaps.filter(s => s.mass).length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center gap-2 px-1">
                <RefreshCw className="h-3.5 w-3.5 text-amber-600 animate-spin-slow" />
                <h2 className="text-xl font-black tracking-tight text-amber-600">
                  Solicitações de Troca
                </h2>
              </div>
              <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none snap-x">
                {swaps.filter(s => s.mass).map((swap) => {
                  const massDate = new Date(swap.mass.date + 'T00:00:00');
                  const roleName = (({
                    'C': 'Comentarista',
                    '1L': 'Primeira Leitura',
                    '2L': 'Segunda Leitura',
                    'P': 'Preces',
                    'L': 'Leitura Única'
                  } as Record<string, string>)[swap.role]) || swap.role;

                  const requesterName = swap.reader?.fullName || swap.member?.fullName || "---";
                  const requesterAvatar = swap.reader?.avatarUrl;

                  return (
                    <button
                      key={swap.id}
                      onClick={() => {
                        const mDate = new Date(swap.mass.date + 'T00:00:00');
                        if (!swap.mass || !isValid(mDate)) return;
                        
                        // Navegar para o mês da troca se necessário
                        const swapMonth = mDate.getMonth();
                        const currentMonth = (isValid(currentDate) ? currentDate : new Date()).getMonth();
                        const swapYear = mDate.getFullYear();
                        const currentYear = (isValid(currentDate) ? currentDate : new Date()).getFullYear();

                        if (swapMonth !== currentMonth || swapYear !== currentYear) {
                          setCurrentDate(new Date(swapYear, swapMonth, 1));
                          // Dá um tempo para o React renderizar o novo mês antes de scrolar
                          setTimeout(() => {
                            const el = document.getElementById(`slot-${swap.id}`);
                            el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            el?.classList.add('ring-2', 'ring-amber-400', 'ring-offset-2');
                            setTimeout(() => el?.classList.remove('ring-2', 'ring-amber-400', 'ring-offset-2'), 2000);
                          }, 500);
                        } else {
                          const el = document.getElementById(`slot-${swap.id}`);
                          el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                          el?.classList.add('ring-2', 'ring-amber-400', 'ring-offset-2');
                          setTimeout(() => el?.classList.remove('ring-2', 'ring-amber-400', 'ring-offset-2'), 2000);
                        }
                      }}
                      className="flex-none w-[220px] bg-white border border-amber-100 rounded-2xl p-3 shadow-sm hover:shadow-md transition-all active:scale-95 snap-start text-left"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="bg-amber-100 p-1.5 rounded-lg text-amber-700 shrink-0">
                            <RefreshCw className="h-3.5 w-3.5" />
                          </div>
                          <span className="text-[10px] font-black text-amber-700 uppercase truncate" title={requesterName}>
                            {requesterName}
                          </span>
                        </div>
                        <UserAvatar 
                          name={requesterName}
                          src={requesterAvatar}
                          isClaimed={swap.isClaimed}
                          className="h-6 w-6 shrink-0"
                        />
                      </div>
                      <p className="text-[11px] font-bold text-stone-800 leading-snug">
                        Solicitação para {isValid(massDate) ? format(massDate, "dd/MM (EEEE)", { locale: ptBR }) : "--/--"} às {swap.mass?.time?.substring(0, 5) || '--:--'} - {roleName}
                      </p>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {/* Sessão 1: Mural de Recados */}
          <section className="space-y-4">
            <div className="flex items-center justify-center px-1">
              <h2 className="text-xl font-black tracking-tight text-stone-800 text-center">
                Mural de Recados
              </h2>
            </div>
            
            <div className="space-y-2">
              {isLoadingAnnouncements ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-stone-300" />
                </div>
              ) : announcements.length === 0 ? (
                <p className="text-center text-xs text-stone-400 py-6">Nenhum aviso no momento.</p>
              ) : (
                announcements.map((ann) => (
                  <AnnouncementCard 
                    key={ann.id} 
                    {...ann} 
                    createdAt={ann.createdAt}
                    authorId={ann.createdBy}
                    currentUserId={user?.id}
                    isAdmin={profile?.role === "admin"}
                    isLoggedIn={!!user}
                    onRead={async (id) => {
                      if (!user) {
                        toast.error("Faça login para marcar como lido.")
                        return
                      }
                      try {
                        await markAsRead(id, user.id)
                        await loadAnnouncements(user.id, true)
                      } catch (error) {
                        console.error(error)
                      }
                    }}
                    onUpdate={async (id, data) => {
                      try {
                        await updateAnnouncement(id, data)
                        toast.success("Aviso atualizado!")
                        await loadAnnouncements(user?.id, true)
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
                        setTakeSwapTarget({
                          slotId,
                          date: isValid(new Date(swap.mass.date + 'T00:00:00')) 
                            ? format(new Date(swap.mass.date + 'T00:00:00'), "dd/MM/yyyy")
                            : "--/--/----",
                          time: swap.mass.time.substring(0, 5),
                          roleName: (({
                            'C': 'Comentarista',
                            '1L': '1ª Leitura',
                            '2L': '2ª Leitura',
                            'P': 'Preces',
                            'L': 'Leitura Única'
                          } as Record<string, string>)[swap.role]) || swap.role
                        });
                      }
                    }}
                  />
                ))
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
                isClaimed: true
              }))}
            />
          </section>

          {/* Sessão Interativa: Seletor de Mês */}
          <section className="flex flex-col items-center gap-4 py-2">
            <div className="flex items-center justify-center w-full relative h-8">
              <h2 className="text-xl font-black tracking-tight text-stone-800">
                Escala de Leitores
              </h2>
              {user && (
                <div className="absolute right-0">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-9 w-9 rounded-full bg-white text-red-600 border-2 border-red-600 shadow-sm hover:bg-red-50 hover:text-red-700 transition-all active:scale-95"
                    onClick={() => setIsUnavailableDrawerOpen(true)}
                    title="Meus Dias Indisponíveis"
                  >
                    <Plane className="h-5 w-5" strokeWidth={2.5} />
                  </Button>
                </div>
              )}
            </div>


            <div className="flex items-center justify-between w-full bg-white rounded-full border border-stone-400 px-2 py-1.5 shadow-sm transition-colors hover:border-stone-600">
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8 rounded-full text-stone-400 hover:text-stone-800"
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
                className="h-8 w-8 rounded-full text-stone-400 hover:text-stone-800"
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
                  <SheetContent side="right" className="w-full sm:max-w-lg border-l-stone-100 p-0 flex flex-col">
                    <div className="px-6 pt-6 pb-2">
                      <SheetHeader className="mb-0">
                        <SheetTitle className="text-stone-800 uppercase tracking-tighter font-black text-xl">
                          {scheduleToEdit ? "Editar Escala" : `Escala de ${format(currentDate, "MMMM yyyy", { locale: ptBR })}`}
                        </SheetTitle>
                      </SheetHeader>
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <ScheduleForm 
                        currentMonth={currentDate}
                        initialData={scheduleToEdit}
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

                  return sortedDays.map((day: any) => (
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
                        slots: [...item.slots].sort((a: any, b: any) => 
                          (roleWeights[a.role] || 99) - (roleWeights[b.role] || 99)
                        ).map((s: any) => ({
                          id: s.id,
                          role: s.role,
                          roleName: (({
                            'C': 'Comentarista',
                            '1L': '1ª Leitura',
                            '2L': '2ª Leitura',
                            'P': 'Preces',
                            'L': 'Leitura Única'
                          } as Record<string, string>)[s.role]) || s.role,
                          readerName: s.readerName,
                          avatarUrl: s.avatarUrl,
                          originalReaderName: s.originalReader?.fullName,
                          isConfirmed: s.isConfirmed,
                          isSwapRequested: s.isSwapRequested,
                          isClaimed: s.isClaimed,
                          isMine: s.readerId ? s.readerId === user?.id : (member?.id && (s.memberId === member.id))
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
                      onConfirm={async (slotId) => {
                        if (!user) return
                        try {
                          await confirmSlot(slotId, user.id)
                          toast.success("Presença confirmada!")
                          triggerRefresh()
                        } catch (error) {
                          toast.error("Erro ao confirmar.")
                        }
                      }}
                      onRequestSwap={(slotId) => {
                        // Encontrar detalhes da missa para o aviso
                        let targetMass: any = null;
                        let targetDay: any = null;
                        
                        schedule.forEach(mass => {
                          if (mass.slots.some((s: any) => s.id === slotId)) {
                            targetMass = mass;
                          }
                        });

                        if (targetMass) {
                          setSwapTargetSlot({
                            id: slotId,
                            massDate: format(new Date(targetMass.date + 'T00:00:00'), "dd/MM"),
                            massTime: targetMass.time.substring(0, 5),
                            description: targetMass.specialDescription || "Missa"
                          });
                        }
                      }}
                      onCancelSwap={async (slotId) => {
                        try {
                          await cancelSwap(slotId)
                          toast.success("Pedido de troca cancelado!")
                          triggerRefresh()
                        } catch (error) {
                          toast.error("Erro ao cancelar troca.")
                        }
                      }}
                      onTakeSwap={async (slotId) => {
                        if (!user) return;
                        
                        // Encontrar detalhes para o Drawer de confirmação
                        let targetMass: any = null;
                        let targetSlot: any = null;
                        
                        schedule.forEach(mass => {
                          const found = mass.slots.find((s: any) => s.id === slotId);
                          if (found) {
                            targetMass = mass;
                            targetSlot = found;
                          }
                        });

                        if (targetMass && targetSlot) {
                          setTakeSwapTarget({
                            slotId,
                            date: isValid(new Date(targetMass.date + 'T00:00:00'))
                              ? format(new Date(targetMass.date + 'T00:00:00'), "dd/MM/yyyy")
                              : "--/--/----",
                            time: targetMass.time.substring(0, 5),
                            roleName: (({
                              'C': 'Comentarista',
                              '1L': '1ª Leitura',
                              '2L': '2ª Leitura',
                              'P': 'Preces',
                              'L': 'Leitura Única'
                            } as Record<string, string>)[targetSlot.role]) || targetSlot.role
                          });
                        }
                      }}
                    />
                  ))
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
                        await Promise.all(scheduleToDelete.map(id => deleteMass(id)))
                        toast.success("Dia removido da escala.")
                        triggerRefresh()
                        setScheduleToDelete(null)
                      } catch (error) {
                        toast.error("Erro ao excluir horários do dia.")
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

          {/* Drawer de Confirmação de Troca */}
          <Drawer open={!!swapTargetSlot} onOpenChange={(open) => !open && !isRequestingSwap && setSwapTargetSlot(null)}>
            <DrawerContent>
              <div className="mx-auto w-full max-w-sm">
                <DrawerHeader className="text-center">
                  <DrawerTitle className="text-stone-800">Solicitar Troca?</DrawerTitle>
                  <DrawerDescription>
                    Um aviso será enviado ao Mural de Recados para que outro leitor possa assumir sua escala no dia {swapTargetSlot?.massDate} às {swapTargetSlot?.massTime}.
                  </DrawerDescription>
                </DrawerHeader>
                <DrawerFooter className="flex flex-col gap-2 pb-8">
                  <Button 
                    variant="default"
                    className="w-full font-bold h-12 rounded-xl bg-amber-600 hover:bg-amber-700 text-white"
                    disabled={isRequestingSwap}
                    onClick={async () => {
                      if (!swapTargetSlot || !user) return
                      setIsRequestingSwap(true)
                      try {
                        await requestSwap(swapTargetSlot.id)
                        
                        toast.success("Solicitação de troca publicada!")
                        triggerRefresh()
                        setSwapTargetSlot(null)
                      } catch (error) {
                        toast.error("Erro ao processar solicitação.")
                      } finally {
                        setIsRequestingSwap(false)
                      }
                    }}
                  >
                    {isRequestingSwap ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmar Solicitação"}
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

          {/* Drawer de Confirmação para ASSUMIR Troca */}
          <Drawer open={!!takeSwapTarget} onOpenChange={(open) => !open && !isAcceptingSwap && setTakeSwapTarget(null)}>
            <DrawerContent>
              <div className="mx-auto w-full max-w-sm">
                <DrawerHeader className="text-center">
                  <DrawerTitle className="text-stone-800">Assumir esta Escala?</DrawerTitle>
                  <DrawerDescription className="text-stone-600 font-normal" asChild>
                    <div>
                      Ao confirmar, você assumirá o compromisso de realizar a leitura abaixo:
                      <div className="mt-4 p-4 bg-stone-50 rounded-2xl border border-stone-100 flex flex-col gap-1 text-left">
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] uppercase font-black text-stone-400">Data</span>
                          <span className="text-sm font-bold text-stone-800">{takeSwapTarget?.date}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] uppercase font-black text-stone-400">Horário</span>
                          <span className="text-sm font-bold text-stone-800">{takeSwapTarget?.time}</span>
                        </div>
                        <div className="flex justify-between items-center mt-1 pt-1 border-t border-stone-100">
                          <span className="text-[10px] uppercase font-black text-stone-400">Função</span>
                          <span className="text-sm font-black text-green-700">{takeSwapTarget?.roleName}</span>
                        </div>
                      </div>
                    </div>
                  </DrawerDescription>
                </DrawerHeader>
                <DrawerFooter className="flex flex-col gap-2 pb-8">
                  <Button 
                    variant="default"
                    className="w-full font-bold h-12 rounded-xl bg-green-700 hover:bg-green-800 text-white shadow-lg shadow-green-100"
                    disabled={isAcceptingSwap}
                    onClick={async () => {
                      if (!takeSwapTarget || !user) return
                      setIsAcceptingSwap(true)
                        try {
                          await acceptSwap(takeSwapTarget.slotId, user.id, member?.id)
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
                    {isAcceptingSwap ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmar e Assumir"}
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
              <div className="mx-auto w-full max-w-md p-6 overflow-y-auto max-h-[90vh]">
                <DrawerHeader className="px-1 text-left">
                  <DrawerTitle className="text-lg font-black text-stone-800 leading-tight">
                    Informe os dias que você <span className="text-red-600 underline decoration-red-200 underline-offset-4">não poderá</span> participar
                  </DrawerTitle>
                </DrawerHeader>
                {user && (
                  <UnavailableForm 
                    userId={user.id} 
                    onClose={() => setIsUnavailableDrawerOpen(false)} 
                  />
                )}
                <DrawerFooter className="px-0 pt-4">
                  <DrawerClose asChild>
                    <Button variant="default" className="w-full h-12 rounded-xl bg-stone-800 hover:bg-stone-900 text-white font-bold border-none">
                      Salvar e Fechar Calendário
                    </Button>
                  </DrawerClose>
                </DrawerFooter>
              </div>
            </DrawerContent>
          </Drawer>

          {/* Versão do App */}
          <div className="mt-12 mb-8 flex justify-center">
            <span className="text-[10px] font-bold text-stone-300 uppercase tracking-widest">
              Versão {APP_VERSION}
            </span>
          </div>
 
        </div>
      </main>

      {/* Botões Flutuantes (Fora do scroll para garantir fixação) */}
      {profile?.role === "admin" && schedule.some(mass => !mass.isPublished) && (
        <div className="fixed bottom-6 left-6 z-50 w-[calc(100%-120px)] max-w-[280px]">
          <Button 
            className="w-full h-14 bg-green-600 hover:bg-green-700 text-white font-black rounded-2xl shadow-xl border-t border-white/20 animate-in fade-in slide-in-from-bottom-8 duration-500"
            onClick={handlePublish}
            disabled={isPublishing}
          >
            {isPublishing ? (
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            ) : (
              <CheckCircle className="mr-2 h-5 w-5" />
            )}
            PUBLICAR ESCALA DE {format(currentDate, "MMMM", { locale: ptBR }).toUpperCase()}
          </Button>
        </div>
      )}
      
      <Link 
        href="/folheto"
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[#322113] text-white shadow-lg shadow-[#322113]/40 transition-all hover:scale-110 active:scale-95 animate-in fade-in zoom-in duration-500"
        title="Folheto da Missa"
      >
        <FileText className="h-6 w-6" />
      </Link>
    </div>
  )
}
