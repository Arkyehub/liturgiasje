GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
CREATE POLICY fixture_active_slots ON public.schedule_slots FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY fixture_active_masses ON public.masses FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY fixture_active_unavailable ON public.unavailable_dates FOR ALL TO authenticated USING (true) WITH CHECK (true);
