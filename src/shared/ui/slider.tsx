"use client"

import * as React from "react"
import { cn } from "@/shared/lib/utils"

interface SliderProps {
  className?: string
  value?: number[]
  defaultValue?: number[]
  min?: number
  max?: number
  step?: number
  onValueChange?: (value: number[]) => void
}

const Slider = React.forwardRef<HTMLInputElement, SliderProps>(
  ({ className, value, defaultValue, min = 0, max = 100, step = 1, onValueChange, ...props }, ref) => {
    // Como o input nativo usa apenas um número, pegamos o primeiro do array
    const currentValue = value?.[0] ?? defaultValue?.[0] ?? min

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = parseFloat(e.target.value)
      onValueChange?.([newValue])
    }

    // Cálculo da porcentagem para o preenchimento da barra
    const percentage = ((currentValue - min) / (max - min)) * 100

    return (
      <div className={cn("relative flex w-full touch-none select-none items-center py-4", className)}>
        <div className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-stone-100">
          <div 
            className="absolute h-full bg-stone-800 transition-all" 
            style={{ width: `${percentage}%` }}
          />
        </div>
        <input
          type="range"
          ref={ref}
          min={min}
          max={max}
          step={step}
          value={currentValue}
          onChange={handleChange}
          className={cn(
            "absolute h-1.5 w-full cursor-pointer appearance-none bg-transparent",
            "active:cursor-grabbing",
            // Estilos para o thumb (bolinha) - cross-browser
            "[&::-webkit-slider-thumb]:appearance-none",
            "[&::-webkit-slider-thumb]:h-5",
            "[&::-webkit-slider-thumb]:w-5",
            "[&::-webkit-slider-thumb]:rounded-full",
            "[&::-webkit-slider-thumb]:border-2",
            "[&::-webkit-slider-thumb]:border-stone-800",
            "[&::-webkit-slider-thumb]:bg-white",
            "[&::-webkit-slider-thumb]:shadow-lg",
            "[&::-webkit-slider-thumb]:transition-all",
            "[&::-webkit-slider-thumb]:hover:scale-110",
            "[&::-webkit-slider-thumb]:active:scale-95",
            
            "[&::-moz-range-thumb]:h-5",
            "[&::-moz-range-thumb]:w-5",
            "[&::-moz-range-thumb]:rounded-full",
            "[&::-moz-range-thumb]:border-2",
            "[&::-moz-range-thumb]:border-stone-800",
            "[&::-moz-range-thumb]:bg-white",
            "[&::-moz-range-thumb]:shadow-lg",
            "[&::-moz-range-thumb]:transition-all",
            "[&::-moz-range-thumb]:hover:scale-110",
            "[&::-moz-range-thumb]:active:scale-95"
          )}
          {...props}
        />
      </div>
    )
  }
)

Slider.displayName = "Slider"

export { Slider }
