import { createClient } from '@/shared/api/supabaseServer';
import { NextResponse } from 'next/server';
import { sendPushNotification } from '@/shared/lib/push';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    
    // 1. Buscar aniversariantes de hoje
    // Usamos rpc ou raw sql se necessário, mas aqui faremos uma busca simples 
    // e filtraremos no JS para manter compatibilidade sem precisar de novas funções RPC
    const today = new Date();
    const month = (today.getMonth() + 1).toString().padStart(2, '0');
    const day = today.getDate().toString().padStart(2, '0');
    const monthDay = `${month}-${day}`;

    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('full_name, birth_date');

    if (usersError) throw usersError;

    const birthdayPeople = users.filter(u => {
      if (!u.birth_date) return false;
      return u.birth_date.endsWith(monthDay);
    });

    if (birthdayPeople.length === 0) {
      return NextResponse.json({ message: 'Nenhum aniversariante hoje.' });
    }

    const names = birthdayPeople.map(u => u.full_name).join(', ');
    const title = 'Aniversariante do Dia! 🎂';
    const body = birthdayPeople.length === 1 
      ? `Hoje o dia é de festa para ${names}! Parabéns!`
      : `Hoje temos festa para: ${names}! Parabéns a todos!`;

    // 2. Buscar todas as subscrições
    const { data: subs, error: subsError } = await supabase
      .from('push_subscriptions')
      .select('subscription, user_id');

    if (subsError) throw subsError;

    // 3. Disparar notificações
    const results = await Promise.all(
      (subs || []).map(async (sub: any) => {
        const result = await sendPushNotification(sub.subscription, { 
          title, 
          body, 
          url: '/' 
        });
        
        if (result.error === 'expired') {
          await supabase
            .from('push_subscriptions')
            .delete()
            .match({ user_id: sub.user_id, subscription: sub.subscription });
        }
        return result;
      })
    );

    return NextResponse.json({ 
      success: true, 
      birthdayCount: birthdayPeople.length,
      sentCount: results.filter(r => r.success).length
    });

  } catch (error: any) {
    console.error('Erro no cron de aniversários:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
