"use client"

import { useMemo, useState } from "react"
import { format, parseISO, differenceInYears, isValid } from "date-fns"
import { ptBR } from "date-fns/locale"
import {
  BookOpen,
  CalendarCheck,
  CalendarX,
  Cake,
  Clock,
  History,
  Link2,
  Mail,
  MessageSquare,
  UserCheck,
} from "lucide-react"
import { Profile } from "@/domain/models/Profile"
import { MemberReading } from "@/domain/models/Schedule"
import { Badge } from "@/shared/ui/badge"
import { Button } from "@/shared/ui/button"
import { Calendar } from "@/shared/ui/calendar"
import { UserAvatar } from "@/shared/ui/UserAvatar"
import { cn } from "@/shared/lib/utils"

export const ROLE_LABELS: Record<string, string> = {
  C: "Comentarista",
  "1L": "1ª Leitura",
  "2L": "2ª Leitura",
  P: "Preces",
  L: "Leitor",
}

// O app guarda as preferências com a chave "6" para Domingo (ver ScheduleForm.checkPreference).
const WEEKDAYS: Record<string, string> = { "0": "Domingo", "1": "Segunda", "2": "Terça", "3": "Quarta", "4": "Quinta", "5": "Sexta", "6": "Domingo" }
const PAGE_SIZE = 10

interface MemberAnalysisViewProps {
  profile: Profile
  readings: MemberReading[]
  unavailableDates: string[] // yyyy-MM-dd
  /** Data de referência (yyyy-MM-dd). Permite testes e capturas determinísticas. */
  today?: string
}

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1)

function SectionLabel({ icon: Icon, children }: { icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-stone-400">
      <Icon className="h-3 w-3" />
      <span className="text-[10px] font-bold uppercase tracking-widest">{children}</span>
    </div>
  )
}

function InfoRow({
  icon,
  label,
  children,
}: {
  icon: React.ElementType
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <SectionLabel icon={icon}>{label}</SectionLabel>
      <div className="text-sm font-medium text-stone-800 break-words">{children}</div>
    </div>
  )
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-stone-100 bg-stone-50/50 p-4 space-y-1">
      <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">{label}</p>
      <p className="text-2xl font-black tracking-tight text-stone-800 leading-none">{value}</p>
      {hint && <p className="text-[11px] text-stone-500 truncate">{hint}</p>}
    </div>
  )
}

function ReadingRow({ reading, upcoming }: { reading: MemberReading; upcoming?: boolean }) {
  const date = parseISO(reading.date)
  return (
    <div className="flex items-center gap-3 py-2.5">
      <div className="flex w-12 shrink-0 items-baseline gap-1">
        <span className={cn("text-sm font-black leading-none", upcoming ? "text-amber-700" : "text-stone-800")}>{format(date, "dd")}</span>
        <span className="text-[9px] font-bold uppercase tracking-wider text-stone-400">
          {format(date, "EEEE", { locale: ptBR }).slice(0, 3)}
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-stone-800">{ROLE_LABELS[reading.role] ?? reading.role}</p>
        {(reading.isSwapTakeover || reading.specialDescription) && (
          <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
            {reading.isSwapTakeover && (
              <Badge className="shrink-0 border-amber-200 bg-amber-100 px-1.5 py-0 text-[8px] font-bold uppercase tracking-wider text-amber-700 hover:bg-amber-100">
                Troca
              </Badge>
            )}
            {reading.specialDescription && <span className="truncate text-[10px] text-stone-400">{reading.specialDescription}</span>}
          </div>
        )}
      </div>

      <span className="shrink-0 text-xs font-medium tabular-nums text-stone-500">{reading.time}</span>
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-green-200 bg-green-50 text-[9px] font-black text-green-700">
        {reading.role}
      </span>
    </div>
  )
}

function ReadingList({ children }: { children: React.ReactNode }) {
  return <div className="divide-y divide-stone-100 rounded-2xl border border-stone-100 bg-white px-3">{children}</div>
}

