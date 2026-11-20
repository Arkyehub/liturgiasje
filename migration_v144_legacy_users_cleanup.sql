-- v1.44 — limpeza da tabela legada public.users (NÃO APLICADO). Proposta; aplicar só com autorização específica,
-- primeiro no Preview, depois no Production. Rollback: migration_v144_legacy_users_cleanup_rollback.sql.
--
-- Por que existe: o app não lê public.users, mas o banco ainda depende dela:
--   * FKs push_subscriptions/unavailable_dates/announcement_views.user_id -> public.users(id)
--   * trigger on_auth_user_created (auth.users) -> handle_new_user() grava em public.users a cada cadastro
--   * policy de storage storage_media_admin_manage decide "admin" por public.users.role (e cada usuário pode
--     alterar a própria linha, inclusive role)
--   * public.users.id -> auth.users(id) SEM cascata: pode bloquear a exclusão de uma conta no Auth
--   * view users_public, função delete_user_by_admin (cita a tabela inexistente members), publicação Realtime
--
-- PRÉ-REQUISITO: nenhum job do pg_cron pode chamar a Edge Function `birthday-notifications` (ela lê public.users).
-- Migre os aniversários para /api/cron/birthdays (usa profiles e ignora arquivados) antes de aplicar.
--
-- A tabela não é apagada: vira public.users_legacy_backup, sem acesso pela API. Apague em definitivo depois de ~30 dias.

DO $$
DECLARE in_use boolean := false;
BEGIN
  IF to_regclass('public.users') IS NULL THEN
    RAISE NOTICE 'public.users não existe; nada a fazer';
    RETURN;
  END IF;
  -- SQL dinâmico: o schema cron só existe onde o pg_cron está instalado
  IF to_regclass('cron.job') IS NOT NULL THEN
    EXECUTE $q$SELECT EXISTS (SELECT 1 FROM cron.job WHERE active AND command ILIKE '%birthday-notifications%')$q$ INTO in_use;
    IF in_use THEN
      RAISE EXCEPTION 'legacy_users_in_use_by_cron_job: desagende o job que chama a Edge Function birthday-notifications antes';
    END IF;
  END IF;
END $$;

-- A) FKs passam a apontar para auth.users (os valores já são ids do Auth; sem órfãos no Preview e no Production)
DO $$
DECLARE t text; orphans int;
BEGIN
  FOREACH t IN ARRAY ARRAY['push_subscriptions','unavailable_dates','announcement_views'] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=t AND column_name='user_id') THEN
      -- Linhas cujo user_id não existe no Auth (ex.: contas de teste já removidas) impediriam a FK. O Preview tinha 3 (1 em
      -- unavailable_dates, 2 em announcement_views); o Production tinha 0. Mais de 10 em uma tabela indica estado inesperado: pare.
      EXECUTE format('SELECT count(*) FROM public.%I x WHERE x.user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM auth.users a WHERE a.id = x.user_id)', t) INTO orphans;
      IF orphans > 10 THEN RAISE EXCEPTION 'v144_orphans_unexpected: % linhas órfãs em %', orphans, t; END IF;
      IF orphans > 0 THEN
        RAISE NOTICE 'v144: removendo % linha(s) órfã(s) de %', orphans, t;
        EXECUTE format('DELETE FROM public.%I x WHERE x.user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM auth.users a WHERE a.id = x.user_id)', t);
      END IF;
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', t, t || '_user_id_fkey');
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID', t, t || '_user_id_fkey');
      EXECUTE format('ALTER TABLE public.%I VALIDATE CONSTRAINT %I', t, t || '_user_id_fkey');
    END IF;
  END LOOP;
END $$;

-- B) Admin do storage passa a vir de profiles (via is_admin()), não de public.users
DO $$
BEGIN
  IF to_regclass('storage.objects') IS NOT NULL AND EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND policyname='storage_media_admin_manage') THEN
    DROP POLICY storage_media_admin_manage ON storage.objects;
    CREATE POLICY storage_media_admin_manage ON storage.objects FOR ALL
      USING (bucket_id = 'announcement_media' AND public.is_admin())
      WITH CHECK (bucket_id = 'announcement_media' AND public.is_admin());
  END IF;
END $$;

-- C) Deixa de gravar na tabela legada a cada cadastro
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();
DROP FUNCTION IF EXISTS public.delete_user_by_admin(uuid);
DROP VIEW IF EXISTS public.users_public;

-- D) Tira a tabela do Realtime e arquiva
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='users') THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.users;
  END IF;
END $$;

DO $$
DECLARE p record;
BEGIN
  IF to_regclass('public.users') IS NOT NULL THEN
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='users' LOOP
      EXECUTE format('DROP POLICY %I ON public.users', p.policyname);
    END LOOP;
    ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_id_fkey;  -- não bloqueia mais a exclusão de contas do Auth
    ALTER TABLE public.users RENAME TO users_legacy_backup;
    ALTER TABLE public.users_legacy_backup ENABLE ROW LEVEL SECURITY;  -- sem policies: nenhum acesso pela API
    REVOKE ALL ON public.users_legacy_backup FROM PUBLIC, anon, authenticated;
    COMMENT ON TABLE public.users_legacy_backup IS 'Arquivo da antiga public.users (migration v1.44). Pode ser apagada após ~30 dias.';
  END IF;
END $$;
