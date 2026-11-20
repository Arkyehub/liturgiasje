-- Rollback de migration_v143_db_health.sql. Não apaga dados.
DROP INDEX IF EXISTS public.idx_schedule_slots_mass_id, public.idx_schedule_slots_profile_id,
  public.idx_announcements_profile_id, public.idx_announcements_related_slot,
  public.idx_announcement_views_profile_id, public.idx_push_subscriptions_profile_id,
  public.idx_unavailable_dates_profile_id, public.idx_assignment_history_profile_id,
  public.idx_assignment_history_actor, public.idx_assignment_history_slot_id,
  public.idx_announcement_views_user_id, public.idx_schedule_slots_original_profile_id;

DO $$
BEGIN
  IF to_regprocedure('public.handle_new_user()') IS NOT NULL THEN
    GRANT EXECUTE ON FUNCTION public.handle_new_user() TO PUBLIC, anon, authenticated;
  END IF;
END $$;

-- Desfaz o (select auth.xxx()) das policies (equivalente em resultado)
DO $$
DECLARE
  p record; new_qual text; new_check text; stmt text;
  pat constant text := '\(\s*select auth\.(uid|role|jwt)\(\)(\s+as\s+\w+)?\s*\)';
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname, qual, with_check FROM pg_policies
    WHERE schemaname = 'public' AND (coalesce(qual,'') ~* pat OR coalesce(with_check,'') ~* pat)
  LOOP
    new_qual  := regexp_replace(p.qual,       pat, 'auth.\1()', 'gi');
    new_check := regexp_replace(p.with_check, pat, 'auth.\1()', 'gi');
    stmt := format('ALTER POLICY %I ON %I.%I', p.policyname, p.schemaname, p.tablename);
    IF p.qual IS NOT NULL THEN stmt := stmt || format(' USING (%s)', new_qual); END IF;
    IF p.with_check IS NOT NULL THEN stmt := stmt || format(' WITH CHECK (%s)', new_check); END IF;
    EXECUTE stmt;
  END LOOP;
END $$;
