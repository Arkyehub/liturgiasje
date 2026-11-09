"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Loader2, UserX } from "lucide-react"
import { useAuth } from "@/shared/hooks/useAuth"
import { makeGetProfileById, makeListUnavailableByProfile } from "@/main/factories/usecases/profiles"
import { makeListMemberReadings } from "@/main/factories/usecases/schedule"
import { Profile } from "@/domain/models/Profile"
import { MemberReading } from "@/domain/models/Schedule"
import { MemberAnalysisView } from "@/features/members/ui/MemberAnalysisView"
import { Button } from "@/shared/ui/button"

interface AnalysisData {
  profile: Profile | null
  readings: MemberReading[]
  unavailableDates: string[]
}

export default function MemberAnalysisPage() {
  const { id } = useParams<{ id: string }>()
  const { user, profile: viewer, loading } = useAuth()
  const router = useRouter()
  const [data, setData] = useState<AnalysisData | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (loading) return
    if (!user || viewer?.role !== "admin") {
      router.push("/")
      return
    }

    let cancelled = false
    ;(async () => {
      try {
        const [profile, readings, unavailableDates] = await Promise.all([
          makeGetProfileById().execute(id),
          makeListMemberReadings().execute(id),
          makeListUnavailableByProfile().execute(id),
        ])
        if (!cancelled) setData({ profile, readings, unavailableDates })
      } catch (e) {
        console.error("Erro ao carregar análise do membro:", e)
        if (!cancelled) setError(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [id, user, viewer, loading, router])

  if (loading || (!data && !error)) {
    return (
      <div className="flex h-screen items-center justify-center bg-stone-50">
        <Loader2 className="h-8 w-8 animate-spin text-stone-300" />
      </div>
    )
  }

  if (error || !data?.profile) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-stone-50/30 px-6 text-center">
        <UserX className="h-10 w-10 text-stone-300" />
        <div className="space-y-1">
          <h1 className="text-lg font-black tracking-tight text-stone-800">Membro não encontrado</h1>
          <p className="text-sm text-stone-500">Não foi possível carregar os dados deste membro.</p>
        </div>
        <Button onClick={() => router.push("/admin/membros")} className="h-12 rounded-2xl bg-stone-800 px-6 font-bold text-white hover:bg-black">
          Voltar para membros
        </Button>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-stone-50/30">
      <main className="flex-1 overflow-auto">
        <div className="container mx-auto max-w-md space-y-6 px-4 py-6 pb-20 animate-in fade-in slide-in-from-bottom-2">
          <div className="space-y-1 px-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Gestão de membros</p>
            <h1 className="text-2xl font-black tracking-tight text-stone-800">Análise do membro</h1>
          </div>
          <MemberAnalysisView profile={data.profile} readings={data.readings} unavailableDates={data.unavailableDates} />
        </div>
      </main>
    </div>
  )
}
