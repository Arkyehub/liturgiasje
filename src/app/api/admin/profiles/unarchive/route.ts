import { createClient } from '@/shared/api/supabaseServer'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    if (typeof body?.profileId !== 'string' || !uuid.test(body.profileId)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    const { data, error } = await supabase.rpc('unarchive_member', { target_profile_id: body.profileId })
    if (error) {
      if (error.code === '42501') return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
      if (error.code === 'P0002') return NextResponse.json({ error: 'Perfil não encontrado' }, { status: 404 })
      return NextResponse.json({ error: 'Não foi possível reativar o membro' }, { status: 500 })
    }
    if (data !== 'unarchived' && data !== 'not_archived') return NextResponse.json({ error: 'Resultado inesperado' }, { status: 500 })
    return NextResponse.json({ success: true, status: data })
  } catch {
    return NextResponse.json({ error: 'Não foi possível reativar o membro' }, { status: 500 })
  }
}
