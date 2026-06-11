import { createAdminClient } from '@/shared/api/supabaseServer';
import { NextResponse } from 'next/server';
import { sendPushNotification } from '@/shared/lib/push';
import { format, addDays } from 'date-fns';

export const dynamic = 'force-dynamic';

const ROLE_MAP: Record<string, string> = {
  'C': 'Comentarista',
  '1L': '1ª Leitura',
  '2L': '2ª Leitura',
  'P': 'Preces',
  'L': 'Leitura'
};

interface ProfileData {
  id: string;
  full_name: string;
  auth_user_id: string | null;
}

interface MassData {
  id: string;
  date: string;
  time: string;
  special_description: string | null;
  is_published: boolean;
}

interface SlotData {
  id: string;
  role: string;
  profile_id: string | null;
  is_confirmed: boolean;
  mass: MassData | MassData[] | null;
  profile: ProfileData | ProfileData[] | null;
}

interface PushSubscriptionData {
  user_id: string;
  subscription: Record<string, unknown>;
}

export async function GET() {
  try {
    // Para tarefas em background/cron que não possuem sessão ativa de usuário,
    // usamos o cliente com privilégios de administrador (bypass RLS)
    const supabase = createAdminClient();

    // 1. Obter a data de amanhã (YYYY-MM-DD)
    const tomorrow = addDays(new Date(), 1);
    const tomorrowStr = format(tomorrow, 'yyyy-MM-dd');

    console.log(`[CRON REMINDERS] Buscando escalas confirmadas para a data: ${tomorrowStr}`);

    // 2. Buscar slots escalados e confirmados para missas publicadas de amanhã
    const { data: rawSlots, error: slotsError } = await supabase
      .from('schedule_slots')
      .select(`
        id,
        role,
        profile_id,
        is_confirmed,
        mass:masses!inner(id, date, time, special_description, is_published),
        profile:profiles!profile_id(id, full_name, auth_user_id)
      `)
      .eq('mass.date', tomorrowStr)
      .eq('mass.is_published', true)
      .eq('is_confirmed', true) // Apenas leitores que confirmaram a escala
      .not('profile_id', 'is', null);

    if (slotsError) {
      console.error('[CRON REMINDERS] Erro ao buscar slots:', slotsError);
      throw slotsError;
    }

    const slots = rawSlots as unknown as SlotData[] | null;

    if (!slots || slots.length === 0) {
      console.log('[CRON REMINDERS] Nenhum leitor escalado/confirmado para amanhã.');
      return NextResponse.json({ message: 'Nenhuma escala confirmada para amanhã.' });
    }

    console.log(`[CRON REMINDERS] Leitores confirmados encontrados: ${slots.length}`);

    // 3. Agrupar notificações por usuário para evitar duplicidade de pushes
    // (caso o mesmo leitor faça mais de uma função no dia)
    const userNotifications: Record<string, {
      authUserId: string;
      fullName: string;
      details: Array<{ time: string; roleName: string }>;
    }> = {};

    for (const slot of slots) {
      // Como a relação pode retornar um objeto ou array no Supabase, normalizamos para objeto
      const p = Array.isArray(slot.profile) ? slot.profile[0] : slot.profile;
      const m = Array.isArray(slot.mass) ? slot.mass[0] : slot.mass;
      if (!p || !p.auth_user_id) continue;

      const authUserId = p.auth_user_id;
      const roleName = ROLE_MAP[slot.role] || slot.role;
      // Tratar formato da hora (remover segundos caso venha HH:MM:SS)
      const timeFormatted = m && m.time ? m.time.substring(0, 5) : 'Horário não definido';

      if (!userNotifications[authUserId]) {
        userNotifications[authUserId] = {
          authUserId,
          fullName: p.full_name,
          details: []
        };
      }

      userNotifications[authUserId].details.push({
        time: timeFormatted,
        roleName
      });
    }

    const targetUserIds = Object.keys(userNotifications);
    if (targetUserIds.length === 0) {
      return NextResponse.json({ message: 'Nenhum usuário com inscrição ativa para notificar.' });
    }

    // 4. Buscar subscrições push dos usuários escalados
    const { data: rawSubs, error: subsError } = await supabase
      .from('push_subscriptions')
      .select('subscription, user_id')
      .in('user_id', targetUserIds);

    if (subsError) {
      console.error('[CRON REMINDERS] Erro ao buscar subscrições:', subsError);
      throw subsError;
    }

    const subs = rawSubs as unknown as PushSubscriptionData[] | null;

    if (!subs || subs.length === 0) {
      return NextResponse.json({ message: 'Nenhuma subscrição push ativa encontrada para os leitores escalados.' });
    }

    // Mapear subscrições para cada usuário
    const subsByUser = subs.reduce((acc: Record<string, PushSubscriptionData[]>, item) => {
      if (!acc[item.user_id]) acc[item.user_id] = [];
      acc[item.user_id].push(item);
      return acc;
    }, {});

    let sentCount = 0;

    // 5. Enviar as notificações
    const promises = Object.values(userNotifications).flatMap(async (user) => {
      const userSubs = subsByUser[user.authUserId];
      if (!userSubs || userSubs.length === 0) return [];

      const title = 'Lembrete de Escala! 📖';
      
      // Montar corpo da mensagem
      let body = '';
      if (user.details.length === 1) {
        body = `Olá ${user.fullName.split(' ')[0]}, amanhã você lerá como ${user.details[0].roleName} às ${user.details[0].time}.`;
      } else {
        const roles = user.details.map(d => `${d.roleName} (${d.time})`).join(', ');
        body = `Olá ${user.fullName.split(' ')[0]}, amanhã você está escalado para: ${roles}.`;
      }

      return userSubs.map(async (sub) => {
        // Conversão explícita para stringify
        const pushSubscriptionObj = sub.subscription as unknown as import('web-push').PushSubscription;
        const result = await sendPushNotification(pushSubscriptionObj, {
          title,
          body,
          url: '/'
        });

        if (result.success) {
          sentCount++;
        } else if (result.error === 'expired') {
          // Remover subscrição expirada
          await supabase
            .from('push_subscriptions')
            .delete()
            .match({ user_id: sub.user_id, subscription: sub.subscription });
        }
        return result;
      });
    });

    await Promise.all(promises.flat());

    return NextResponse.json({
      success: true,
      notifiedUsersCount: targetUserIds.length,
      sentCount
    });

  } catch (error) {
    console.error('Erro no cron de lembrete de escalas:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
