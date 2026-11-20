interface MassSummaryGridProps {
  /** Ex.: "dom, 23/11" */
  dateLabel?: string
  /** Ex.: "09:00" */
  time?: string
  /** Ex.: "1ª Leitura" */
  role?: string
  /** Ex.: "Solenidade de Cristo Rei" */
  celebration?: string
}

/** Resumo da missa (data, horário, função e celebração) usado nos drawers de confirmar, pedir troca e assumir. */
export function MassSummaryGrid({ dateLabel, time, role, celebration }: MassSummaryGridProps) {
  const cell = (label: string, value: string | undefined, extra?: string) => (
    <div className="min-w-0">
      <dt className="text-[11px] font-bold uppercase tracking-wide text-[#6B5D50]">{label}</dt>
      <dd className={`truncate text-sm font-extrabold text-black ${extra ?? ""}`}>{value || "—"}</dd>
    </div>
  )
  return (
    <dl className="grid grid-cols-2 gap-2 rounded-2xl border border-[#E9DFCB] bg-[#FAF5E6] p-3 text-left">
      {cell("Data", dateLabel, "capitalize")}
      {cell("Horário", time)}
      {cell("Função", role)}
      {cell("Celebração", celebration)}
    </dl>
  )
}
