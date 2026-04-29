"use client"

import { createContext, useContext, useEffect, useState, ReactNode } from "react"
import { supabase } from "@/shared/api/supabase"
import { User, AuthChangeEvent, Session } from "@supabase/supabase-js"
import { makeGetUserProfile } from "@/main/factories/usecases/user"
import { makeGetMemberByUserId } from "@/main/factories/usecases/members"
import { UserProfile } from "@/domain/models/UserProfile"

interface AuthContextType {
  user: User | null
  profile: UserProfile | null
  member: any | null
  isMember: boolean
  loading: boolean
  refreshProfile: () => Promise<void>
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [member, setMember] = useState<any | null>(null)
  const [isMember, setIsMember] = useState(false)
  const [loading, setLoading] = useState(true)

  const fetchProfile = async (userId: string) => {
    setLoading(true)
    try {
      const [profileData, memberData] = await Promise.all([
        makeGetUserProfile().execute(userId),
        makeGetMemberByUserId().execute(userId)
      ])
      setProfile(profileData)
      setMember(memberData)
      setIsMember(!!memberData)
    } catch (error) {
      console.error("Erro ao buscar perfil/membro:", error)
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
          setMember(null)
          setIsMember(false)
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
    setMember(null)
    setIsMember(false)
    setUser(null)
  }

  const value = {
    user,
    profile,
    member,
    isMember,
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
