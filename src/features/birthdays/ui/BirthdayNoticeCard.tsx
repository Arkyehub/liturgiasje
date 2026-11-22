"use client"

import { useState } from "react"
import { Cake, Check, ChevronDown, PartyPopper } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/ui/avatar"
import { getAvatarColor, getInitials } from "@/shared/lib/avatar-utils"
import { cn } from "@/shared/lib/utils"

interface BirthdayNoticeCardProps {
  id: string
  fullName: string
  avatarUrl?: string | null
  isOwn: boolean
  isRead: boolean
  onConfirm: (id: string) => void
}

function firstName(fullName: string) {
  return fullName.trim().split(/\s+/)[0] || fullName
}

export function BirthdayNoticeCard({ id, fullName, avatarUrl, isOwn, isRead, onConfirm }: BirthdayNoticeCardProps) {
  const [open, setOpen] = useState(false)
  const name = firstName(fullName)
  const title = isOwn ? `Feliz aniversário, ${name}!` : `Aniversário de ${name}`
  const { bg, text } = getAvatarColor(fullName)

  if (isRead) {
    return (
      <article id={`ann-${id}`} className="overflow-hidden rounded-[20px] border border-[#E9DFCB] bg-[#F4EEDD]">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex w-full items-center gap-3 px-4 py-4 text-left"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#E6F2EA] text-[#1E6B43]">
            <Check className="h-[18px] w-[18px]" strokeWidth={3} />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="line-clamp-1 text-[15px] font-extrabold leading-tight text-[#4A3D31]">{title}</span>
            <span className="truncate text-[11px] font-medium text-[#7D6E5D]">Liturgia SJE · hoje</span>
          </span>
          <span className="shrink-0 rounded-full bg-[#E6F2EA] px-2.5 py-1 text-[11px] font-extrabold tracking-wider text-[#1E6B43]">VISTO</span>
          <ChevronDown className={cn("h-4 w-4 shrink-0 text-[#7D6E5D] transition-transform", open && "rotate-180")} />
        </button>
        {open && (
          <p className="px-4 pb-4 text-[15px] leading-relaxed text-[#3A2E24]">
            {isOwn ? "Hoje é o seu dia! Que Deus abençoe a sua vida." : `Hoje é aniversário de ${name}. Que Deus abençoe a vida de ${name}!`}
          </p>
        )}
      </article>
    )
  }

  return (
    <article id={`ann-${id}`} className="overflow-hidden rounded-3xl border border-[#E9DFCB] bg-white shadow-[0_6px_22px_rgba(50,33,19,0.07)]">
      <div className="flex items-start gap-3 px-4 pt-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-[#FDF1D6] text-[#7A4F00]">
          <Cake className="h-5 w-5" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="line-clamp-2 text-[17px] font-extrabold leading-tight text-[#241A10]">{title}</span>
          <span className="truncate text-[11px] font-medium text-[#7D6E5D]">Liturgia SJE · hoje</span>
        </span>
        <span className="shrink-0 rounded-full bg-[#322113] px-2.5 py-1 text-[11px] font-extrabold tracking-wider text-[#FFF8E8]">NOVO</span>
      </div>

      <div className="flex flex-col items-center gap-3 px-4 pb-4 pt-5 text-center">
        <div className="relative">
          <Avatar className="size-[84px] border-[3px] border-[#E8B21E] ring-4 ring-[#FBF1D2]">
            {avatarUrl && <AvatarImage src={avatarUrl} alt={fullName} />}
            <AvatarFallback className={cn("text-2xl font-extrabold", bg, text)}>{getInitials(fullName)}</AvatarFallback>
          </Avatar>
          <span className="absolute -right-2 -top-2 flex h-8 w-8 items-center justify-center rounded-full bg-[#322113] text-[#E8C76A]">
            <PartyPopper className="h-4 w-4" />
          </span>
        </div>
        <h3 className="text-[19px] font-black leading-tight text-[#241A10]">{isOwn ? "Hoje é o seu dia!" : `Hoje é aniversário de ${name}!`}</h3>
        <p className="text-[15px] leading-relaxed text-[#3A2E24]">
          {isOwn
            ? "A comunidade da Liturgia SJE deseja a você um dia abençoado."
            : `Deixe uma mensagem de carinho para ${name} quando encontrar.`}
        </p>
        <button
          type="button"
          onClick={() => onConfirm(id)}
          className="mt-1 h-12 w-full rounded-2xl bg-[#322113] text-[15px] font-extrabold text-[#FFF8E8] transition-transform active:scale-[0.98]"
        >
          Confirmar leitura
        </button>
        <span className="text-[11px] font-medium text-[#7D6E5D]">Ao confirmar, o recado vai para os já lidos.</span>
      </div>
    </article>
  )
}