export function MemberAnalysisView({ profile, readings, unavailableDates, today }: MemberAnalysisViewProps) {
  const todayStr = today ?? format(new Date(), "yyyy-MM-dd")
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  const { past, upcoming } = useMemo(() => {
    const done = readings.filter((r) => r.date < todayStr)
    const next = readings.filter((r) => r.date >= todayStr).sort((a, b) => (a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date)))
    return { past: done, upcoming: next }
  }, [readings, todayStr])

  const topRole = useMemo(() => {
    const counts: Record<string, number> = {}
    past.forEach((r) => (counts[r.role] = (counts[r.role] ?? 0) + 1))
    const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
    return best ? { label: ROLE_LABELS[best[0]] ?? best[0], count: best[1] } : null
  }, [past])

  const pastByMonth = useMemo(() => {
    const groups: { key: string; label: string; items: MemberReading[] }[] = []
    past.slice(0, visibleCount).forEach((reading) => {
      const key = reading.date.slice(0, 7)
      let group = groups.find((g) => g.key === key)
      if (!group) {
        group = { key, label: capitalize(format(parseISO(reading.date), "MMMM 'de' yyyy", { locale: ptBR })), items: [] }
        groups.push(group)
      }
      group.items.push(reading)
    })
    return groups
  }, [past, visibleCount])

  const unavailable = useMemo(
    () => [...new Set(unavailableDates)].sort().map((d) => parseISO(d)).filter(isValid),
    [unavailableDates]
  )
  const upcomingUnavailable = unavailable.filter((d) => format(d, "yyyy-MM-dd") >= todayStr)
  const calendarStart = upcomingUnavailable[0] ?? unavailable[unavailable.length - 1] ?? parseISO(todayStr)

  const birth = profile.birthDate ? parseISO(profile.birthDate) : null
  const age = birth && isValid(birth) ? differenceInYears(parseISO(todayStr), birth) : null
  const prefs = profile.preferences?.day_preferences ?? {}
  const prefEntries = Object.entries(prefs)
    .filter(([, times]) => Array.isArray(times) && times.length > 0)
    .sort((a, b) => Number(a[0]) - Number(b[0]))

  const isArchived = !!profile.archivedAt
  const isPending = !profile.authUserId
  const lastReading = past[0]

  const formatDateTime = (value?: string | null) => {
    if (!value) return null
    const d = new Date(value)
    return isValid(d) ? format(d, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) : null
  }
  const formatDate = (value?: string | null) => {
    if (!value) return null
    const d = new Date(value)
    return isValid(d) ? format(d, "dd/MM/yyyy", { locale: ptBR }) : null
  }

  const whatsappDigits = (profile.whatsapp ?? "").replace(/\D/g, "")

  return (
    <div className="space-y-6">
      {/* Identidade */}
      <section className="space-y-6 rounded-3xl border border-stone-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col items-center gap-3 text-center">
          <UserAvatar name={profile.fullName} src={profile.avatarUrl} isClaimed={!isPending} className="h-24 w-24 text-2xl" />
          <div className="space-y-2">
            <h2 className="text-xl font-black tracking-tight text-stone-800">{profile.fullName}</h2>
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              {profile.role === "admin" ? (
                <Badge className="border-amber-200 bg-amber-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-700 hover:bg-amber-100">
                  Administrador
                </Badge>
              ) : (
                <Badge className="border-green-200 bg-green-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-green-700 hover:bg-green-100">
                  Leitor
                </Badge>
              )}
              {isArchived && (
                <Badge className="border-red-200 bg-red-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-red-700 hover:bg-red-50">
                  Inativo
                </Badge>
              )}
              {isPending && !isArchived && (
                <Badge className="border-stone-200 bg-stone-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-stone-500 hover:bg-stone-100">
                  Pendente
                </Badge>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-5 border-t border-stone-100 pt-5">
          <InfoRow icon={MessageSquare} label="WhatsApp">
            {profile.whatsapp ? (
              whatsappDigits.length >= 10 ? (
                <a href={`https://wa.me/55${whatsappDigits}`} target="_blank" rel="noopener noreferrer" className="underline decoration-stone-300 underline-offset-4">
                  {profile.whatsapp}
                </a>
              ) : (
                profile.whatsapp
              )
            ) : (
              <span className="text-stone-400">Não informado</span>
            )}
          </InfoRow>

          {profile.email && (
            <InfoRow icon={Mail} label="E-mail">
              {profile.email}
            </InfoRow>
          )}

          <InfoRow icon={Cake} label="Data de nascimento">
            {birth && isValid(birth) ? (
              <>
                {format(birth, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                {age !== null && <span className="text-stone-500"> · {age} anos</span>}
              </>
            ) : (
              <span className="text-stone-400">Não informada</span>
            )}
          </InfoRow>

          <InfoRow icon={Clock} label="Horários de preferência">
            {prefEntries.length === 0 ? (
              <span className="text-stone-400">Não informados</span>
            ) : (
              <div className="space-y-2">
                {prefEntries.map(([day, times]) => (
                  <div key={day} className="flex flex-wrap items-center gap-1.5">
                    <span className="mr-1 text-xs font-bold text-stone-500">{WEEKDAYS[day] ?? `Dia ${day}`}</span>
                    {[...times].sort().map((time) => (
                      <span key={time} className="rounded-xl bg-stone-800 px-3 py-1 text-xs font-bold text-white">
                        {time}
                      </span>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </InfoRow>

          <div className="grid grid-cols-2 gap-4 border-t border-stone-100 pt-5">
            <InfoRow icon={UserCheck} label="Cadastro">
              {formatDate(profile.createdAt) ?? "—"}
            </InfoRow>
            <InfoRow icon={Link2} label="Vinculado em">
              {formatDate(profile.claimedAt) ?? <span className="text-stone-400">Ainda não</span>}
            </InfoRow>
            <div className="col-span-2">
              <InfoRow icon={History} label="Último acesso">
                {formatDateTime(profile.lastSeenAt) ?? <span className="text-stone-400">Sem acessos</span>}
              </InfoRow>
            </div>
          </div>

          {isArchived && formatDate(profile.archivedAt) && (
            <p className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-xs font-medium text-red-700">
              Membro inativado em {formatDate(profile.archivedAt)}. Não pode entrar no aplicativo nem ser escalado.
            </p>
          )}
        </div>
      </section>

      {/* Resumo */}
      <section className="grid grid-cols-2 gap-3">
        <Stat label="Leituras realizadas" value={String(past.length)} hint={lastReading ? `Última em ${format(parseISO(lastReading.date), "dd/MM/yyyy")}` : "Nenhuma ainda"} />
        <Stat label="Próximas escalas" value={String(upcoming.length)} hint={upcoming[0] ? `Próxima em ${format(parseISO(upcoming[0].date), "dd/MM/yyyy")}` : "Nada agendado"} />
        <Stat label="Função mais frequente" value={topRole ? String(topRole.count) + "x" : "—"} hint={topRole?.label ?? "Sem histórico"} />
        <Stat label="Indisponibilidades" value={String(unavailable.length)} hint={upcomingUnavailable.length > 0 ? `${upcomingUnavailable.length} pela frente` : "Nenhuma pela frente"} />
      </section>

      {/* Indisponibilidades */}
      <section className="space-y-4 rounded-3xl border border-stone-100 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <SectionLabel icon={CalendarX}>Datas indisponíveis</SectionLabel>
          <Badge variant="outline" className="border-red-200 bg-red-50 text-[10px] font-bold text-red-700">
            {unavailable.length} {unavailable.length === 1 ? "data" : "datas"}
          </Badge>
        </div>

        <div className="flex justify-center rounded-2xl border border-stone-100 bg-white p-1">
          <Calendar
            mode="single"
            locale={ptBR}
            defaultMonth={calendarStart}
            showOutsideDays={false}
            selected={undefined}
            modifiers={{ unavailable }}
            modifiersClassNames={{
              unavailable:
                "bg-red-500 text-white hover:bg-red-500 rounded-lg shadow-sm font-bold",
            }}
            className="cursor-default bg-white [--cell-size:--spacing(9)]"
          />
        </div>

        <div className="flex items-center gap-2 text-[11px] text-stone-500">
          <span className="h-3 w-3 rounded bg-red-500" />
          Dia em que o membro avisou que não poderá participar
        </div>

        {upcomingUnavailable.length > 0 ? (
          <div className="space-y-2 border-t border-stone-100 pt-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Próximas indisponibilidades</p>
            <div className="flex flex-wrap gap-1.5">
              {upcomingUnavailable.slice(0, 12).map((d) => (
                <span key={d.toISOString()} className="rounded-xl border border-red-100 bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700">
                  {format(d, "dd/MM", { locale: ptBR })} · {format(d, "EEEE", { locale: ptBR }).slice(0, 3)}
                </span>
              ))}
              {upcomingUnavailable.length > 12 && (
                <span className="px-1 py-1 text-xs font-medium text-stone-400">+{upcomingUnavailable.length - 12}</span>
              )}
            </div>
          </div>
        ) : (
          <p className="border-t border-stone-100 pt-4 text-xs text-stone-400">Nenhuma indisponibilidade futura registrada.</p>
        )}
      </section>

      {/* Histórico de leituras */}
      <section className="space-y-5 rounded-3xl border border-stone-100 bg-white p-6 shadow-sm">
        {upcoming.length > 0 && (
          <div className="space-y-3">
            <SectionLabel icon={CalendarCheck}>Próximas escalas</SectionLabel>
            <ReadingList>
              {upcoming.map((reading) => (
                <ReadingRow key={reading.slotId} reading={reading} upcoming />
              ))}
            </ReadingList>
          </div>
        )}

        <div className={cn("space-y-3", upcoming.length > 0 && "border-t border-stone-100 pt-5")}>
          <div className="flex items-center justify-between">
            <SectionLabel icon={BookOpen}>Histórico de leituras</SectionLabel>
            <Badge variant="outline" className="border-stone-200 bg-stone-50 text-[10px] font-bold text-stone-600">
              {past.length} {past.length === 1 ? "leitura" : "leituras"}
            </Badge>
          </div>

          {past.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-stone-200 py-8 text-center text-xs text-stone-400">
              Este membro ainda não realizou leituras.
            </p>
          ) : (
            <div className="space-y-4">
              {pastByMonth.map((group) => (
                <div key={group.key} className="space-y-1.5">
                  <p className="text-xs font-bold text-stone-500">{group.label}</p>
                  <ReadingList>
                    {group.items.map((reading) => (
                      <ReadingRow key={reading.slotId} reading={reading} />
                    ))}
                  </ReadingList>
                </div>
              ))}

              {past.length > visibleCount && (
                <Button
                  variant="outline"
                  onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                  className="h-11 w-full rounded-2xl border-stone-200 font-bold text-stone-600"
                >
                  Mostrar mais ({past.length - visibleCount})
                </Button>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
