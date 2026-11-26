"use client"

import { useState } from "react"
import { addDays, format, getDay, getDaysInMonth, startOfMonth } from "date-fns"
import { Trash2 } from "lucide-react"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/shared/ui/sheet"
import { TimeRoller } from "@/shared/ui/TimeRoller"
import type { PlanMass, PlanSlot, RoleCode } from "../lib/types"

interface MassSheetProps {
  month: Date
  /** Missa em edição; sem ela, cria. */
  mass?: PlanMass
  /** Datas/horários das OUTRAS missas do plano (a missa editada não entra). */
  existing: { date: string; time: string }[]
  onSave: (masses: PlanMass[]) => void
  onRemove?: () => void
  onClose: () => void
}

const ROLES: { code: RoleCode; label: string }[] = [
  { code: "C", label: "Comentarista" },
  { code: "1L", label: "1ª Leitura" },
  { code: "2L", label: "2ª Leitura" },
  { code: "L", label: "Leitura única" },
  { code: "P", label: "Preces" },
]
const SHORTCUTS = ["07:00", "09:00", "11:00", "19:00"]

function defaultRoles(date: string): RoleCode[] {
  if (!date) return []
  return new Date(`${date}T00:00:00`).getDay() === 0 ? ["C", "1L", "2L", "P"] : ["C", "L"]
}

function sundaysOf(month: Date): string[] {
  const first = startOfMonth(month)
  const out: string[] = []
  for (let i = 0; i < getDaysInMonth(first); i++) {
    const d = addDays(first, i)
    if (getDay(d) === 0) out.push(format(d, "yyyy-MM-dd"))
  }
  return out
}

