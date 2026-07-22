"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/shared/hooks/useAuth"
import { Header } from "@/shared/ui/Header"
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card"
import { Badge } from "@/shared/ui/badge"
import { Button } from "@/shared/ui/button"
import { 
  Users, 
  UserCheck, 
  UserX, 
  RefreshCw, 
  Clock, 
  AlertCircle, 
  ChevronRight, 
  Loader2, 
  BarChart3, 
  ArrowLeft,
  ArrowRightLeft,
  CalendarCheck
} from "lucide-react"
import { format, parseISO } from "date-fns"
import { ptBR } from "date-fns/locale"
import { toast } from "sonner"

interface AnalyticsData {
  summary: {
    totalReaders: number
    activeAccountsCount: number
    pendingAccountsCount: number
    engagementRate: number
    totalSwapsExecuted: number
    activeSwapRequestsCount: number
    unconfirmedSlotsCount: number
  }
  pendingAccounts: Array<{
    id: string
    fullName: string
    whatsapp?: string
    role: string
    createdAt: string
  }>
  swapHistory: Array<{
    id: string
    role: string
    massDate: string
    massTime: string
    massDescription?: string
    originalReader: { id: string; fullName: string } | null
    currentReader: { id: string; fullName: string } | null
    isConfirmed: boolean
  }>
  unconfirmedSlots: Array<{
    id: string
    role: string
    massDate: string
    massTime: string
    massDescription?: string
    reader: { id: string; fullName: string; whatsapp?: string } | null
    isSwapRequested: boolean
  }>
  activeSwapRequests: Array<{
    id: string
    title: string
    content: string
    createdAt: string
    authorName: string
    slotId?: string
  }>
}

