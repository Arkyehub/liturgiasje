"use client"

import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
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
        <SheetContent side="right" className="w-[90%] sm:max-w-xl h-full bg-stone-50/95 backdrop-blur-md p-0 flex flex-col border-l border-stone-200" showCloseButton={true}>
          {(() => {
            const headerColors: Record<string, string> = {
              Verde: "bg-emerald-600 text-white",
              Roxo: "bg-purple-600 text-white",
              Vermelho: "bg-red-600 text-white",
              Rosa: "bg-pink-500 text-white",
              Branco: "bg-stone-200 text-stone-800",
            }
            const currentHeaderColor = localColor ? (headerColors[localColor] || "bg-stone-200 text-stone-800") : "bg-stone-200 text-stone-800"
            const isWhiteHeader = localColor === "Branco"
            
            return (
              <SheetHeader className={cn("text-center px-6 py-6 shrink-0 flex flex-col relative", currentHeaderColor)}>
                <SheetTitle className={cn("font-black text-lg tracking-tight leading-snug pr-8 text-left", isWhiteHeader ? "text-stone-800" : "text-white")}>
                  {liturgyData?.liturgia || "Liturgia Diária"}
                </SheetTitle>
                <SheetDescription className={cn("text-xs font-semibold mt-1 text-left opacity-90", isWhiteHeader ? "text-stone-500" : "text-white/90")}>
                  {dateLabel}
                </SheetDescription>
              </SheetHeader>
            )
          })()}

          <div className="flex-1 overflow-y-auto px-6 py-4">
            {isLoadingLiturgy ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-stone-400" />
                <span className="text-xs text-stone-400 font-bold uppercase tracking-wider">Buscando Leituras...</span>
              </div>
            ) : liturgyData ? (
              <div className="space-y-6 text-stone-800 pb-10 font-serif">
                {/* Oração da Coleta */}
                {liturgyData.oracoes?.coleta && (
                  <div className="bg-white p-5 rounded-[24px] border border-stone-200/40 shadow-xs space-y-2">
                    <h4 className="text-[15px] font-black uppercase text-[#0f5499] tracking-wider mb-1">Coleta</h4>
                    <p className="text-[17px] leading-relaxed text-stone-700 whitespace-pre-line">
                      {LiturgyService.cleanVersesText(liturgyData.oracoes.coleta)}
                    </p>
                  </div>
                )}

                {/* Primeira Leitura */}
                {liturgyData.leituras?.primeiraLeitura?.map((l, i) => (
                  <div key={i} className="bg-white p-6 rounded-[24px] border border-stone-200/40 shadow-xs space-y-3">
                    <div className="flex justify-between items-baseline border-b border-stone-100 pb-2">
                      <h4 className="text-[17px] font-black text-[#0f5499]">1ª Leitura</h4>
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
                  <div key={i} className="bg-white p-6 rounded-[24px] border border-stone-200/40 shadow-xs space-y-3">
                    <div className="flex justify-between items-baseline border-b border-stone-100 pb-2">
                      <h4 className="text-[17px] font-black text-[#0f5499]">Salmo Responsorial</h4>
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
                  <div key={i} className="bg-white p-6 rounded-[24px] border border-stone-200/40 shadow-xs space-y-3">
                    <div className="flex justify-between items-baseline border-b border-stone-100 pb-2">
                      <h4 className="text-[17px] font-black text-[#0f5499]">2ª Leitura</h4>
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
                  <div key={i} className="bg-white p-6 rounded-[24px] border border-stone-200/40 shadow-xs space-y-3">
                    <div className="flex justify-between items-baseline border-b border-stone-100 pb-2">
                      <h4 className="text-[17px] font-black text-red-700">Evangelho</h4>
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

          <SheetFooter className="px-6 py-4 shrink-0 border-t border-stone-200/50 bg-stone-50">
            <SheetClose render={
              <Button className="w-full bg-[#1b1816] text-white hover:bg-stone-800 font-black h-12 rounded-2xl shadow-sm transition-all text-sm uppercase tracking-wider">
                Fechar Leituras
              </Button>
            } />
          </SheetFooter>
        </SheetContent>
      </Sheet>
  )
}
