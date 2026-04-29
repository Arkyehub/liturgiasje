"use client"

import { useAuthContext } from "@/app/providers/AuthProvider"

/**
 * Hook para acessar o contexto de autenticação de forma compartilhada.
 * Isso evita múltiplos carregamentos e "pisca-piscas" na UI durante a navegação.
 */
export function useAuth() {
  return useAuthContext()
}
