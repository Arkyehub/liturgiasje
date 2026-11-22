"use client"

import { useEffect, useRef } from "react"

const COLORS = ["#E8B21E", "#E8C76A", "#A23F06", "#1E6B43", "#322113", "#C2541A"]

interface Piece {
  x: number
  y: number
  w: number
  h: number
  vy: number
  vx: number
  rot: number
  vr: number
  color: string
}

/** Chuva de confete em canvas, sem dependências. Não intercepta cliques e respeita "reduzir movimento". */
export function Confetti() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    let raf = 0
    let width = 0
    let height = 0
    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      width = window.innerWidth
      height = window.innerHeight
      canvas.width = width * dpr
      canvas.height = height * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener("resize", resize)

    const make = (spread: boolean): Piece => ({
      x: Math.random() * width,
      y: spread ? Math.random() * height : -12,
      w: 6 + Math.random() * 6,
      h: 4 + Math.random() * 5,
      vy: 1.2 + Math.random() * 1.8,
      vx: (Math.random() - 0.5) * 1.2,
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.2,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    })
    const count = width < 640 ? 45 : 80
    const pieces = Array.from({ length: count }, () => make(true))

    const tick = () => {
      ctx.clearRect(0, 0, width, height)
      for (const p of pieces) {
        p.y += p.vy
        p.x += p.vx + Math.sin(p.y / 40) * 0.4
        p.rot += p.vr
        if (p.y > height + 12) Object.assign(p, make(false), { x: Math.random() * width })
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rot)
        ctx.fillStyle = p.color
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h)
        ctx.restore()
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener("resize", resize)
    }
  }, [])

  return <canvas ref={canvasRef} aria-hidden="true" data-testid="confetti" className="pointer-events-none fixed inset-0 z-40 h-full w-full" />
}
