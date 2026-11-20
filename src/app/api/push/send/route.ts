import { createClient, createAdminClient } from '@/shared/api/supabaseServer';
import { NextResponse } from 'next/server';
import { sendPushNotification } from '@/shared/lib/push';

export const dynamic = 'force-dynamic';

/**
 * Membros que não são administradores só podem disparar notificações de troca, e com texto montado
 * AQUI no servidor (nunca o texto enviado pelo cliente). Isso impede mensagens arbitrárias para todos.
 */
type MemberTemplate = { body: (senderName: string) => string; targets: 'broadcast' | 'single' }
const MEMBER_TEMPLATES: Record<string, MemberTemplate> = {
  'Solicitação de Troca': { body: () => 'Alguém solicitou uma troca de escala. Confira no mural!', targets: 'broadcast' },
  'Troca Confirmada! ✅': { body: (name) => `${name || 'Alguém'} aceitou sua troca de escala.`, targets: 'single' },
};

// Limite por remetente (por instância do servidor): complementa, não substitui, o controle de acesso acima.
const MEMBER_LIMIT = { max: 5, windowMs: 10 * 60 * 1000 };
const memberSends = new Map<string, number[]>();
function memberRateLimited(senderId: string, now = Date.now()) {
  const recent = (memberSends.get(senderId) ?? []).filter((t) => now - t < MEMBER_LIMIT.windowMs);
  if (recent.length >= MEMBER_LIMIT.max) {
    memberSends.set(senderId, recent);
    return true;
  }
  memberSends.set(senderId, [...recent, now]);
  return false;
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    
    const supabase = await createClient();
    const { data: { user: sender }, error: authError } = await supabase.auth.getUser();

    if (authError || !sender) {
      console.error('Auth error in push send:', authError);
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    }

    // Apenas admins podem disparar notificações genéricas. 
    // Usuários comuns podem apenas avisar sobre solicitações de troca.
    const { data: senderProfile, error: profileError } = await supabase
      .from('profiles')
      .select('role, archived_at, full_name')
      .eq('auth_user_id', sender.id)
      .single();

    if (profileError || !senderProfile || senderProfile.archived_at !== null) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const isAdmin = senderProfile?.role === 'admin';
    const { title } = payload;
    let { body, url } = payload;
    const targetUserIds: string[] | undefined = payload.targetUserIds;

    if (!isAdmin) {
      const template = MEMBER_TEMPLATES[title as string];
      if (!template) {
        console.warn('Unauthorized push attempt by:', sender.id);
        return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
      }
      const targets = Array.isArray(targetUserIds) ? targetUserIds : [];
      const validTargets =
        template.targets === 'broadcast'
          ? targets.length === 0
          : targets.length === 1 && typeof targets[0] === 'string' && targets[0] !== sender.id;
      if (!validTargets) {
        return NextResponse.json({ error: 'Invalid recipients' }, { status: 400 });
      }
      if (memberRateLimited(sender.id)) {
        return NextResponse.json({ error: 'Too many notifications' }, { status: 429 });
      }
      body = template.body(senderProfile.full_name);
      url = '/';
    }

    // Usar o cliente administrador para ler as subscrições, pois usuários não-admins
    // não possuem permissão de leitura (RLS) sobre as subscrições de outros usuários.
    const adminSupabase = createAdminClient();

    // Buscar subscrições (sempre excluindo o próprio remetente)
    let query = adminSupabase.from('push_subscriptions')
      .select('subscription, user_id')
      .neq('user_id', sender.id);
    
    if (targetUserIds && targetUserIds.length > 0) {
      console.log('[PUSH] Filtrando por usuários:', targetUserIds.length);
      query = query.in('user_id', targetUserIds);
    } else {
      console.log('[PUSH] Envio global solicitado');
    }

    const { data: subs, error: subsError } = await query;
    console.log(`[PUSH] Subscrições encontradas para envio: ${subs?.length || 0}`);

    if (subsError) {
      return NextResponse.json({ error: subsError.message }, { status: 500 });
    }

    const userIds = [...new Set((subs || []).map(sub => sub.user_id))];
    const { data: activeProfiles, error: activeError } = userIds.length
      ? await adminSupabase.from('profiles').select('auth_user_id').in('auth_user_id', userIds).is('archived_at', null)
      : { data: [], error: null };
    if (activeError) return NextResponse.json({ error: 'Unable to resolve active recipients' }, { status: 500 });
    const activeIds = new Set((activeProfiles || []).map(profile => profile.auth_user_id));
    const results = await Promise.all(
      (subs || []).filter(sub => activeIds.has(sub.user_id)).map(async (sub) => {
        const result = await sendPushNotification(sub.subscription, { title, body, url });
        
        // Se a subscrição expirou, remove do banco usando o cliente administrador
        if (result.error === 'expired') {
          await adminSupabase
            .from('push_subscriptions')
            .delete()
            .match({ user_id: sub.user_id, subscription: sub.subscription });
        }
        
        return result;
      })
    );

    const successCount = results.filter(r => r.success).length;

    return NextResponse.json({ 
      success: true, 
      sentCount: successCount, 
      totalItems: results.length 
    });
  } catch (error) {
    console.error('Erro em push/send:', error);
    return NextResponse.json({ error: 'Erro ao enviar notificação' }, { status: 500 });
  }
}
