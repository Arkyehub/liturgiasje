import { useState, useEffect, useCallback } from 'react'

export function usePullToRefresh(onRefresh: () => Promise<void>) {
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [pullDistance, setPullDistance] = useState(0)
  const [startY, setStartY] = useState(0)

  const handleTouchStart = useCallback((e: TouchEvent) => {
    // Só inicia se estiver no topo da página
    if (window.scrollY === 0) {
      setStartY(e.touches[0].pageY)
    }
  }, [])

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (startY === 0 || window.scrollY > 0) return

    const currentY = e.touches[0].pageY
    const distance = currentY - startY

    if (distance > 0) {
      // Aplicar resistência
      const resistance = 0.4
      const newDistance = Math.min(distance * resistance, 80)
      setPullDistance(newDistance)
      
      // Prevenir scroll nativo se estiver puxando para baixo
      if (newDistance > 10 && e.cancelable) {
        e.preventDefault()
      }
    }
  }, [startY])

  const handleTouchEnd = useCallback(async () => {
    if (pullDistance > 60) {
      setIsRefreshing(true)
      setPullDistance(40) // Manter um pouco visível enquanto carrega
      try {
        await onRefresh()
      } finally {
        setIsRefreshing(false)
        setPullDistance(0)
      }
    } else {
      setPullDistance(0)
    }
    setStartY(0)
  }, [pullDistance, onRefresh])

  useEffect(() => {
    window.addEventListener('touchstart', handleTouchStart, { passive: true })
    window.addEventListener('touchmove', handleTouchMove, { passive: false })
    window.addEventListener('touchend', handleTouchEnd)

    return () => {
      window.removeEventListener('touchstart', handleTouchStart)
      window.removeEventListener('touchmove', handleTouchMove)
      window.removeEventListener('touchend', handleTouchEnd)
    }
  }, [handleTouchStart, handleTouchMove, handleTouchEnd])

  return { isRefreshing, pullDistance }
}
