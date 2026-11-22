"use client"

import { useEffect, useState } from "react"
import { Loader2, X } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { cn } from "@/shared/lib/utils"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/shared/ui/sheet"
import { LiturgyService, LiturgyData } from "@/shared/api/LiturgyService"

interface LiturgySheetProps {
  /** Data da missa no formato YYYY-MM-DD */
  dateKey: string
  /** Texto exibido abaixo do título (ex.: "domingo, 23/11") */
  dateLabel: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Cor litúrgica já conhecida (evita esperar a API para pintar o cabeçalho) */
  color?: string | null
  /** Liturgia já carregada por quem abre o painel */
  preloaded?: LiturgyData | null
}

/** Painel lateral com as leituras do dia. Busca a liturgia ao abrir, se ainda não a tiver. */
export function LiturgySheet({ dateKey, dateLabel, open, onOpenChange, color, preloaded }: LiturgySheetProps) {
  const [liturgyData, setLiturgyData] = useState<LiturgyData | null>(preloaded ?? null)
  const [isLoadingLiturgy, setIsLoadingLiturgy] = useState(false)

  useEffect(() => {
    if (preloaded) setLiturgyData(preloaded)
  }, [preloaded])

  useEffect(() => {
    if (!open || liturgyData) return
    let cancelled = false
    setIsLoadingLiturgy(true)
    LiturgyService.getLiturgyForDate(dateKey)
      .then(data => { if (!cancelled) setLiturgyData(data) })
      .catch(e => console.error(e))
      .finally(() => { if (!cancelled) setIsLoadingLiturgy(false) })
    return () => { cancelled = true }
  }, [open, liturgyData, dateKey])

  const localColor = color ?? liturgyData?.cor ?? null

  return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="!inset-0 !h-dvh !w-screen !max-w-none gap-0 rounded-none border-0 bg-[#FAF5E6] p-0 flex flex-col" showCloseButton={false}>
          {(() => {
            const liturgicalDots: Record<string, string> = {
              Verde: "bg-emerald-500",
              Roxo: "bg-purple-500",
              Vermelho: "bg-red-500",
              Rosa: "bg-pink-400",
              Branco: "bg-stone-100",
            }
            const dot = localColor ? (liturgicalDots[localColor] || "bg-[#E8B21E]") : "bg-[#E8B21E]"

            return (
              <SheetHeader className="relative flex shrink-0 flex-col gap-0 bg-[#322113] px-5 pb-5 pt-[max(1.25rem,env(safe-area-inset-top))] text-left">
                <div className="mb-3 flex items-center gap-2">
                  <span className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-[#E8B21E]">Liturgia diária</span>
                  {localColor && (
                    <span className="ml-1 flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-bold text-[#FFF8E8]">
                      <span className={cn("h-2.5 w-2.5 rounded-full ring-1 ring-white/40", dot)} />
                      {localColor}
                    </span>
                  )}
                  <SheetClose render={
                    <button type="button" aria-label="Fechar leituras" className="ml-auto flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-[#FFF8E8] transition-transform active:scale-95">
                      <X className="h-5 w-5" />
                    </button>
                  } />
                </div>
                <SheetTitle className="text-left text-[22px] font-black leading-snug tracking-tight text-white">
                  {liturgyData?.liturgia || "Liturgia Diária"}
                </SheetTitle>
                <SheetDescription className="mt-1 text-left text-sm font-semibold text-[#E8C76A]">
                  {dateLabel}
                </SheetDescription>
              </SheetHeader>
            )
          })()}

          <div className="mx-auto w-full max-w-2xl flex-1 overflow-y-auto px-4 py-5">
            {isLoadingLiturgy ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-stone-400" />
                <span className="text-xs text-stone-400 font-bold uppercase tracking-wider">Buscando Leituras...</span>
              </div>
            ) : liturgyData ? (
              <div className="space-y-6 text-stone-800 pb-10 font-serif">
                {/* Oração da Coleta */}
                {liturgyData.oracoes?.coleta && (
                  <div className="bg-white p-5 rounded-[24px] border border-[#E9DFCB] shadow-xs space-y-2">
                    <h4 className="text-[15px] font-black uppercase text-[#322113] tracking-wider mb-1">Coleta</h4>
                    <p className="text-[17px] leading-relaxed text-stone-700 whitespace-pre-line">
                      {LiturgyService.cleanVersesText(liturgyData.oracoes.coleta)}
                    </p>
                  </div>
                )}

                {/* Primeira Leitura */}
                {liturgyData.leituras?.primeiraLeitura?.map((l, i) => (
                  <div key={i} className="bg-white p-6 rounded-[24px] border border-[#E9DFCB] shadow-xs space-y-3">
                    <div className="flex justify-between items-baseline border-b border-[#EFE6D2] pb-2">
                      <h4 className="text-[17px] font-black text-[#322113]">1ª Leitura</h4>
                      <span className="text-[11px] font-bold text-stone-400 uppercase tracking-wider">{l.referencia}</span>
                    </div>
                    <h5 className="text-[15px] font-bold text-stone-800 italic leading-snug">{l.titulo}</h5>
                    <p className="text-[17px] leading-relaxed text-stone-700 whitespace-pre-line">
                      {LiturgyService.cleanVersesText(l.texto)}
                    </p>
                  </div>
                ))}

                {/* Salmo Responsorial */}
                {liturgyData.leituras?.salmo?.map((s, i) => (
                  <div key={i} className="bg-white p-6 rounded-[24px] border border-[#E9DFCB] shadow-xs space-y-3">
                    <div className="flex justify-between items-baseline border-b border-[#EFE6D2] pb-2">
                      <h4 className="text-[17px] font-black text-[#322113]">Salmo Responsorial</h4>
                      <span className="text-[11px] font-bold text-stone-400 uppercase tracking-wider">{s.referencia}</span>
                    </div>
                    <div className="text-[17px] leading-snug">
                      <span className="text-red-700 font-black mr-2">REFRÃO:</span>
                      <span className="font-bold italic text-stone-900">{LiturgyService.cleanVersesText(s.refrao)}</span>
                    </div>
                    <div className="text-[17px] leading-relaxed text-stone-700 space-y-3">
                      {(() => {
                        let paragraphCount = 0
                        return LiturgyService.cleanVersesText(s.texto)
                          .split('\n')
                          .map((line) => line.trim())
                          .filter((line) => line.length > 0)
                          .map((line, idx) => {
                            paragraphCount++
                            let cleanLine = line
                            if (cleanLine.startsWith('—') || cleanLine.startsWith('-')) {
                              cleanLine = cleanLine.substring(1).trim()
                            }
                            return (
                              <p key={idx} className="text-stone-700">
                                <span className="text-red-700 font-bold mr-1.5">{paragraphCount}.</span> {cleanLine}
                              </p>
                            )
                          })
                      })()}
                    </div>
                  </div>
                ))}

                {/* Segunda Leitura */}
                {liturgyData.leituras?.segundaLeitura?.map((l, i) => (
                  <div key={i} className="bg-white p-6 rounded-[24px] border border-[#E9DFCB] shadow-xs space-y-3">
                    <div className="flex justify-between items-baseline border-b border-[#EFE6D2] pb-2">
                      <h4 className="text-[17px] font-black text-[#322113]">2ª Leitura</h4>
                      <span className="text-[11px] font-bold text-stone-400 uppercase tracking-wider">{l.referencia}</span>
                    </div>
                    <h5 className="text-[15px] font-bold text-stone-800 italic leading-snug">{l.titulo}</h5>
                    <p className="text-[17px] leading-relaxed text-stone-700 whitespace-pre-line">
                      {LiturgyService.cleanVersesText(l.texto)}
                    </p>
                  </div>
                ))}

                {/* Evangelho */}
                {liturgyData.leituras?.evangelho?.map((l, i) => (
                  <div key={i} className="bg-white p-6 rounded-[24px] border border-[#E9DFCB] shadow-xs space-y-3">
                    <div className="flex justify-between items-baseline border-b border-[#EFE6D2] pb-2">
                      <h4 className="text-[17px] font-black text-[#A23F06]">Evangelho</h4>
                      <span className="text-[11px] font-bold text-stone-400 uppercase tracking-wider">{l.referencia}</span>
                    </div>
                    <h5 className="text-[15px] font-bold text-stone-800 italic leading-snug">{l.titulo}</h5>
                    <p className="text-[17px] leading-relaxed text-stone-700 whitespace-pre-line">
                      {LiturgyService.cleanVersesText(l.texto)}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-20 text-xs text-stone-400 font-bold uppercase tracking-wider font-sans">
                Não foi possível carregar a liturgia.
              </div>
            )}
          </div>

          <SheetFooter className="shrink-0 border-t border-[#E9DFCB] bg-[#FAF5E6] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
            <SheetClose render={
              <Button className="w-full mx-auto max-w-2xl bg-[#322113] text-[#FFF8E8] hover:bg-[#3d2a1a] font-black h-12 rounded-2xl shadow-sm transition-all text-sm uppercase tracking-wider">
                Fechar Leituras
              </Button>
            } />
          </SheetFooter>
        </SheetContent>
      </Sheet>
  )
}
