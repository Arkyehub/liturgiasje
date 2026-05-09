import { createClient, createAdminClient } from '@/shared/api/supabaseServer';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { profileId } = await request.json();

    if (!profileId) {
      return NextResponse.json({ error: 'ID do perfil não fornecido' }, { status: 400 });
    }

    const supabase = await createClient();
    
    // 1. Verificar se o usuário atual é admin
    const { data: { user: currentUser }, error: authError } = await supabase.auth.getUser();
    if (authError || !currentUser) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const { data: currentUserProfile } = await supabase
      .from('profiles')
      .select('role')
      .eq('auth_user_id', currentUser.id)
      .single();

    if (currentUserProfile?.role !== 'admin') {
      return NextResponse.json({ error: 'Acesso negado: Apenas administradores podem excluir perfis' }, { status: 403 });
    }

    // 2. Buscar o perfil para deletar
    const { data: profileToDelete, error: fetchError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', profileId)
      .single();

    if (fetchError || !profileToDelete) {
      return NextResponse.json({ error: 'Perfil não encontrado' }, { status: 404 });
    }

    const authUserId = profileToDelete.auth_user_id;
    const adminSupabase = createAdminClient();

    // 3. LIMPEZA DE ESCALAS (schedule_slots)
    // Resetar qualquer vaga que este perfil ocupe
    const { error: slotsError } = await adminSupabase
      .from('schedule_slots')
      .update({
        profile_id: null,
        is_confirmed: false,
        is_swap_requested: false
      })
      .or(`profile_id.eq.${profileId},original_reader_id.eq.${authUserId || '00000000-0000-0000-0000-000000000000'},reader_id.eq.${authUserId || '00000000-0000-0000-0000-000000000000'}`);

    if (slotsError) {
      console.error('Erro ao limpar slots:', slotsError);
    }

    // 4. LIMPEZA DE INDISPONIBILIDADES
    const { error: unavailError } = await adminSupabase
      .from('unavailable_dates')
      .delete()
      .eq('profile_id', profileId);
    
    if (unavailError) console.error('Erro ao limpar indisponibilidades:', unavailError);

    // 5. LIMPEZA DE AVISOS E INSCRIÇÕES PUSH
    // Remover avisos de troca vinculados ou criados pelo perfil
    const { error: announcementsError } = await adminSupabase
      .from('announcements')
      .delete()
      .eq('profile_id', profileId);
    
    if (announcementsError) console.error('Erro ao limpar avisos:', announcementsError);

    const { error: pushError } = await adminSupabase
      .from('push_subscriptions')
      .delete()
      .eq('profile_id', profileId);

    if (pushError) console.error('Erro ao limpar push:', pushError);

    // 6. REMOÇÃO DE AUTH (se houver vínculo)
    if (authUserId) {
      const { error: authDeleteError } = await adminSupabase.auth.admin.deleteUser(authUserId);
      if (authDeleteError) {
        console.error('Erro ao deletar usuário do Auth:', authDeleteError);
      }
    }

    // 7. REMOÇÃO DO PERFIL
    const { error: finalDeleteError } = await adminSupabase
      .from('profiles')
      .delete()
      .eq('id', profileId);

    if (finalDeleteError) {
      throw finalDeleteError;
    }

    return NextResponse.json({ success: true, message: 'Perfil e registros vinculados excluídos com sucesso' });

  } catch (error: any) {
    console.error('Erro na rota de exclusão de perfil:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
