"use client"

import { useEffect, useRef } from "react"
import { supabase } from "@/shared/api/supabase"
import { useAuth } from "@/shared/hooks/useAuth"

export function GoogleOneTap() {
  const { user, loading } = useAuth()
  const isInitialized = useRef(false)

  useEffect(() => {
    if (loading || user || isInitialized.current) return

    const initializeOneTap = async () => {
      if (!window.google || isInitialized.current) return
      isInitialized.current = true

      // Gerar nonce para segurança
      const rawNonce = Math.random().toString(36).substring(2, 15)
      const encoder = new TextEncoder()
      const data = encoder.encode(rawNonce)
      const hashBuffer = await crypto.subtle.digest("SHA-256", data)
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      const hashedNonce = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")

      window.google.accounts.id.initialize({
        client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "",
        nonce: hashedNonce,
        callback: async (response: any) => {
          try {
            const { error } = await supabase.auth.signInWithIdToken({
              provider: 'google',
              token: response.credential,
              nonce: rawNonce,
            })
            if (error) throw error
            console.log("Login One Tap realizado com sucesso")
          } catch (error) {
            console.error("Erro no login One Tap:", error)
            isInitialized.current = false // Permitir tentar novamente em caso de erro
          }
        },
        auto_select: false,
        use_fedcm_for_prompt: true,
        itp_support: true,
        cancel_on_tap_outside: true,
      })

      window.google.accounts.id.prompt((notification: any) => {
        // Com FedCM, o gerenciamento de exibição é feito pelo navegador.
        // O callback de notificação pode ser usado para logs básicos se necessário,
        // mas métodos como isSkippedMoment() foram depreciados.
        if (notification.isDisplayMoment()) {
          console.log("Google One Tap: Prompt exibido")
        }
      })
    }

    const interval = setInterval(() => {
      if (window.google) {
        initializeOneTap()
        clearInterval(interval)
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [user, loading])

  return null
}

// Declarar tipos globais para o Google Identity Services
declare global {
  interface Window {
    google: any
  }
}
