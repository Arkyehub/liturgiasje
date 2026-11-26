"use client"

import { useRef } from "react"

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/shared/ui/dialog"

interface LegacyPublishedNoticeProps {
  count: number
  /** Nome do mês em minúsculas, ex.: "dezembro". */
  monthName: string
  onInclude: () => void
  onKeep: () => void
}

/**
 * @deprecated Fluxo antigo "incluir/manter" (despublicava ao salvar). Mantido só para a página atual compilar;
 * a Task 7b remove este componente e usa o PublishedNotice informativo.
 *
 * Aviso de missas já publicadas no mês. Não grava nada: só decide como elas entram no planejamento.
 * Usa o Dialog compartilhado: o foco entra na opção segura ("Manter somente leitura"), fica preso no
 * diálogo e volta a quem o abriu. Esc equivale à opção segura (nunca a "Incluir", que despublica ao
 * salvar) e o clique fora não fecha: a decisão só vem de um botão ou do Esc.
 */
export function LegacyPublishedNotice({ count, monthName, onInclude, onKeep }: LegacyPublishedNoticeProps) {
  const keepRef = useRef<HTMLButtonElement>(null)
  const one = count === 1
  return (
    <Dialog open onOpenChange={(open) => !open && onKeep()} disablePointerDismissal>
      <DialogContent
        role="alertdialog"
        showCloseButton={false}
        initialFocus={keepRef}
        className="z-[60] max-w-md gap-0 rounded-3xl border border-stone-100 bg-white p-5 shadow-xl ring-0 sm:max-w-md"
      >
        <DialogTitle className="text-lg font-black leading-normal tracking-tight text-stone-800">
          {one ? "Missa publicada" : "Missas publicadas"}
        </DialogTitle>
        <p className="mt-2 text-[15px] font-medium leading-snug text-stone-700">
          {one
            ? `Existe 1 missa publicada em ${monthName}. Deseja incluí-la no planejamento? Ela voltará a rascunho.`
            : `Existem ${count} missas publicadas em ${monthName}. Deseja incluí-las no planejamento? Elas voltarão a rascunho.`}
        </p>
        <DialogDescription className="mt-2 text-sm leading-snug text-stone-500">
          Ao salvar como rascunho, os leitores deixam de ver {one ? "essa missa" : "essas missas"} e os lembretes
          automáticos param até a nova publicação. Nada é gravado agora; quem já está escalado continua travado.
        </DialogDescription>
        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={onInclude}
            className="min-h-12 rounded-2xl bg-stone-800 px-4 text-[15px] font-bold text-white transition-transform active:scale-95"
          >
            Incluir no planejamento
          </button>
          <button
            ref={keepRef}
            type="button"
            onClick={onKeep}
            className="min-h-12 rounded-2xl border border-stone-200 bg-white px-4 text-[15px] font-bold text-stone-700 transition-transform active:scale-95"
          >
            Manter somente leitura
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

interface PublishedNoticeProps {
  count: number
  /** Nome do mês em minúsculas, ex.: "dezembro". */
  monthName: string
  /** Datas das missas publicadas já formatadas (ex.: "05/12"). */
  dates: string[]
  onAcknowledge: () => void
}

/**
 * Alerta informativo: as missas publicadas do mês aparecem somente leitura no planejamento e só mudam
 * depois de voltarem a rascunho na tela de Escala. Único botão "Entendi"; Esc faz o mesmo e o clique fora não fecha.
 */
export function PublishedNotice({ count, monthName, dates, onAcknowledge }: PublishedNoticeProps) {
  const okRef = useRef<HTMLButtonElement>(null)
  const one = count === 1
  const list = dates.length > 0 ? ` (${dates.join(", ")})` : ""
  return (
    <Dialog open onOpenChange={(open) => !open && onAcknowledge()} disablePointerDismissal>
      <DialogContent
        role="alertdialog"
        showCloseButton={false}
        initialFocus={okRef}
        className="z-[60] max-w-md gap-0 rounded-3xl border border-stone-100 bg-white p-5 shadow-xl ring-0 sm:max-w-md"
      >
        <DialogTitle className="text-lg font-black leading-normal tracking-tight text-stone-800">
          {one ? "Missa publicada" : "Missas publicadas"}
        </DialogTitle>
        <DialogDescription className="mt-2 text-[15px] font-medium leading-snug text-stone-700">
          {one
            ? `Já existe 1 missa publicada em ${monthName}${list}. Ela não pode ser alterada no planejamento. Para mexer nela, transforme-a em rascunho na tela de Escala.`
            : `Já existem ${count} missas publicadas em ${monthName}${list}. Elas não podem ser alteradas no planejamento. Para mexer nelas, transforme-as em rascunho na tela de Escala.`}
        </DialogDescription>
        <div className="mt-5 flex flex-col gap-2">
          <button
            ref={okRef}
            type="button"
            onClick={onAcknowledge}
            className="min-h-12 rounded-2xl bg-stone-800 px-4 text-[15px] font-bold text-white transition-transform active:scale-95"
          >
            Entendi
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
