"use client"

import { useId } from "react"

interface PublishedNoticeProps {
  count: number
  /** Nome do mês em minúsculas, ex.: "dezembro". */
  monthName: string
  onInclude: () => void
  onKeep: () => void
}

/** Aviso de missas já publicadas no mês. Não grava nada: só decide como elas entram no planejamento. */
export function PublishedNotice({ count, monthName, onInclude, onKeep }: PublishedNoticeProps) {
  const titleId = useId()
  const descId = useId()
  const one = count === 1
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-stone-900/40 p-4 animate-in fade-in duration-200 sm:items-center">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="w-full max-w-md rounded-3xl border border-stone-100 bg-white p-5 shadow-xl animate-in slide-in-from-bottom-4 duration-200"
      >
        <h2 id={titleId} className="text-lg font-black tracking-tight text-stone-800">
          {one ? "Missa publicada" : "Missas publicadas"}
        </h2>
        <p className="mt-2 text-[15px] font-medium leading-snug text-stone-700">
          {one
            ? `Existe 1 missa publicada em ${monthName}. Deseja incluí-la no planejamento? Ela voltará a rascunho.`
            : `Existem ${count} missas publicadas em ${monthName}. Deseja incluí-las no planejamento? Elas voltarão a rascunho.`}
        </p>
        <p id={descId} className="mt-2 text-sm leading-snug text-stone-500">
          Ao salvar como rascunho, os leitores deixam de ver {one ? "essa missa" : "essas missas"} e os lembretes
          automáticos param até a nova publicação. Nada é gravado agora; quem já está escalado continua travado.
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={onInclude}
            className="min-h-12 rounded-2xl bg-stone-800 px-4 text-[15px] font-bold text-white transition-transform active:scale-95"
          >
            Incluir no planejamento
          </button>
          <button
            type="button"
            onClick={onKeep}
            className="min-h-12 rounded-2xl border border-stone-200 bg-white px-4 text-[15px] font-bold text-stone-700 transition-transform active:scale-95"
          >
            Manter somente leitura
          </button>
        </div>
      </div>
    </div>
  )
}
