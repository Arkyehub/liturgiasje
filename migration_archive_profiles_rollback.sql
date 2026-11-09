-- Rollback for migration_archive_profiles.sql (v1.39). Data-preserving: columns (archived_at, last_seen_at,
-- schedule_revision) and the schedule_assignment_history table/rows are KEPT, so a later re-apply loses nothing.
-- It restores the pre-v1.39 behaviour observed in Preview (is_admin without archived check, wide Data API grants).
-- Members archived while v1.39 was active stay archived_at-marked; clear them manually only if desired.
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['masses','schedule_slots','unavailable_dates','announcements','announcement_views','push_subscriptions'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS deny_archived_actor ON public.%I', t);
  END LOOP;
END $$;
DROP POLICY IF EXISTS deny_archived_actor_insert ON public.app_settings;
DROP POLICY IF EXISTS deny_archived_actor_update ON public.app_settings;
DROP POLICY IF EXISTS deny_archived_actor_delete ON public.app_settings;
DROP POLICY IF EXISTS profiles_archived_read_guard ON public.profiles;
DROP POLICY IF EXISTS profiles_archived_update_guard ON public.profiles;
DROP POLICY IF EXISTS v139_active_schedule_slots_read ON public.schedule_slots;
DROP POLICY IF EXISTS assignment_history_read ON public.schedule_assignment_history;

DROP TRIGGER IF EXISTS guard_profile_admin_state ON public.profiles;
DROP TRIGGER IF EXISTS guard_profile_insert ON public.profiles;
DROP TRIGGER IF EXISTS guard_active_slot_assignment ON public.schedule_slots;
DROP TRIGGER IF EXISTS guard_assignment_history ON public.schedule_slots;
DROP TRIGGER IF EXISTS record_slot_replacement ON public.schedule_slots;
DROP TRIGGER IF EXISTS bump_mass_revision_from_slot ON public.schedule_slots;
DROP TRIGGER IF EXISTS lock_mass_schedule_change ON public.masses;
DROP TRIGGER IF EXISTS guard_history_announcement ON public.announcements;
DROP TRIGGER IF EXISTS guard_linked_announcement_write ON public.announcements;

DROP FUNCTION IF EXISTS public.archive_member(uuid), public.unarchive_member(uuid), public.set_member_role(uuid,text),
  public.update_mass_with_slots(uuid,jsonb,jsonb), public.create_mass_with_slots(jsonb,jsonb), public.delete_mass_safely(uuid),
  public.delete_masses_safely(uuid[]), public.delete_announcement_safely(uuid), public.perform_slot_action(uuid,text,uuid),
  public.set_masses_publication(uuid[],boolean), public.publish_mass_month(text), public.save_schedule_batch(jsonb,jsonb),
  public.set_missing_mass_color(uuid,text), public.is_active_member(), public.actor_not_archived(),
  public.guard_profile_admin_state(), public.guard_profile_insert(), public.guard_active_slot_assignment(),
  public.guard_assignment_history(), public.record_slot_replacement(), public.lock_mass_schedule_change(),
  public.guard_history_announcement(), public.guard_linked_announcement_write(), public.bump_mass_revision_from_slot();

CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM public.profiles WHERE auth_user_id = auth.uid() AND role = 'admin');
END; $$;
GRANT EXECUTE ON FUNCTION public.is_admin() TO PUBLIC;

-- Restore the Data API grants that existed before the migration revoked them.
GRANT ALL ON public.profiles, public.masses, public.schedule_slots TO anon, authenticated;
