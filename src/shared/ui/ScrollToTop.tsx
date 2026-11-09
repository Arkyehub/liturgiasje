"use client"

import { useEffect, useRef } from "react"
import { usePathname } from "next/navigation"

/**
 * Leva a janela ao topo a cada navegação para uma nova página.
 *
 * O cabeçalho fixo (sticky) faz o Next.js considerar o topo da nova página "já visível" e
 * manter a rolagem anterior. Duas exceções preservam o comportamento esperado do navegador:
 * - voltar/avançar (popstate) restaura a posição salva pelo próprio histórico;
 * - links com âncora (/#slot-123) rolam até o elemento indicado.
 */
export function ScrollToTop() {
  const pathname = usePathname()
  const isHistoryNavigation = useRef(false)
  const isFirstRender = useRef(true)

  useEffect(() => {
    const markHistoryNavigation = () => {
      isHistoryNavigation.current = true
    }
    window.addEventListener("popstate", markHistoryNavigation)
    return () => window.removeEventListener("popstate", markHistoryNavigation)
  }, [])

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    if (isHistoryNavigation.current) {
      isHistoryNavigation.current = false
      return
    }
    if (window.location.hash) return
    window.scrollTo({ top: 0, left: 0, behavior: "instant" })
  }, [pathname])

  return null
}
