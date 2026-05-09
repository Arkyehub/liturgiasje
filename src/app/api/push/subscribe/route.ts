import { createClient } from '@/shared/api/supabaseServer';
import { NextResponse } from 'next/server';

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

    // Buscar o profile_id correspondente ao auth.uid()
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('auth_user_id', user.id)
      .single();

    // Upsert a subscrição para o usuário
    const { error } = await supabase
      .from('push_subscriptions')
      .upsert({
        user_id: user.id,
        profile_id: profile?.id || null,
        subscription: subscription,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id, subscription'
      });

    if (error) {
      console.error('Error saving subscription:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
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
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
