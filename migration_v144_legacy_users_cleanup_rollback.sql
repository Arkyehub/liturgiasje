-- Rollback de migration_v144_legacy_users_cleanup.sql. Restaura a estrutura e as permissões do Production
-- (capturadas em 20/11/2026). Dados da tabela são os mesmos: ela foi só renomeada.
DO $$
BEGIN
  IF to_regclass('public.users_legacy_backup') IS NULL THEN
    RAISE EXCEPTION 'public.users_legacy_backup não existe; nada para restaurar';
  END IF;
END $$;

ALTER TABLE public.users_legacy_backup RENAME TO users;
COMMENT ON TABLE public.users IS NULL;
-- NOT VALID: contas excluídas no Auth depois da migration deixam linhas órfãs no arquivo; a regra vale para linhas novas.
ALTER TABLE public.users ADD CONSTRAINT users_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) NOT VALID;
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE ON public.users TO %I', r);
    END IF;
  END LOOP;
END $$;

CREATE POLICY "Admins can update users" ON public.users FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users users_1 WHERE users_1.id = auth.uid() AND users_1.role = 'admin'));
CREATE POLICY "Users are viewable by authenticated users" ON public.users FOR SELECT TO public USING (auth.role() = 'authenticated');
CREATE POLICY "Users can update their own profile" ON public.users FOR UPDATE TO public USING (auth.uid() = id);
CREATE POLICY "Usuários autenticados podem ver nomes e fotos de todos." ON public.users FOR SELECT TO authenticated USING (true);
CREATE POLICY "Usuários podem atualizar o próprio perfil." ON public.users FOR UPDATE TO public USING (auth.uid() = id);
CREATE POLICY "Usuários podem criar o próprio perfil." ON public.users FOR INSERT TO public WITH CHECK (auth.uid() = id);
CREATE POLICY users_select_all ON public.users FOR SELECT TO public USING (auth.role() = 'authenticated');
CREATE POLICY users_update_own ON public.users FOR UPDATE TO public USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Contas criadas depois da migration não têm linha em users (o trigger foi removido). Recria como o trigger antigo
-- faria; sem isso as FKs abaixo não conseguem voltar a apontar para public.users.
INSERT INTO public.users (id, email, full_name, role)
SELECT a.id, a.email, COALESCE(a.raw_user_meta_data->>'full_name', a.raw_user_meta_data->>'name', 'Novo Usuário'), 'reader'
FROM auth.users a
WHERE NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = a.id)
ON CONFLICT DO NOTHING;

CREATE OR REPLACE VIEW public.users_public AS SELECT id, full_name, avatar_url FROM public.users;
GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE ON public.users_public TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, role)
  VALUES (new.id, new.email, COALESCE(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', 'Novo Usuário'), 'reader')
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END; $$;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['push_subscriptions','unavailable_dates','announcement_views'] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=t AND column_name='user_id') THEN
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', t, t || '_user_id_fkey');
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE', t, t || '_user_id_fkey');
    END IF;
  END LOOP;
END $$;

DO $$
BEGIN
  IF to_regclass('storage.objects') IS NOT NULL AND EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND policyname='storage_media_admin_manage') THEN
    DROP POLICY storage_media_admin_manage ON storage.objects;
    CREATE POLICY storage_media_admin_manage ON storage.objects FOR ALL TO public
      USING (bucket_id = 'announcement_media' AND EXISTS (SELECT 1 FROM public.users WHERE users.id = auth.uid() AND users.role = 'admin'));
  END IF;
END $$;
-- (opcional) devolver ao Realtime: ALTER PUBLICATION supabase_realtime ADD TABLE public.users;
-- A função delete_user_by_admin(uuid) não é restaurada: citava a tabela inexistente public.members.
