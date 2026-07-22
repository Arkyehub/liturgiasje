import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export async function GET() {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // 1. Buscar todos os perfis de leitores
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, full_name, whatsapp, role, auth_user_id, created_at")
      .order("full_name", { ascending: true })

    if (profilesError) throw profilesError

    // 2. Buscar todas as escalas de missas (schedule_slots com masses)
    const { data: slots, error: slotsError } = await supabase
      .from("schedule_slots")
      .select(`
        id,
        role,
        is_confirmed,
        is_swap_requested,
        profile_id,
        original_profile_id,
        created_at,
        mass:masses (
          id,
          date,
          time,
          special_description
        )
      `)

    if (slotsError) throw slotsError

    // 3. Buscar solicitações de troca no mural (announcements com tipo 'Troca')
    const { data: announcements, error: annError } = await supabase
      .from("announcements")
      .select(`
        id,
        title,
        content,
        type,
        created_at,
        author_id,
        related_schedule_slot_id,
        author:profiles!author_id(id, full_name)
      `)
      .eq("type", "Troca")
      .order("created_at", { ascending: false })

    if (annError) console.error("Erro ao buscar avisos de troca:", annError)

    // PROCESSAMENTO DE MÉTRICAS

    const totalReaders = profiles?.length || 0
    const activeAccounts = profiles?.filter(p => !!p.auth_user_id) || []
    const pendingAccounts = profiles?.filter(p => !p.auth_user_id) || []

    const engagementRate = totalReaders > 0 
      ? Math.round((activeAccounts.length / totalReaders) * 100) 
      : 0

    // Rastreio de Trocas e Leitores Originais
    const swapSlots = slots?.filter(s => s.original_profile_id && s.original_profile_id !== s.profile_id) || []
    const activeSwapRequests = slots?.filter(s => s.is_swap_requested) || []

    // Mapeamento de nomes de leitores por ID
    const profilesMap = Object.fromEntries((profiles || []).map(p => [p.id, p]))

    const swapHistory = swapSlots.map(s => {
      const original = profilesMap[s.original_profile_id]
      const current = profilesMap[s.profile_id]
      const massData = s.mass as any

      return {
        id: s.id,
        role: s.role,
        massDate: massData?.date,
        massTime: massData?.time,
        massDescription: massData?.special_description,
        originalReader: original ? { id: original.id, fullName: original.full_name } : null,
        currentReader: current ? { id: current.id, fullName: current.full_name } : null,
        isConfirmed: s.is_confirmed
      }
    }).sort((a, b) => new Date(b.massDate || 0).getTime() - new Date(a.massDate || 0).getTime())

    // Confirmações pendentes
    const unconfirmedSlots = (slots || [])
      .filter(s => !s.is_confirmed && s.profile_id)
      .map(s => {
        const reader = profilesMap[s.profile_id]
        const massData = s.mass as any
        return {
          id: s.id,
          role: s.role,
          massDate: massData?.date,
          massTime: massData?.time,
          massDescription: massData?.special_description,
          reader: reader ? { id: reader.id, fullName: reader.full_name, whatsapp: reader.whatsapp } : null,
          isSwapRequested: s.is_swap_requested
        }
      })
      .sort((a, b) => new Date(a.massDate || 0).getTime() - new Date(b.massDate || 0).getTime())

    return NextResponse.json({
      summary: {
        totalReaders,
        activeAccountsCount: activeAccounts.length,
        pendingAccountsCount: pendingAccounts.length,
        engagementRate,
        totalSwapsExecuted: swapSlots.length,
        activeSwapRequestsCount: activeSwapRequests.length,
        unconfirmedSlotsCount: unconfirmedSlots.length
      },
      pendingAccounts: pendingAccounts.map(p => ({
        id: p.id,
        fullName: p.full_name,
        whatsapp: p.whatsapp,
        role: p.role,
        createdAt: p.created_at
      })),
      swapHistory,
      unconfirmedSlots,
      activeSwapRequests: (announcements || []).map(a => ({
        id: a.id,
        title: a.title,
        content: a.content,
        createdAt: a.created_at,
        authorName: (a.author as any)?.full_name || "Desconhecido",
        slotId: a.related_schedule_slot_id
      }))
    })
  } catch (error: any) {
    console.error("[API Analytics Error]:", error)
    return NextResponse.json({ error: error.message || "Erro ao carregar métricas de análise" }, { status: 500 })
  }
}
