"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/shared/hooks/useAuth"
import { makeUpdateProfile } from "@/main/factories/usecases/profiles"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { Loader2, ArrowLeft, Save, User as UserIcon, Calendar, MessageSquare, Clock } from "lucide-react"
import { toast } from "sonner"
import { maskPhone, cn } from "@/shared/lib/utils"
import { ProfileImageEditor } from "@/features/profile/ui/ProfileImageEditor"
import { BirthDatePicker } from "@/features/profile/ui/BirthDatePicker"
import { Badge } from "@/shared/ui/badge"

const COMMON_TIMES = ["07:00", "09:00", "11:00", "19:00"]

export default function ProfilePage() {
  const { user, profile, isActive, loading, signInWithGoogle, signOut, refreshProfile } = useAuth()
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [selectedDay] = useState(6) // Fixo Domingo
  const [formData, setFormData] = useState({
    fullName: "",
    whatsapp: "",
    birthDate: "",
    preferences: {
      day_preferences: {} as Record<string, string[]>
    }
  })

  useEffect(() => {
    if (!loading && !user) {
      router.push("/")
    } else if (profile) {
      setFormData({
        fullName: profile.fullName || "",
        whatsapp: profile.whatsapp || "",
        birthDate: profile.birthDate || "",
        preferences: { day_preferences: (profile.preferences?.day_preferences ?? {}) as Record<string, string[]> }
      })
    }
  }, [user, profile, loading])

  const toggleTimePreference = (dayIndex: number, time: string) => {
    setFormData(prev => {
      const dayPrefs = prev.preferences?.day_preferences || {}
      const currentTimes = dayPrefs[dayIndex] || []
      const nextTimes = currentTimes.includes(time)
        ? currentTimes.filter(t => t !== time)
        : [...currentTimes, time]
      
      return {
        ...prev,
        preferences: {
          ...prev.preferences,
          day_preferences: {
            ...dayPrefs,
            [dayIndex]: nextTimes
          }
        }
      }
    })
  }

  const hasSelectedTimes = formData.preferences?.day_preferences?.[selectedDay]?.length > 0
  const isFormValid = formData.fullName.trim() !== "" && 
                     formData.whatsapp.length >= 14 && 
                     formData.birthDate !== "" && 
                     hasSelectedTimes

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !isFormValid) return
    setIsSubmitting(true)
    try {
      if (!profile) return
      await makeUpdateProfile().execute(profile.id, formData)
      toast.success("Perfil atualizado com sucesso!")
      await refreshProfile()
      router.push("/")
    } catch (error: any) {
      if (error.message === "NAME_ALREADY_IN_USE") {
        toast.error("Este nome já está em uso por outro membro. Por favor, use seu nome completo ou adicione um sobrenome.")
      } else {
        toast.error("Erro ao atualizar perfil.")
      }
    } finally {
      setIsSubmitting(false)
    }
  }


  if (loading || !user) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#FAF5E6]">
        <Loader2 className="h-8 w-8 animate-spin text-[#B8A98E]" />
      </div>
    )
  }

  return (
    <div className="relative z-10 flex min-h-screen flex-col bg-[#FAF5E6]">
      
      <main className="flex-1 overflow-auto">
        <div className="container max-w-md mx-auto px-4 py-6 space-y-5 pb-20">
          {isActive && (!profile?.birthDate || !((profile?.preferences?.day_preferences?.[6]?.length ?? 0) > 0)) && (
            <div className="bg-[#FDEBDD] border border-[#F2CDB0] rounded-2xl p-4 animate-in fade-in slide-in-from-top-2">
              <h3 className="text-[#A23F06] font-extrabold text-sm">Complete seu perfil</h3>
              <p className="text-[#7A4A2A] text-xs mt-1">
                Para acessar o mural de escalas, precisamos da sua <strong>data de nascimento</strong> e <strong>missa preferencial</strong>.
              </p>
            </div>
          )}


          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="overflow-hidden rounded-3xl border border-[#E9DFCB] bg-white shadow-sm">
              
              <div className="flex flex-col items-center bg-[#322113] px-6 pb-6 pt-7">
                <ProfileImageEditor />
                <h1 className="mt-3 text-center text-lg font-black leading-tight text-[#FFF8E8]">
                  {profile?.fullName || "Meu perfil"}
                </h1>
                <p className="mt-0.5 max-w-full truncate text-xs text-[#E8C76A]">{user.email}</p>
                {profile?.role === "admin" && (
                  <Badge className="mt-3 rounded-full border-none bg-[#E8B21E] px-3 py-1 text-[10px] font-black uppercase tracking-wider text-[#322113] hover:bg-[#E8B21E]">
                    Administrador
                  </Badge>
                )}
              </div>

              <div className="space-y-5 p-6">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-[#8A7A66]">
                    <UserIcon className="h-3 w-3" />
                    <label className="text-[10px] font-bold uppercase tracking-widest">Nome e Sobrenome</label>
                  </div>
                  <Input 
                    value={formData.fullName}
                    onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                    placeholder="Seu nome"
                    className="rounded-2xl border-[#E9DFCB] bg-[#FAF5E6]/60 focus-visible:ring-[#E8B21E]/40 h-12 text-black font-medium"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-[#8A7A66]">
                    <MessageSquare className="h-3 w-3" />
                    <label className="text-[10px] font-bold uppercase tracking-widest">WhatsApp</label>
                  </div>
                  <Input 
                    value={formData.whatsapp}
                    onChange={(e) => setFormData({ ...formData, whatsapp: maskPhone(e.target.value) })}
                    placeholder="(00) 00000-0000"
                    className="rounded-2xl border-[#E9DFCB] bg-[#FAF5E6]/60 focus-visible:ring-[#E8B21E]/40 h-12 text-black font-medium"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-[#8A7A66]">
                    <Calendar className="h-3 w-3" />
                    <label className="text-[10px] font-bold uppercase tracking-widest">Data de Nascimento</label>
                  </div>
                  <BirthDatePicker 
                    value={formData.birthDate}
                    onChange={(val) => setFormData({ ...formData, birthDate: val })}
                  />
                </div>

                <div className="space-y-6 pt-2">
                  <div className="flex items-center gap-2 text-[#8A7A66]">
                    <Clock className="h-3 w-3" />
                    <label className="text-[10px] font-bold uppercase tracking-widest">Horários de Preferência (Domingo)</label>
                  </div>

                  <div className="space-y-6">
                    {/* Chips de Horários para o domingo */}
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-2">
                        {COMMON_TIMES.map((time) => {
                          const isSelected = formData.preferences?.day_preferences?.[selectedDay]?.includes(time)
                          return (
                            <button
                              key={time}
                              type="button"
                              onClick={() => toggleTimePreference(selectedDay, time)}
                              className={cn(
                                "flex items-center justify-center h-12 px-4 rounded-2xl border text-sm font-bold transition-all",
                                isSelected 
                                  ? "bg-[#322113] border-[#322113] text-[#FFF8E8] shadow-md"
                                  : "bg-[#FAF5E6]/60 border-[#E9DFCB] text-[#6B5D50] hover:border-[#D9CDB8]"
                              )}
                            >
                              {time}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-1">
                <Button 
                  type="submit" 
                  disabled={isSubmitting || !isFormValid}
                  className={cn(
                    "w-full h-12 rounded-2xl font-bold shadow-lg transition-all",
                    isFormValid 
                      ? "bg-[#322113] hover:bg-[#241709] text-white shadow-[#322113]/20"
                      : "bg-[#F4EEDD] text-[#8A7A66] cursor-not-allowed shadow-none"
                  )}
                >
                  {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <Save className="h-5 w-5 mr-2" />}
                  {isFormValid ? "Salvar Alterações" : "Preencha todos os campos"}
                </Button>
              </div>
            </div>

            <div className="space-y-4 rounded-3xl border border-[#E9DFCB] bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <h3 className="text-sm font-extrabold text-black">Status de Membro</h3>
                  <p className="text-[11px] text-[#6B5D50]">
                    {isActive 
                      ? "Você está vinculado à lista oficial de membros." 
                      : "Seu perfil ainda não está vinculado à lista de membros."}
                  </p>
                </div>
                {isActive ? (
                  <div className="flex items-center gap-1.5 bg-[#E6F3EB] text-[#1E6B43] px-3 py-1.5 rounded-full">
                    <div className="h-1.5 w-1.5 rounded-full bg-[#2E8B57] animate-pulse" />
                    <span className="text-[10px] font-bold uppercase tracking-wider">Ativo</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 bg-[#FDEBDD] text-[#A23F06] px-3 py-1.5 rounded-full">
                    <span className="text-[10px] font-bold uppercase tracking-wider">Pendente</span>
                  </div>
                )}
              </div>

              {!isActive && (
                <Button 
                  type="button"
                  variant="outline"
                  onClick={() => router.push("/bemvindo")}
                  className="w-full rounded-2xl border-[#E9DFCB] text-[#322113] text-xs font-bold h-11 hover:bg-[#FAF5E6]"
                >
                  <UserIcon className="h-3 w-3 mr-2 text-[#8A7A66]" />
                  Vincular meu nome à lista
                </Button>
              )}
            </div>

          </form>
        </div>
      </main>
    </div>
  )
}
