import { createClient, createAdminClient } from '@/shared/api/supabaseServer';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { memberId } = await request.json();

    if (!memberId) {
      return NextResponse.json({ error: 'ID do membro não fornecido' }, { status: 400 });
    }

    const supabase = await createClient();
    
    // 1. Verificar se o usuário atual é admin
    const { data: { user: currentUser }, error: authError } = await supabase.auth.getUser();
    if (authError || !currentUser) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', currentUser.id)
      .single();

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Acesso negado: Apenas administradores podem excluir membros' }, { status: 403 });
    }

    // 2. Buscar o membro e seu vínculo com usuários
    const { data: member, error: memberError } = await supabase
      .from('members')
      .select('id, claimed_by')
      .eq('id', memberId)
      .single();

    if (memberError || !member) {
      return NextResponse.json({ error: 'Membro não encontrado' }, { status: 404 });
    }

    const userId = member.claimed_by;
    const adminSupabase = createAdminClient();

    // 3. LIMPEZA DE ESCALAS (schedule_slots)
    // Resetar qualquer vaga que este membro ou usuário ocupe
    const { error: slotsError } = await adminSupabase
      .from('schedule_slots')
      .update({
        reader_id: null,
        member_id: null,
        original_reader_id: null,
        is_confirmed: false,
        is_swap_requested: false
      })
      .or(`member_id.eq.${memberId}${userId ? `,reader_id.eq.${userId},original_reader_id.eq.${userId}` : ''}`);

    if (slotsError) {
      console.error('Erro ao limpar slots:', slotsError);
    }

    // 4. LIMPEZA DE INDISPONIBILIDADES
    if (userId) {
      const { error: unavailError } = await adminSupabase
        .from('unavailable_dates')
        .delete()
        .eq('user_id', userId);
      
      if (unavailError) console.error('Erro ao limpar indisponibilidades:', unavailError);
    }

    // 5. LIMPEZA DE AVISOS
    // Remover avisos de troca vinculados ou criados pelo usuário
    if (userId) {
      const { error: announcementsError } = await adminSupabase
        .from('announcements')
        .delete()
        .or(`created_by.eq.${userId},type.eq.Troca`); // Simplificado: remove trocas e feitos por ele
      
      if (announcementsError) console.error('Erro ao limpar avisos:', announcementsError);
    }

    // 6. REMOÇÃO DE PERFIL E AUTH
    if (userId) {
      // Remover perfil na tabela public.users
      const { error: profileDeleteError } = await adminSupabase
        .from('users')
        .delete()
        .eq('id', userId);
      
      if (profileDeleteError) {
        console.error('Erro ao deletar perfil publico:', profileDeleteError);
      }

      // Remover do Supabase Auth
      const { error: authDeleteError } = await adminSupabase.auth.admin.deleteUser(userId);
      if (authDeleteError) {
        console.error('Erro ao deletar usuário do Auth:', authDeleteError);
      }
    }

    // 7. REMOÇÃO DO MEMBRO
    const { error: finalDeleteError } = await adminSupabase
      .from('members')
      .delete()
      .eq('id', memberId);

    if (finalDeleteError) {
      throw finalDeleteError;
    }

    return NextResponse.json({ success: true, message: 'Membro e registros vinculados excluídos com sucesso' });

  } catch (error: any) {
    console.error('Erro na rota de exclusão de membro:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