const br = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`

export function MassSheet({ month, mass, existing, onSave, onRemove, onClose }: MassSheetProps) {
  const editing = !!mass
  const [date, setDate] = useState(mass?.date ?? "")
  const [time, setTime] = useState(mass?.time ?? "19:00")
  const [custom, setCustom] = useState(!!mass && !SHORTCUTS.includes(mass.time))
  const [roles, setRoles] = useState<RoleCode[]>(mass ? mass.slots.map((s) => s.role) : [])
  const [touched, setTouched] = useState(editing)
  const [description, setDescription] = useState(mass?.description ?? "")
  const [repeat, setRepeat] = useState(false)

  const monthKey = format(month, "yyyy-MM")
  const isSunday = !!date && new Date(`${date}T00:00:00`).getDay() === 0
  const repeating = repeat && isSunday && !editing
  const dates = !date ? [] : repeating ? sundaysOf(month) : [date]
  const conflicts = dates.filter((d) => existing.some((e) => e.date === d && e.time === time))
  const canSave = dates.length > 0 && roles.length > 0 && conflicts.length === 0

  const pickDate = (value: string) => {
    setDate(value)
    if (!touched) setRoles(defaultRoles(value))
    if (value && new Date(`${value}T00:00:00`).getDay() !== 0) setRepeat(false)
  }

  const toggleRole = (code: RoleCode) => {
    setTouched(true)
    setRoles((prev) => {
      if (prev.includes(code)) return prev.filter((r) => r !== code)
      const next = code === "L" ? prev.filter((r) => r !== "1L" && r !== "2L") : code === "1L" || code === "2L" ? prev.filter((r) => r !== "L") : prev
      return ROLES.map((r) => r.code).filter((r) => r === code || next.includes(r))
    })
  }

  const save = () => {
    if (!canSave) return
    const slotsFor = (): PlanSlot[] =>
      roles.map((code) => mass?.slots.find((s) => s.role === code) ?? { role: code, profileId: "", locked: false })
    if (mass) {
      onSave([{ ...mass, date, time, description: description.trim(), slots: slotsFor() }])
      return
    }
    onSave(
      dates.map((d) => ({
        key: `${d}_${time}`,
        date: d,
        time,
        description: description.trim(),
        wasPublished: false,
        readOnly: false,
        slots: slotsFor(),
      })),
    )
  }

  const chip = (active: boolean) =>
    `flex min-h-11 min-w-14 items-center justify-center rounded-2xl border px-3 text-[15px] font-bold tabular-nums transition-transform active:scale-95 ${
      active ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 bg-white text-stone-800"
    }`
  const saveLabel = repeating ? `Salvar ${dates.length} missas` : "Salvar missa"

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" className="max-h-[92vh] gap-0 overflow-y-auto rounded-t-[28px] bg-white p-0 sm:mx-auto sm:max-w-md">
        <SheetHeader className="gap-1 px-5 pb-2 pt-5">
          <SheetTitle className="text-xl font-black tracking-tight text-stone-900">{editing ? "Editar missa" : "Nova missa"}</SheetTitle>
          <SheetDescription className="text-xs text-stone-600">Funções já vêm marcadas pelo dia; ajuste se precisar.</SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-5 px-5 pb-4 pt-2">
          <label className="flex flex-col gap-1.5 text-sm font-bold text-stone-800">
            Dia
            <input
              type="date"
              value={date}
              min={`${monthKey}-01`}
              max={`${monthKey}-${String(getDaysInMonth(month)).padStart(2, "0")}`}
              onChange={(e) => pickDate(e.target.value)}
              className="min-h-11 rounded-2xl border border-stone-300 bg-white px-3 text-[15px] font-semibold text-stone-900"
            />
          </label>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1.5 text-sm font-bold text-stone-800">Horário</legend>
            <div className="flex flex-wrap gap-2">
              {SHORTCUTS.map((t) => (
                <button key={t} type="button" aria-pressed={!custom && time === t} onClick={() => { setTime(t); setCustom(false) }} className={chip(!custom && time === t)}>
                  {t}
                </button>
              ))}
              <button type="button" aria-pressed={custom} onClick={() => setCustom(true)} className={chip(custom)}>
                Outro
              </button>
            </div>
            {custom && (
              <div className="flex justify-center pt-1">
                <TimeRoller value={time} onChange={setTime} />
              </div>
            )}
          </fieldset>

          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 text-sm font-bold text-stone-800">Funções</legend>
            {ROLES.map(({ code, label }) => (
              <label key={code} className="flex min-h-11 items-center gap-3 text-[15px] font-semibold text-stone-900">
                <input
                  type="checkbox"
                  aria-label={`${code} - ${label}`}
                  checked={roles.includes(code)}
                  onChange={() => toggleRole(code)}
                  className="h-5 w-5 accent-stone-900"
                />
                <span className="w-8 font-black">{code}</span>
                <span className="text-stone-600">{label}</span>
              </label>
            ))}
          </fieldset>

          <label className="flex flex-col gap-1.5 text-sm font-bold text-stone-800">
            Descrição especial (opcional)
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex.: Imaculada Conceição"
              className="min-h-11 rounded-2xl border border-stone-300 px-3 text-[15px] font-medium text-stone-900"
            />
          </label>

          {!editing && (
            <label className={`flex min-h-11 items-center gap-3 text-[15px] font-semibold ${isSunday ? "text-stone-900" : "text-stone-400"}`}>
              <input
                type="checkbox"
                checked={repeat && isSunday}
                disabled={!isSunday}
                onChange={(e) => setRepeat(e.target.checked)}
                className="h-5 w-5 accent-stone-900"
              />
              Repetir em todos os domingos do mês
            </label>
          )}

          {conflicts.length > 0 && (
            <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
              Já existe missa às {time} em {conflicts.map(br).join(", ")}. Mude o horário ou o dia.
            </p>
          )}
        </div>

        <div className="sticky bottom-0 flex flex-col gap-2 border-t border-stone-200 bg-white px-5 py-4">
          <button
            type="button"
            onClick={save}
            disabled={!canSave}
            className="min-h-12 rounded-2xl bg-stone-900 px-5 text-[15px] font-bold text-white transition-transform active:scale-95 disabled:opacity-40"
          >
            {saveLabel}
          </button>
          {editing && onRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-red-200 text-[15px] font-bold text-red-700 transition-transform active:scale-95"
            >
              <Trash2 className="h-4 w-4" />
              Remover missa
            </button>
          )}
          <button type="button" onClick={onClose} className="min-h-11 text-sm font-bold text-stone-600">
            Cancelar
          </button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