export default function AdminAnalyticsPage() {
  const { user, profile, loading: authLoading } = useAuth()
  const router = useRouter()
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<"pending" | "swaps" | "unconfirmed">("pending")

  useEffect(() => {
    if (!authLoading) {
      if (!user || profile?.role !== "admin") {
        router.push("/")
      } else {
        loadAnalytics()
      }
    }
  }, [user, profile, authLoading])

  const loadAnalytics = async () => {
    try {
      setIsLoading(true)
      const res = await fetch("/api/admin/analytics")
      if (!res.ok) throw new Error("Falha ao carregar dados")
      const result = await res.json()
      setData(result)
    } catch (error) {
      console.error("[Analytics Error]:", error)
      toast.error("Erro ao carregar dados de análise.")
    } finally {
      setIsLoading(false)
    }
  }

  const formatMassDate = (dateStr?: string) => {
    if (!dateStr) return "---"
    try {
      return format(parseISO(dateStr), "dd/MM (EEEE)", { locale: ptBR })
    } catch {
      return dateStr
    }
  }

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-stone-50/50 flex flex-col">
        <Header user={profile ? { fullName: profile.fullName, avatarUrl: profile.avatarUrl, role: profile.role } : null} />
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-stone-400">
            <Loader2 className="h-8 w-8 animate-spin text-amber-600" />
            <p className="text-sm font-medium">Carregando painel de análise...</p>
          </div>
        </div>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="min-h-screen bg-stone-50/60 pb-12">
      <Header 
        user={profile ? { fullName: profile.fullName, avatarUrl: profile.avatarUrl, role: profile.role } : null}
        showBackButton
      />

      <main className="container max-w-4xl mx-auto px-4 pt-6 space-y-6 animate-in fade-in duration-300">
        {/* Cabeçalho da Página */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-3xl border border-stone-200/80 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-amber-50 rounded-2xl text-amber-600 border border-amber-100">
              <BarChart3 className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-stone-800 tracking-tight">Análise de Usuários</h1>
              <p className="text-xs font-medium text-stone-500">Métricas de engajamento, acessos e trocas de leitor</p>
            </div>
          </div>

          <Button 
            variant="outline" 
            size="sm" 
            onClick={loadAnalytics}
            className="rounded-xl border-stone-200 text-stone-600 hover:bg-stone-50 gap-2 self-start sm:self-auto"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Atualizar
          </Button>
        </div>

        {/* CARDS DE KPI (RESUMO) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {/* Card 1: Engajamento / Aceites */}
          <div className="bg-white p-4 rounded-3xl border border-stone-200/80 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between text-stone-400 mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-stone-500">Engajamento</span>
              <UserCheck className="h-4 w-4 text-emerald-500" />
            </div>
            <div>
              <div className="text-2xl font-black text-stone-800">{data.summary.engagementRate}%</div>
              <p className="text-[11px] text-stone-500 mt-0.5">
                {data.summary.activeAccountsCount} de {data.summary.totalReaders} leitores ativos
              </p>
            </div>
          </div>

          {/* Card 2: Sem Acesso (Pendentes) */}
          <div className="bg-white p-4 rounded-3xl border border-stone-200/80 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between text-stone-400 mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-stone-500">Sem Cadastro</span>
              <UserX className="h-4 w-4 text-amber-500" />
            </div>
            <div>
              <div className="text-2xl font-black text-amber-600">{data.summary.pendingAccountsCount}</div>
              <p className="text-[11px] text-stone-500 mt-0.5">Sem login efetuado</p>
            </div>
          </div>

          {/* Card 3: Trocas Realizadas */}
          <div className="bg-white p-4 rounded-3xl border border-stone-200/80 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between text-stone-400 mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-stone-500">Trocas Efetuadas</span>
              <ArrowRightLeft className="h-4 w-4 text-blue-500" />
            </div>
            <div>
              <div className="text-2xl font-black text-blue-600">{data.summary.totalSwapsExecuted}</div>
              <p className="text-[11px] text-stone-500 mt-0.5">Substituições concluídas</p>
            </div>
          </div>

          {/* Card 4: Confirmações Pendentes */}
          <div className="bg-white p-4 rounded-3xl border border-stone-200/80 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between text-stone-400 mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-stone-500">Pendentes</span>
              <CalendarCheck className="h-4 w-4 text-rose-500" />
            </div>
            <div>
              <div className="text-2xl font-black text-rose-600">{data.summary.unconfirmedSlotsCount}</div>
              <p className="text-[11px] text-stone-500 mt-0.5">Aguardando confirmação</p>
            </div>
          </div>
        </div>

        {/* NAVEGAÇÃO DE ABAS */}
        <div className="flex bg-stone-200/60 p-1 rounded-2xl gap-1">
          <button
            onClick={() => setActiveTab("pending")}
            className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition-all ${
              activeTab === "pending"
                ? "bg-white text-stone-800 shadow-sm"
                : "text-stone-500 hover:text-stone-700"
            }`}
          >
            Sem Acesso ({data.pendingAccounts.length})
          </button>
          <button
            onClick={() => setActiveTab("swaps")}
            className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition-all ${
              activeTab === "swaps"
                ? "bg-white text-stone-800 shadow-sm"
                : "text-stone-500 hover:text-stone-700"
            }`}
          >
            Histórico de Trocas ({data.swapHistory.length})
          </button>
          <button
            onClick={() => setActiveTab("unconfirmed")}
            className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition-all ${
              activeTab === "unconfirmed"
                ? "bg-white text-stone-800 shadow-sm"
                : "text-stone-500 hover:text-stone-700"
            }`}
          >
            Presença Pendente ({data.unconfirmedSlots.length})
          </button>
        </div>

        {/* ABA 1: LEITORES SEM ACESSO / CADASTRO */}
        {activeTab === "pending" && (
          <Card className="rounded-3xl border-stone-200/80 shadow-sm overflow-hidden">
            <CardHeader className="bg-white pb-3 border-b border-stone-100">
              <CardTitle className="text-base font-bold text-stone-800 flex items-center justify-between">
                <span>Leitores que nunca acessaram / sem conta</span>
                <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                  {data.pendingAccounts.length} leitores
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 bg-white divide-y divide-stone-100">
              {data.pendingAccounts.length === 0 ? (
                <div className="p-8 text-center text-stone-400 text-sm">
                  🎉 Todos os leitores possuem conta e já acessaram o aplicativo!
                </div>
              ) : (
                data.pendingAccounts.map((member) => (
                  <div key={member.id} className="p-4 flex items-center justify-between hover:bg-stone-50/60 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-amber-100/80 text-amber-700 flex items-center justify-center font-bold text-sm">
                        {member.fullName.substring(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-stone-800">{member.fullName}</h4>
                        <p className="text-xs text-stone-400">
                          {member.whatsapp ? `WhatsApp: ${member.whatsapp}` : "Sem WhatsApp cadastrado"}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge className="bg-stone-100 text-stone-600 hover:bg-stone-100 font-medium text-[10px]">
                        Pendente
                      </Badge>
                      {member.whatsapp && (
                        <a
                          href={`https://wa.me/55${member.whatsapp.replace(/\D/g, '')}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-bold px-3 py-1.5 rounded-xl border border-emerald-200 transition-colors"
                        >
                          Convidar
                        </a>
                      )}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        )}

        {/* ABA 2: HISTÓRICO DE TROCAS E LEITORES ORIGINAIS */}
        {activeTab === "swaps" && (
          <Card className="rounded-3xl border-stone-200/80 shadow-sm overflow-hidden">
            <CardHeader className="bg-white pb-3 border-b border-stone-100">
              <CardTitle className="text-base font-bold text-stone-800 flex items-center justify-between">
                <span>Rastreio de Trocas (Original vs Atual)</span>
                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                  {data.swapHistory.length} trocas
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 bg-white divide-y divide-stone-100">
              {data.swapHistory.length === 0 ? (
                <div className="p-8 text-center text-stone-400 text-sm">
                  Nenhuma troca de leitor registrada até o momento.
                </div>
              ) : (
                data.swapHistory.map((swap) => (
                  <div key={swap.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-stone-50/60 transition-colors">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold bg-stone-100 text-stone-700 px-2 py-0.5 rounded-lg">
                          {swap.role}
                        </span>
                        <span className="text-xs font-semibold text-stone-600">
                          {formatMassDate(swap.massDate)} às {swap.massTime?.substring(0, 5)}
                        </span>
                      </div>
                      {swap.massDescription && (
                        <p className="text-xs text-stone-400">{swap.massDescription}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-3 bg-stone-50 p-2.5 rounded-2xl border border-stone-100 self-start sm:self-auto">
                      <div className="text-right">
                        <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">Original</span>
                        <span className="text-xs font-bold text-stone-600 line-through opacity-70">
                          {swap.originalReader?.fullName || "---"}
                        </span>
                      </div>

                      <ArrowRightLeft className="h-3.5 w-3.5 text-blue-500 shrink-0" />

                      <div>
                        <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider block">Assumiu</span>
                        <span className="text-xs font-bold text-stone-800">
                          {swap.currentReader?.fullName || "---"}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        )}

        {/* ABA 3: CONFIRMAÇÕES PENDENTES */}
        {activeTab === "unconfirmed" && (
          <Card className="rounded-3xl border-stone-200/80 shadow-sm overflow-hidden">
            <CardHeader className="bg-white pb-3 border-b border-stone-100">
              <CardTitle className="text-base font-bold text-stone-800 flex items-center justify-between">
                <span>Leitores Escalados com Presença Não Confirmada</span>
                <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200">
                  {data.unconfirmedSlots.length} pendentes
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 bg-white divide-y divide-stone-100">
              {data.unconfirmedSlots.length === 0 ? (
                <div className="p-8 text-center text-stone-400 text-sm">
                  🎉 Todas as escalas estão confirmadas!
                </div>
              ) : (
                data.unconfirmedSlots.map((slot) => (
                  <div key={slot.id} className="p-4 flex items-center justify-between hover:bg-stone-50/60 transition-colors">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-stone-800">
                          {slot.reader?.fullName || "Leitor Não Definido"}
                        </h4>
                        {slot.isSwapRequested && (
                          <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 text-[10px] font-bold">
                            Troca Pedida
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-stone-500">
                        <span className="font-semibold text-stone-700">{slot.role}</span> • {formatMassDate(slot.massDate)} às {slot.massTime?.substring(0, 5)}
                      </p>
                    </div>

                    {slot.reader?.whatsapp && (
                      <a
                        href={`https://wa.me/55${slot.reader.whatsapp.replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold px-3 py-1.5 rounded-xl border border-stone-200 transition-colors"
                      >
                        Lembrar
                      </a>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  )
}
