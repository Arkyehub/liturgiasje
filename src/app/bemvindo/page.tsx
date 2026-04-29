"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/shared/hooks/useAuth"
import { memberService, Member } from "@/services/memberService"
import { userService } from "@/services/userService"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { Loader2, Search, UserPlus } from "lucide-react"
import { toast } from "sonner"
import { supabase } from "@/shared/api/supabase"

export default function OnboardingPage() {
  const { user, profile, isMember, loading, refreshProfile } = useAuth()
  const router = useRouter()
  const [searchTerm, setSearchTerm] = useState("")
  const [searchResults, setSearchResults] = useState<Member[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Redirecionar se não estiver logado OU se já for membro
  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.push("/")
      } else if (isMember) {
        router.push("/")
      }
    }
  }, [user, isMember, loading, router])

  const handleSearch = async () => {
    if (!searchTerm.trim()) return
    setIsSearching(true)
    try {
      const results = await memberService.search(searchTerm)
      setSearchResults(results)
    } finally {
      setIsSearching(false)
    }
  }

  const handleClaim = async (member: Member) => {
    if (!user) return
    setIsSubmitting(true)
    try {
      // 1. Criar/Atualizar perfil em public.users (upsert) - IMPORTANTE: Fazer antes do vínculo para evitar erro de FK
      const { error: profileError } = await supabase
        .from('users')
        .upsert({
          id: user.id,
          email: user.email!,
          full_name: member.full_name,
          whatsapp: member.whatsapp,
          role: profile?.role || 'reader',
          claimed_at: new Date().toISOString()
        })
      
      if (profileError) throw profileError

      // 2. Vincular na tabela members
      await memberService.claim(member.id, user.id)
      
      toast.success("Perfil vinculado com sucesso!")
      await refreshProfile()
      router.push("/perfil")
    } catch (error: any) {
      toast.error("Erro ao vincular perfil.")
      console.error("Erro detalhado:", error.message || error.details || error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCreateNew = async () => {
    if (!user) return
    setIsSubmitting(true)
    try {
      // 1. Criar/Atualizar perfil em public.users (upsert)
      const { error: profileError } = await supabase
        .from('users')
        .upsert({
          id: user.id,
          email: user.email!,
          full_name: user.user_metadata.full_name || profile?.full_name || "",
          role: profile?.role || 'reader',
          is_self_registered: true
        })
      
      if (profileError) throw profileError
      
      // 2. Criar registro na tabela members já vinculado
      await memberService.create({
        full_name: user.user_metadata.full_name || user.email?.split('@')[0] || "Novo Membro",
        is_claimed: true,
        claimed_by: user.id
      })
      
      toast.success("Perfil criado e vinculado!")
      await refreshProfile()
      router.push("/perfil")
    } catch (error) {
      toast.error("Erro ao criar perfil.")
    } finally {
      setIsSubmitting(false)
    }
  }

  if (loading || isSubmitting) {
    return (
      <div className="flex h-screen items-center justify-center bg-stone-50">
        <Loader2 className="h-8 w-8 animate-spin text-stone-300" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-stone-50/50 px-4 py-12">
      <div className="mx-auto max-w-md space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-stone-900 font-heading">Seja bem vindo a equipe de Liturgia!</h1>
          <p className="text-stone-500 text-sm">Para continuar, precisamos vincular seu acesso ao seu cadastro de leitor.</p>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-stone-100 shadow-sm space-y-6">
          <div className="space-y-4">
            <label className="text-xs font-bold uppercase tracking-widest text-stone-400">Busque pelo seu nome, ou pelo whatsapp</label>
            <div className="flex gap-2">
              <Input 
                placeholder="Ex: João Silva" 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="rounded-xl border-stone-200 focus-visible:ring-stone-200"
              />
              <Button onClick={handleSearch} disabled={isSearching} className="rounded-xl bg-stone-800 hover:bg-black">
                {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <div className="space-y-3 pt-2">
            {searchResults.length > 0 ? (
              searchResults.map((m) => (
                <button
                  key={m.id}
                  onClick={() => handleClaim(m)}
                  className="w-full flex items-center justify-between p-4 rounded-xl border border-stone-100 bg-stone-50/50 hover:bg-stone-100 transition-colors text-left"
                >
                  <div className="space-y-0.5">
                    <p className="text-sm font-semibold text-stone-800">{m.full_name}</p>
                    <p className="text-[10px] text-stone-500">{m.whatsapp || "WhatsApp não cadastrado"}</p>
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 bg-white px-2 py-1 rounded-md border border-stone-100">Este sou eu</span>
                </button>
              ))
            ) : searchTerm && !isSearching ? (
              <p className="text-center text-xs text-stone-400 py-4">Nenhum resultado encontrado.</p>
            ) : null}
          </div>

          <div className="pt-4 border-t border-stone-100">
            <p className="text-center text-xs text-stone-500 italic">
              Caso não esteja encontrando seus dados, entre em contato com a coordenação.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
