"use client"

import { useAuth } from "@/shared/hooks/useAuth"
import { Loader2 } from "lucide-react"
import { useState, useEffect } from "react"

export default function FolhetoPage() {
  const { profile, loading } = useAuth()
  const [isLoading, setIsLoading] = useState(true)

  // Fallback para evitar carregamento infinito
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading(false)
    }, 10000) // 10 segundos de limite

    return () => clearTimeout(timer)
  }, [])

  return (
    <div className="flex flex-col h-screen bg-stone-50 overflow-hidden">
      <main className="flex-1 relative w-full h-full overflow-hidden bg-stone-100">
        {isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-white z-10">
            <div className="relative">
              <Loader2 className="h-12 w-12 animate-spin text-stone-800" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="h-2 w-2 bg-stone-800 rounded-full animate-ping" />
              </div>
            </div>
            <p className="mt-6 text-stone-900 font-black text-[10px] uppercase tracking-[0.2em] animate-pulse">
              Carregando Folheto...
            </p>
          </div>
        )}
        
        <iframe 
          src={`https://docs.google.com/gview?url=https://pvgjzunalzpwaditseys.supabase.co/storage/v1/object/public/leaflets/folheto_atual.pdf&embedded=true`}
          className="w-full h-full border-none"
          onLoad={() => setIsLoading(false)}
          title="Folheto da Missa"
        />
      </main>
    </div>
  )
}
