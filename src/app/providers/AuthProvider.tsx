"use client"

import { createContext, useContext, useEffect, useState, ReactNode } from "react"
import { supabase } from "@/shared/api/supabase"
import { User, AuthChangeEvent, Session } from "@supabase/supabase-js"
import { makeGetProfileByAuthId } from "@/main/factories/usecases/profiles"
import { Profile } from "@/domain/models/Profile"

interface AuthContextType {
  user: User | null
  profile: Profile | null
  isActive: boolean // true se o usuário tem um perfil vinculado
  loading: boolean
  refreshProfile: () => Promise<void>
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchProfile = async (authUserId: string) => {
    setLoading(true)
    console.log("[AuthProvider] Buscando perfil para authUserId:", authUserId)
    try {
      const profileData = await makeGetProfileByAuthId().execute(authUserId)
      console.log("[AuthProvider] Perfil encontrado:", profileData)
      setProfile(profileData)
      if (profileData?.id) {
        supabase
          .from("profiles")
          .update({ last_seen_at: new Date().toISOString() })
          .eq("id", profileData.id)
          .then()
      }
    } catch (error: any) {
      console.error("[AuthProvider] Erro ao buscar perfil:", error?.message || error)
      if (error?.details) console.error("[AuthProvider] Detalhes do erro:", error.details)
      if (error?.hint) console.error("[AuthProvider] Dica do banco:", error.hint)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // 1. Verificar usuário atual ao montar
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user)
      if (user) {
        fetchProfile(user.id)
      } else {
        setLoading(false)
      }
    })

    // 2. Escutar mudanças na autenticação
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        const currentUser = session?.user ?? null
        setUser(currentUser)
        if (currentUser) {
          fetchProfile(currentUser.id)
        } else {
          setProfile(null)
          setLoading(false)
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  const signInWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setProfile(null)
    setUser(null)
  }

  const value = {
    user,
    profile,
    isActive: !!profile,
    loading,
    refreshProfile: async () => {
      if (user) await fetchProfile(user.id)
    },
    signInWithGoogle,
    signOut,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuthContext() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuthContext must be used within an AuthProvider")
  }
  return context
}
