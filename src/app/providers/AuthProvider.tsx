"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from "react"
import { supabase } from "@/shared/api/supabase"
import { User, AuthChangeEvent, Session } from "@supabase/supabase-js"
import { makeGetProfileByAuthId } from "@/main/factories/usecases/profiles"
import { Profile } from "@/domain/models/Profile"
import { canonicalRedirectUrl } from "@/shared/lib/canonicalHost"

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

// Campos que mudam sozinhos a cada acesso e não alteram nada na tela.
const VOLATILE_PROFILE_FIELDS: (keyof Profile)[] = ["lastSeenAt", "updatedAt"]

/** Compara perfis ignorando campos voláteis, para manter a mesma referência quando nada mudou. */
export function isSameProfile(a: Profile | null, b: Profile | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  const strip = (p: Profile) => JSON.stringify({ ...p, ...Object.fromEntries(VOLATILE_PROFILE_FIELDS.map((k) => [k, null])) })
  return strip(a) === strip(b)
}

const BACKGROUND_REFRESH_MS = 5 * 60 * 1000 // atualização em segundo plano (aba visível)
const MIN_FOCUS_REFRESH_MS = 60 * 1000 // ao voltar para a aba, no máximo 1 atualização por minuto
const LAST_SEEN_THROTTLE_MS = 10 * 60 * 1000 // escreve last_seen_at no máximo a cada 10 minutos

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const currentUserId = useRef<string | null>(null)
  const lastRefreshAt = useRef(0)
  const lastSeenWrittenAt = useRef(0)

  const touchLastSeen = useCallback((profileId: string) => {
    const now = Date.now()
    if (now - lastSeenWrittenAt.current < LAST_SEEN_THROTTLE_MS) return
    lastSeenWrittenAt.current = now
    supabase
      .from("profiles")
      .update({ last_seen_at: new Date(now).toISOString() })
      .eq("id", profileId)
      .then(({ error }) => {
        if (error) console.error("[AuthProvider] Erro ao registrar último acesso:", error.message)
      })
  }, [])

  const fetchProfile = useCallback(async (authUserId: string, silent = false) => {
    if (!silent) setLoading(true)
    lastRefreshAt.current = Date.now()
    try {
      const profileData = await makeGetProfileByAuthId().execute(authUserId)
      // Mantém a mesma referência quando nada mudou: telas que dependem de `profile` não refazem consultas.
      setProfile((previous) => (isSameProfile(previous, profileData) ? previous : profileData))
      if (profileData?.id && profileData.archivedAt === null) touchLastSeen(profileData.id)
    } catch (error) {
      setProfile(null)
      const e = error as { message?: string; details?: string; hint?: string }
      console.error("[AuthProvider] Erro ao buscar perfil:", e?.message || "erro desconhecido", e?.details ?? "", e?.hint ?? "")
    } finally {
      if (!silent) setLoading(false)
    }
  }, [touchLastSeen])

  useEffect(() => {
    // 1. Verificar usuário atual ao montar
    supabase.auth.getUser().then(({ data: { user } }) => {
      currentUserId.current = user?.id ?? null
      setUser(user)
      if (user) {
        fetchProfile(user.id)
      } else {
        setLoading(false)
      }
    })

    // 2. Escutar mudanças na autenticação.
    // O Supabase repete eventos (ex.: SIGNED_IN, TOKEN_REFRESHED) ao voltar para a aba para o MESMO usuário:
    // nesse caso não há "carregando" nem troca de usuário, só uma atualização silenciosa.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        const sessionUser = session?.user ?? null
        if (sessionUser && sessionUser.id === currentUserId.current) {
          setUser((previous) => (previous?.id === sessionUser.id ? previous : sessionUser))
          return
        }
        currentUserId.current = sessionUser?.id ?? null
        setUser(sessionUser)
        if (sessionUser) {
          fetchProfile(sessionUser.id)
        } else {
          setProfile(null)
          setLoading(false)
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [fetchProfile])

  useEffect(() => {
    if (!user?.id) return
    const refresh = () => {
      if (document.visibilityState === "hidden") return
      void fetchProfile(user.id, true)
    }
    // Ao voltar para a aba/app: atualiza, mas no máximo uma vez por minuto.
    const refreshOnReturn = () => {
      if (Date.now() - lastRefreshAt.current >= MIN_FOCUS_REFRESH_MS) refresh()
    }
    window.addEventListener("focus", refreshOnReturn)
    document.addEventListener("visibilitychange", refreshOnReturn)
    const timer = window.setInterval(refresh, BACKGROUND_REFRESH_MS)
    return () => {
      window.removeEventListener("focus", refreshOnReturn)
      document.removeEventListener("visibilitychange", refreshOnReturn)
      window.clearInterval(timer)
    }
  }, [user?.id, fetchProfile])

  const signInWithGoogle = async () => {
    // Em Production, não inicia o login fora do domínio oficial: o cookie PKCE ficaria no domínio errado
    const canonical = canonicalRedirectUrl(
      process.env.NEXT_PUBLIC_VERCEL_ENV,
      window.location.host,
      window.location.pathname + window.location.search,
    )
    if (canonical) {
      window.location.assign(canonical)
      return
    }
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

  const refreshProfile = useCallback(async () => {
    if (user) await fetchProfile(user.id)
  }, [user, fetchProfile])

  const value = useMemo(
    () => ({
      user,
      profile,
      isActive: !!profile && profile.archivedAt === null,
      loading,
      refreshProfile,
      signInWithGoogle,
      signOut,
    }),
    [user, profile, loading, refreshProfile]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuthContext() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuthContext must be used within an AuthProvider")
  }
  return context
}
