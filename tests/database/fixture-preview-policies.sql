-- Mirrors the policies/grants observed (read-only) in Supabase Preview on 2026-11-09, applied over schema.sql.
-- Synthetic and for an isolated PostgreSQL only. Replaces the deliberately permissive fixture-policies.sql.
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT policyname, tablename FROM pg_policies WHERE schemaname='public' LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN RETURN EXISTS (SELECT 1 FROM public.profiles WHERE auth_user_id = auth.uid() AND role = 'admin'); END; $$;
CREATE POLICY "Admins podem tudo" ON public.profiles FOR ALL USING (is_admin());
CREATE POLICY "Perfis visíveis por todos os autenticados" ON public.profiles FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Permitir reivindicar perfil não vinculado" ON public.profiles FOR UPDATE USING (auth_user_id IS NULL) WITH CHECK (auth_user_id = auth.uid());
CREATE POLICY "Usuários podem atualizar o próprio perfil" ON public.profiles FOR UPDATE USING ((auth.uid() = auth_user_id) OR is_admin());
CREATE POLICY "Usuários podem criar o próprio perfil" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = auth_user_id);
CREATE POLICY "Admins podem gerenciar missas" ON public.masses FOR ALL USING (EXISTS (SELECT 1 FROM profiles p WHERE p.auth_user_id = auth.uid() AND p.role = 'admin'));
CREATE POLICY "Masses are viewable by everyone" ON public.masses FOR SELECT USING (true);
CREATE POLICY "Admins podem gerenciar todas as vagas" ON public.schedule_slots FOR ALL USING (EXISTS (SELECT 1 FROM profiles p WHERE p.auth_user_id = auth.uid() AND p.role = 'admin'));
CREATE POLICY "Escalas visíveis por todos os autenticados" ON public.schedule_slots FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Usuários gerenciam suas próprias vagas" ON public.schedule_slots FOR UPDATE USING (EXISTS (SELECT 1 FROM profiles p WHERE p.auth_user_id = auth.uid() AND p.id = schedule_slots.profile_id)) WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.auth_user_id = auth.uid() AND p.id = schedule_slots.profile_id));
CREATE POLICY "Admins podem gerenciar avisos" ON public.announcements FOR ALL USING (EXISTS (SELECT 1 FROM profiles p WHERE p.auth_user_id = auth.uid() AND p.role = 'admin'));
CREATE POLICY "Announcements are viewable by everyone" ON public.announcements FOR SELECT USING (true);
CREATE POLICY "Admins gerenciam configurações" ON public.app_settings FOR ALL USING (EXISTS (SELECT 1 FROM profiles p WHERE p.auth_user_id = auth.uid() AND p.role = 'admin'));
CREATE POLICY "App settings are viewable by everyone" ON public.app_settings FOR SELECT USING (true);
CREATE POLICY "Usuários gerenciam suas notificações push" ON public.push_subscriptions FOR ALL USING (EXISTS (SELECT 1 FROM profiles p WHERE p.auth_user_id = auth.uid() AND (p.id = push_subscriptions.profile_id OR p.auth_user_id = push_subscriptions.user_id)));
CREATE POLICY "Usuários marcam como lido" ON public.announcement_views FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.auth_user_id = auth.uid() AND p.id = announcement_views.profile_id));
CREATE POLICY "Visualizações visíveis por donos ou admin" ON public.announcement_views FOR SELECT USING (EXISTS (SELECT 1 FROM profiles p WHERE p.auth_user_id = auth.uid() AND (p.role = 'admin' OR p.id = announcement_views.profile_id)));
CREATE POLICY "Usuários gerenciam suas indisponibilidades" ON public.unavailable_dates FOR ALL USING (EXISTS (SELECT 1 FROM profiles p WHERE p.auth_user_id = auth.uid() AND p.id = unavailable_dates.profile_id));
