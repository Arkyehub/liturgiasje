"use client"

import { useRef, useEffect, useCallback } from "react"
import { cn } from "@/shared/lib/utils"

const ITEM_HEIGHT = 48

interface RollerColumnProps {
  items: string[]
  value: string
  onSelect: (value: string) => void
  label: string
}

function RollerColumn({ items, value, onSelect, label }: RollerColumnProps) {
  const ref = useRef<HTMLDivElement>(null)
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // Rola até o item selecionado na montagem
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const idx = Math.max(0, items.indexOf(value))
    el.scrollTop = idx * ITEM_HEIGHT
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Quando o valor muda externamente, rola até ele
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const idx = Math.max(0, items.indexOf(value))
    const currentIdx = Math.round(el.scrollTop / ITEM_HEIGHT)
    if (currentIdx !== idx) {
      el.scrollTo({ top: idx * ITEM_HEIGHT, behavior: "smooth" })
    }
  }, [value, items])

  const handleScroll = useCallback(() => {
    clearTimeout(scrollTimeoutRef.current)
    scrollTimeoutRef.current = setTimeout(() => {
      const el = ref.current
      if (!el) return
      const idx = Math.round(el.scrollTop / ITEM_HEIGHT)
      const clamped = Math.max(0, Math.min(idx, items.length - 1))
      el.scrollTo({ top: clamped * ITEM_HEIGHT, behavior: "smooth" })
      onSelect(items[clamped])
    }, 120)
  }, [items, onSelect])

  return (
    <div className="flex flex-col items-center gap-1 flex-1">
      <span className="text-[9px] font-black uppercase tracking-widest text-stone-400">{label}</span>
      <div className="relative w-full" style={{ height: ITEM_HEIGHT * 3 }}>
        {/* Gradiente topo */}
        <div
          className="absolute inset-x-0 top-0 z-10 pointer-events-none"
          style={{
            height: ITEM_HEIGHT,
            background: "linear-gradient(to bottom, white 30%, transparent 100%)",
          }}
        />
        {/* Gradiente base */}
        <div
          className="absolute inset-x-0 bottom-0 z-10 pointer-events-none"
          style={{
            height: ITEM_HEIGHT,
            background: "linear-gradient(to top, white 30%, transparent 100%)",
          }}
        />
        {/* Indicador de seleção */}
        <div
          className="absolute inset-x-1 z-0 rounded-xl bg-stone-800"
          style={{ top: ITEM_HEIGHT, height: ITEM_HEIGHT }}
        />

        <div
          ref={ref}
          className="h-full overflow-y-scroll"
          style={{
            scrollSnapType: "y mandatory",
            scrollbarWidth: "none",
            msOverflowStyle: "none",
          } as React.CSSProperties}
          onScroll={handleScroll}
        >
          {/* Padding superior para centralizar o primeiro item */}
          <div style={{ height: ITEM_HEIGHT, flexShrink: 0 }} />

          {items.map((item) => (
            <div
              key={item}
              style={{ scrollSnapAlign: "center", height: ITEM_HEIGHT }}
              className="flex items-center justify-center cursor-pointer select-none"
              onClick={() => {
                const idx = items.indexOf(item)
                ref.current?.scrollTo({ top: idx * ITEM_HEIGHT, behavior: "smooth" })
                onSelect(item)
              }}
            >
              <span
                className={cn(
                  "font-black transition-all duration-150 leading-none",
                  value === item
                    ? "text-white text-3xl"
                    : "text-stone-300 text-xl"
                )}
              >
                {item}
              </span>
            </div>
          ))}

          {/* Padding inferior */}
          <div style={{ height: ITEM_HEIGHT, flexShrink: 0 }} />
        </div>
      </div>
    </div>
  )
}

interface TimeRollerProps {
  value: string // formato "HH:mm"
  onChange: (value: string) => void
}

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"))
const MINUTES = ["00", "10", "20", "30", "40", "50"]

export function TimeRoller({ value, onChange }: TimeRollerProps) {
  const parts = value ? value.split(":") : ["07", "00"]
  const h = HOURS.includes(parts[0]) ? parts[0] : "07"
  const m = MINUTES.includes(parts[1]) ? parts[1] : "00"

  return (
    <div className="flex items-center gap-2 bg-white rounded-2xl border border-stone-200 shadow-sm px-3 py-3">
      <RollerColumn
        items={HOURS}
        value={h}
        label="Hora"
        onSelect={(newH) => onChange(`${newH}:${m}`)}
      />

      <div className="flex flex-col items-center pb-1 gap-2">
        <div className="w-1.5 h-1.5 rounded-full bg-stone-300" />
        <div className="w-1.5 h-1.5 rounded-full bg-stone-300" />
      </div>

      <RollerColumn
        items={MINUTES}
        value={m}
        label="Min"
        onSelect={(newM) => onChange(`${h}:${newM}`)}
      />
    </div>
  )
}
