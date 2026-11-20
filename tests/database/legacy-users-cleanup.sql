\set ON_ERROR_STOP on
-- Réplica da estrutura legada do Production (capturada em 20/11/2026) sobre fixture.sql + schema base.
-- Rodar a partir da raiz do repositório:  psql -X -v ON_ERROR_STOP=1 -d <banco> -f tests/database/legacy-users-cleanup.sql
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS email text, ADD COLUMN IF NOT EXISTS raw_user_meta_data jsonb;
CREATE TABLE public.users (
  id uuid PRIMARY KEY REFERENCES auth.users(id),
  email text UNIQUE, full_name text, avatar_url text,
  role text DEFAULT 'reader' CHECK (role IN ('admin','reader')),
  birth_date date, created_at timestamptz DEFAULT now()
);
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
CREATE POLICY users_select_all ON public.users FOR SELECT TO public USING (auth.role() = 'authenticated');
CREATE POLICY users_update_own ON public.users FOR UPDATE TO public USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
GRANT ALL ON public.users TO anon, authenticated;
ALTER TABLE public.unavailable_dates ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.announcement_views ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.push_subscriptions DROP CONSTRAINT IF EXISTS push_subscriptions_user_id_fkey;
ALTER TABLE public.push_subscriptions ADD CONSTRAINT push_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
ALTER TABLE public.unavailable_dates ADD CONSTRAINT unavailable_dates_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
ALTER TABLE public.announcement_views ADD CONSTRAINT announcement_views_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
CREATE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN INSERT INTO public.users (id, email, full_name, role) VALUES (new.id, new.email, 'Novo', 'reader') ON CONFLICT (id) DO NOTHING; RETURN new; END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
CREATE VIEW public.users_public AS SELECT id, full_name, avatar_url FROM public.users;
CREATE FUNCTION public.delete_user_by_admin(target_user_id uuid) RETURNS void LANGUAGE plpgsql AS $$ BEGIN DELETE FROM public.members WHERE claimed_by = target_user_id; END; $$;

-- dados de teste: duas contas (cada uma com linha em users pelo trigger) e dependências por user_id
INSERT INTO auth.users(id, email) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','a@exemplo.test'),('aaaaaaaa-0000-0000-0000-000000000002','b@exemplo.test');
INSERT INTO public.push_subscriptions(user_id, subscription) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','{"endpoint":"e1"}'),('aaaaaaaa-0000-0000-0000-000000000002','{"endpoint":"e2"}');
INSERT INTO public.unavailable_dates(user_id, date) VALUES ('aaaaaaaa-0000-0000-0000-000000000001', current_date + 3);

-- estado ANTES: reproduz os problemas
DO $$ BEGIN
  IF (SELECT count(*) FROM public.users) <> 2 THEN RAISE EXCEPTION 'setup: trigger legado deveria ter criado 2 linhas'; END IF;
  BEGIN
    DELETE FROM auth.users WHERE id = 'aaaaaaaa-0000-0000-0000-000000000002';
    RAISE EXCEPTION 'esperado: exclusão da conta bloqueada pela FK sem cascata de public.users';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
END $$;

\i migration_v144_legacy_users_cleanup.sql

-- estado DEPOIS
DO $$
DECLARE n int;
BEGIN
  IF to_regclass('public.users') IS NOT NULL THEN RAISE EXCEPTION 'public.users ainda existe'; END IF;
  IF to_regclass('public.users_legacy_backup') IS NULL THEN RAISE EXCEPTION 'arquivo users_legacy_backup não foi criado'; END IF;
  SELECT count(*) INTO n FROM public.users_legacy_backup; IF n <> 2 THEN RAISE EXCEPTION 'dados do arquivo mudaram (%)', n; END IF;
  IF has_table_privilege('anon','public.users_legacy_backup','SELECT') OR has_table_privilege('authenticated','public.users_legacy_backup','SELECT') THEN RAISE EXCEPTION 'API ainda acessa o arquivo'; END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename IN ('users','users_legacy_backup')) THEN RAISE EXCEPTION 'sobraram policies'; END IF;
  IF to_regclass('public.users_public') IS NOT NULL THEN RAISE EXCEPTION 'view legada ainda existe'; END IF;
  IF to_regprocedure('public.handle_new_user()') IS NOT NULL OR to_regprocedure('public.delete_user_by_admin(uuid)') IS NOT NULL THEN RAISE EXCEPTION 'funções legadas ainda existem'; END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='on_auth_user_created' AND NOT tgisinternal) THEN RAISE EXCEPTION 'trigger ainda existe'; END IF;
  -- as 3 FKs agora apontam para auth.users com cascata
  SELECT count(*) INTO n FROM pg_constraint WHERE contype='f' AND confrelid='auth.users'::regclass AND confdeltype='c'
    AND conname IN ('push_subscriptions_user_id_fkey','unavailable_dates_user_id_fkey','announcement_views_user_id_fkey');
  IF n <> 3 THEN RAISE EXCEPTION 'FKs não migraram (%)', n; END IF;
  -- novo cadastro não grava mais na tabela legada, e uma assinatura push funciona sem linha em users
  INSERT INTO auth.users(id, email) VALUES ('aaaaaaaa-0000-0000-0000-000000000003','c@exemplo.test');
  IF (SELECT count(*) FROM public.users_legacy_backup) <> 2 THEN RAISE EXCEPTION 'novo cadastro ainda grava na tabela legada'; END IF;
  INSERT INTO public.push_subscriptions(user_id, subscription) VALUES ('aaaaaaaa-0000-0000-0000-000000000003','{"endpoint":"e3"}');
  -- excluir conta do Auth agora funciona e leva as dependências junto
  DELETE FROM auth.users WHERE id = 'aaaaaaaa-0000-0000-0000-000000000002';
  IF EXISTS (SELECT 1 FROM public.push_subscriptions WHERE user_id='aaaaaaaa-0000-0000-0000-000000000002') THEN RAISE EXCEPTION 'cascata não removeu push'; END IF;
  -- FK rejeita user_id inexistente no Auth
  BEGIN INSERT INTO public.push_subscriptions(user_id, subscription) VALUES (gen_random_uuid(),'{"endpoint":"x"}'); RAISE EXCEPTION 'FK deveria rejeitar'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
END $$;
-- idempotência: reaplicar não falha
\i migration_v144_legacy_users_cleanup.sql

-- ROLLBACK restaura a estrutura
\i migration_v144_legacy_users_cleanup_rollback.sql
DO $$
BEGIN
  IF to_regclass('public.users') IS NULL OR to_regclass('public.users_public') IS NULL THEN RAISE EXCEPTION 'rollback não restaurou tabela/view'; END IF;
  IF (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='users') <> 8 THEN RAISE EXCEPTION 'rollback não restaurou as 8 policies'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='on_auth_user_created') THEN RAISE EXCEPTION 'rollback não restaurou o trigger'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_subscriptions_user_id_fkey' AND confrelid='public.users'::regclass) THEN RAISE EXCEPTION 'rollback não restaurou a FK'; END IF;
END $$;
SELECT 'legacy users cleanup + rollback assertions passed' AS result;
