"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Cake, Loader2 } from "lucide-react"
import { useAuth } from "@/shared/hooks/useAuth"
import { useUser } from "@/features/profile/hooks/useUser"
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/ui/avatar"
import { getAvatarColor, getInitials } from "@/shared/lib/avatar-utils"
import { cn } from "@/shared/lib/utils"
import {
  MONTH_NAMES,
  WEEKDAY_ABBR,
  getSaoPauloNow,
  groupBirthdaysByMonth,
  weekdayOf,
} from "@/features/birthdays/lib/birthdays"

function Balloon({ color, className, style }: { color: string; className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 40 70" className={cn("absolute", className)} style={style} aria-hidden="true">
      <path d="M20 58 C19 62 22 64 20 68" stroke="#E8C76A" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      <ellipse cx="20" cy="26" rx="17" ry="22" fill={color} />
      <path d="M17 47 L20 52 L23 47 Z" fill={color} />
      <ellipse cx="13" cy="17" rx="4" ry="7" fill="#fff" opacity="0.28" transform="rotate(-18 13 17)" />
    </svg>
  )
}

export default function BirthdaysPage() {
  const { user, loading } = useAuth()
  const { birthdays, loadBirthdays } = useUser()
  const router = useRouter()
  const [now] = useState(() => getSaoPauloNow())

  useEffect(() => {
    if (!loading && !user) router.push("/")
  }, [loading, user, router])

  useEffect(() => {
    if (user) loadBirthdays()
  }, [user, loadBirthdays])

  const groups = useMemo(() => groupBirthdaysByMonth(birthdays), [birthdays])
  const total = groups.reduce((sum, g) => sum + g.entries.length, 0)

  if (loading || !user) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#FAF5E6]">
        <Loader2 className="h-8 w-8 animate-spin text-[#B8A98E]" />
      </div>
    )
  }

  return (
    <div className="relative z-10 flex min-h-screen flex-col bg-[#FAF5E6]">
      <main className="flex-1">
        <section className="relative overflow-hidden bg-[#322113] px-6 pb-14 pt-9">
          <Balloon color="#E8B21E" className="-left-1 top-4 w-11 -rotate-6" />
          <Balloon color="#A23F06" className="left-9 top-14 w-9 rotate-3" />
          <Balloon color="#1E6B43" className="right-9 top-4 w-10 rotate-6" />
          <Balloon color="#E8C76A" className="-right-1 top-14 w-11 -rotate-3" />
          <div className="relative mx-auto max-w-md text-center">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-[#E8B21E]">Lista de aniversários</p>
            <h1 className="mt-2 text-[30px] font-black leading-tight text-white">Aniversariantes de {now.year}</h1>
            <p className="mt-1 text-sm text-[#E8C76A]">{total} {total === 1 ? "leitor" : "leitores"}</p>
          </div>
          <svg viewBox="0 0 400 24" preserveAspectRatio="none" className="absolute inset-x-0 bottom-0 h-6 w-full" aria-hidden="true">
            <path d="M0 24 V12 Q100 -4 200 12 T400 12 V24 Z" fill="#FAF5E6" />
          </svg>
        </section>

        <div className="container mx-auto max-w-md space-y-4 px-4 pb-20 pt-2">
          {groups.length === 0 && (
            <p className="py-10 text-center text-sm text-[#7D6E5D]">Nenhum aniversário cadastrado ainda.</p>
          )}

          {groups.map((group) => {
            const isCurrent = group.month === now.month
            return (
              <section
                key={group.month}
                aria-label={MONTH_NAMES[group.month - 1]}
                className={cn(
                  "overflow-hidden rounded-3xl bg-white",
                  isCurrent ? "border-2 border-[#E8B21E] ring-4 ring-[#FBF1D2]" : "border border-[#E9DFCB]"
                )}
              >
                <header className="flex items-center gap-2.5 px-4 pb-2 pt-4">
                  <h2 className="text-[17px] font-extrabold text-[#241A10]">{MONTH_NAMES[group.month - 1]}</h2>
                  {isCurrent && (
                    <span className="rounded-full bg-[#322113] px-2.5 py-1 text-[10px] font-extrabold tracking-wider text-[#FFF8E8]">ESTE MÊS</span>
                  )}
                  <span className="ml-auto rounded-full bg-[#F4EEDD] px-2.5 py-1 text-xs font-extrabold text-[#6B5D50]">{group.entries.length}</span>
                </header>
                <ul className="flex flex-col pb-2">
                  {group.entries.map(({ member, day }) => {
                    const isToday = isCurrent && day === now.day
                    const isPast = isCurrent && day < now.day
                    const { bg, text } = getAvatarColor(member.fullName)
                    return (
                      <li
                        key={member.id}
                        className={cn("mx-2 flex items-center gap-3 rounded-2xl px-2 py-2", isToday && "bg-[#FDF1D6]")}
                      >
                        <span
                          className={cn(
                            "flex h-[46px] w-11 shrink-0 flex-col items-center justify-center rounded-xl leading-none",
                            isToday ? "bg-[#322113] text-[#FFF8E8]" : "bg-[#F4EEDD] text-[#322113]"
                          )}
                        >
                          <span className="text-[17px] font-black">{day}</span>
                          <span className="mt-0.5 text-[10px] font-bold uppercase opacity-70">
                            {WEEKDAY_ABBR[weekdayOf(now.year, { day, month: group.month })]}
                          </span>
                        </span>
                        <Avatar className="size-[38px]">
                          {member.avatarUrl && <AvatarImage src={member.avatarUrl} alt="" />}
                          <AvatarFallback className={cn("text-xs font-bold", bg, text)}>{getInitials(member.fullName)}</AvatarFallback>
                        </Avatar>
                        <span className={cn("min-w-0 flex-1 truncate text-[15px] font-bold", isPast ? "text-[#7D6E5D]" : "text-[#241A10]")}>
                          {member.fullName}
                        </span>
                        {isToday && (
                          <span className="flex shrink-0 items-center gap-1 rounded-full bg-[#E8B21E] px-2.5 py-1 text-[10px] font-extrabold tracking-wider text-[#322113]">
                            <Cake className="h-3 w-3" /> HOJE
                          </span>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </section>
            )
          })}
        </div>
      </main>
    </div>
  )
}
