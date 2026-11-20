-- v1.43 — saúde do banco (NÃO APLICADO). Proposta do PR de "saúde da aplicação".
-- Validada somente em PostgreSQL local descartável (tests/database). Aplicar em Preview/Production exige autorização
-- específica. Rollback: migration_v143_db_health_rollback.sql.
--
-- 1) Índices nas chaves estrangeiras (aviso "unindexed_foreign_keys" do Supabase).
-- 2) handle_new_user() é função de trigger e não deve ser chamável por /rest/v1/rpc.
-- 3) Policies: auth.uid()/auth.role() passam a ser avaliados uma vez por consulta, não por linha
--    ("auth_rls_initplan"). Resultado idêntico; só muda o plano de execução.

-- 1) Índices (CREATE INDEX IF NOT EXISTS é idempotente; colunas opcionais só se existirem no ambiente)
CREATE INDEX IF NOT EXISTS idx_schedule_slots_mass_id ON public.schedule_slots (mass_id);
CREATE INDEX IF NOT EXISTS idx_schedule_slots_profile_id ON public.schedule_slots (profile_id);
CREATE INDEX IF NOT EXISTS idx_announcements_profile_id ON public.announcements (profile_id);
CREATE INDEX IF NOT EXISTS idx_announcements_related_slot ON public.announcements (related_schedule_slot_id);
CREATE INDEX IF NOT EXISTS idx_announcement_views_profile_id ON public.announcement_views (profile_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_profile_id ON public.push_subscriptions (profile_id);
CREATE INDEX IF NOT EXISTS idx_unavailable_dates_profile_id ON public.unavailable_dates (profile_id);
DO $$
BEGIN
  IF to_regclass('public.schedule_assignment_history') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_assignment_history_profile_id ON public.schedule_assignment_history (profile_id);
    CREATE INDEX IF NOT EXISTS idx_assignment_history_actor ON public.schedule_assignment_history (actor_auth_user_id);
    CREATE INDEX IF NOT EXISTS idx_assignment_history_slot_id ON public.schedule_assignment_history (slot_id);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='announcement_views' AND column_name='user_id') THEN
    CREATE INDEX IF NOT EXISTS idx_announcement_views_user_id ON public.announcement_views (user_id);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='schedule_slots' AND column_name='original_profile_id') THEN
    CREATE INDEX IF NOT EXISTS idx_schedule_slots_original_profile_id ON public.schedule_slots (original_profile_id);
  END IF;
END $$;

-- 2) Função de trigger não deve ser exposta como RPC (o trigger continua funcionando: roda como dono da função)
DO $$
BEGIN
  IF to_regprocedure('public.handle_new_user()') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
  END IF;
END $$;

-- 3) Policies: troca auth.uid()/auth.role() por (select auth.uid())/(select auth.role()).
DO $$
DECLARE
  p record;
  new_qual text;
  new_check text;
  stmt text;
  pat constant text := '(?<!select )auth\.(uid|role|jwt)\(\)';
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (coalesce(qual, '') ~* pat OR coalesce(with_check, '') ~* pat)
  LOOP
    new_qual  := regexp_replace(p.qual,       pat, '(select auth.\1())', 'gi');
    new_check := regexp_replace(p.with_check, pat, '(select auth.\1())', 'gi');
    stmt := format('ALTER POLICY %I ON %I.%I', p.policyname, p.schemaname, p.tablename);
    IF p.qual IS NOT NULL THEN stmt := stmt || format(' USING (%s)', new_qual); END IF;
    IF p.with_check IS NOT NULL THEN stmt := stmt || format(' WITH CHECK (%s)', new_check); END IF;
    EXECUTE stmt;
  END LOOP;
END $$;

-- OPCIONAL (decisão de produto): tirar do Realtime tabelas que o app não usa (o código não usa `.channel(`).
-- O poller do Realtime consome CPU de banco continuamente. Só execute se nada externo assina essas mudanças.
--   ALTER PUBLICATION supabase_realtime DROP TABLE public.users, public.masses, public.schedule_slots,
--     public.announcements, public.announcement_views;
