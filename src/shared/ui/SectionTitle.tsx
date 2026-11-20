import { cn } from "@/shared/lib/utils"

interface SectionTitleProps {
  children: React.ReactNode
  className?: string
}

/** Título de seção centralizado com o traço dourado da identidade visual. */
export function SectionTitle({ children, className }: SectionTitleProps) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <h2 className={cn("text-xl font-black tracking-tight text-stone-800 text-center", className)}>
        {children}
      </h2>
      <span aria-hidden="true" className="h-[3px] w-8 rounded-full bg-[#E8B21E]" />
    </div>
  )
}
