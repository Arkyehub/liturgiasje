import { createClient } from '@/shared/api/supabaseServer';
import { NextResponse } from 'next/server';
import { isValidPushSubscription } from '@/shared/lib/pushEndpoint';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { subscription } = await request.json();
    const supabase = await createClient();
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      console.error('Auth error in push subscribe:', authError);
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    }

    // Garantir que a subscrição recebida é válida e estruturada como objeto JSON
    let parsedSubscription = subscription;
    if (typeof subscription === 'string') {
      try {
        parsedSubscription = JSON.parse(subscription);
      } catch (e) {
        return NextResponse.json({ error: 'Invalid subscription JSON format' }, { status: 400 });
      }
    }

    // Só aceita assinaturas de serviços de push conhecidos (o servidor envia notificações para este endereço)
    if (!isValidPushSubscription(parsedSubscription)) {
      return NextResponse.json({ error: 'Invalid subscription details' }, { status: 400 });
    }

    // Buscar o profile_id correspondente ao auth.uid()
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, archived_at')
      .eq('auth_user_id', user.id)
      .single();

    if (!profile || profile.archived_at !== null) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Upsert a subscrição para o usuário
    const { error } = await supabase
      .from('push_subscriptions')
      .upsert({
        user_id: user.id,
        profile_id: profile?.id || null,
        subscription: parsedSubscription,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id, subscription'
      });

    if (error) {
      console.error('Error saving subscription:', error);
      return NextResponse.json({ error: 'Não foi possível salvar a assinatura' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erro em push/subscribe (POST):', error);
    return NextResponse.json({ error: 'Não foi possível salvar a assinatura' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { subscription } = await request.json();
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { error } = await supabase
      .from('push_subscriptions')
      .delete()
      .match({ user_id: user.id, subscription });

    if (error) {
      console.error('Erro ao remover assinatura:', error);
      return NextResponse.json({ error: 'Não foi possível remover a assinatura' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erro em push/subscribe (DELETE):', error);
    return NextResponse.json({ error: 'Não foi possível remover a assinatura' }, { status: 500 });
  }
}
