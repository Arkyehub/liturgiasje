-- v1.39 member archiving. Validated against an isolated PostgreSQL mirroring the Supabase Preview policies
-- (tests/database). Recovery: migration_archive_profiles_rollback.sql. Never apply to Production without explicit authorization.
-- Same-day celebrations are conservatively left untouched because duration and timezone are not stored.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;
ALTER TABLE public.masses ADD COLUMN IF NOT EXISTS schedule_revision bigint NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.schedule_assignment_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id uuid NOT NULL,
  mass_id uuid NOT NULL,
  role text,
  profile_id uuid NOT NULL REFERENCES public.profiles(id),
  event_type text NOT NULL CHECK (event_type IN ('member_archived', 'assignment_changed')),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_auth_user_id uuid REFERENCES auth.users(id)
);
ALTER TABLE public.schedule_assignment_history ALTER COLUMN role DROP NOT NULL;
ALTER TABLE public.schedule_assignment_history ENABLE ROW LEVEL SECURITY;

-- Serialize archive and role changes. The trigger also protects direct updates.
CREATE OR REPLACE FUNCTION public.guard_profile_admin_state() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(13739001);
  IF auth.uid() IS NOT NULL AND OLD.archived_at IS NOT NULL AND OLD.auth_user_id IS NULL AND NEW.auth_user_id IS NOT NULL THEN
    RAISE EXCEPTION 'archived_profile_claim_forbidden' USING ERRCODE = '42501';
  END IF;
  IF OLD.role = 'admin' AND OLD.archived_at IS NULL
     AND (NEW.role IS DISTINCT FROM 'admin' OR NEW.archived_at IS NOT NULL) THEN
    IF OLD.auth_user_id = auth.uid() AND NEW.archived_at IS NOT NULL THEN
      RAISE EXCEPTION 'self_archive_forbidden';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id <> OLD.id AND p.role = 'admin' AND p.archived_at IS NULL AND p.auth_user_id IS NOT NULL) THEN
      RAISE EXCEPTION 'last_admin_forbidden';
    END IF;
  END IF;
  IF auth.uid() = OLD.auth_user_id AND (NEW.role IS DISTINCT FROM OLD.role OR NEW.archived_at IS DISTINCT FROM OLD.archived_at) THEN
    RAISE EXCEPTION 'self_privilege_change_forbidden';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_profile_admin_state ON public.profiles;
CREATE TRIGGER guard_profile_admin_state BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.guard_profile_admin_state();

-- Reject assignment of an archived profile and serialize assignment against archiving.
CREATE OR REPLACE FUNCTION public.guard_active_slot_assignment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(13739001);
  IF TG_OP = 'UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR NEW.mass_id IS DISTINCT FROM OLD.mass_id)
     AND EXISTS (SELECT 1 FROM public.schedule_assignment_history WHERE slot_id = OLD.id) THEN
    RAISE EXCEPTION 'slot_has_assignment_history';
  END IF;
  IF NEW.profile_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.profile_id IS DISTINCT FROM OLD.profile_id)
     AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.profile_id AND archived_at IS NULL) THEN
    RAISE EXCEPTION 'inactive_profile_assignment';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_active_slot_assignment ON public.schedule_slots;
CREATE TRIGGER guard_active_slot_assignment BEFORE INSERT OR UPDATE ON public.schedule_slots FOR EACH ROW EXECUTE FUNCTION public.guard_active_slot_assignment();

-- Do not let the existing delete-and-recreate editor discard a recorded assignment.
CREATE OR REPLACE FUNCTION public.guard_assignment_history() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(13739001);
  IF EXISTS (SELECT 1 FROM public.schedule_assignment_history WHERE slot_id = OLD.id) THEN
    RAISE EXCEPTION 'slot_has_assignment_history';
  END IF;
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS guard_assignment_history ON public.schedule_slots;
CREATE TRIGGER guard_assignment_history BEFORE DELETE ON public.schedule_slots FOR EACH ROW EXECUTE FUNCTION public.guard_assignment_history();

CREATE OR REPLACE FUNCTION public.archive_member(target_profile_id uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE actor uuid := auth.uid(); target public.profiles%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(13739001);
  IF actor IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE auth_user_id = actor AND role = 'admin' AND archived_at IS NULL) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO target FROM public.profiles WHERE id = target_profile_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'profile_not_found' USING ERRCODE = 'P0002'; END IF;
  IF target.auth_user_id = actor THEN RAISE EXCEPTION 'self_archive_forbidden' USING ERRCODE = '42501'; END IF;
  IF target.archived_at IS NOT NULL THEN RETURN 'already_archived'; END IF;
  INSERT INTO public.schedule_assignment_history(slot_id, mass_id, role, profile_id, event_type, actor_auth_user_id)
    SELECT s.id, s.mass_id, s.role, s.profile_id, 'member_archived', actor
    FROM public.schedule_slots s JOIN public.masses m ON m.id = s.mass_id
    WHERE s.profile_id = target_profile_id AND m.date > (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  UPDATE public.schedule_slots s SET profile_id = NULL, is_confirmed = false, is_swap_requested = false
    FROM public.masses m WHERE s.mass_id = m.id AND s.profile_id = target_profile_id
    AND m.date > (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  UPDATE public.profiles SET archived_at = now() WHERE id = target_profile_id;
  RETURN 'archived';
END $$;
REVOKE ALL ON FUNCTION public.archive_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.archive_member(uuid) TO authenticated;

-- Reactivation is an explicit administrator action. Freed slots are not restored (the history keeps them),
-- and a former administrator returns as a reader so privileges are never restored implicitly.
CREATE OR REPLACE FUNCTION public.unarchive_member(target_profile_id uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE actor uuid := auth.uid(); target public.profiles%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(13739001);
  IF actor IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE auth_user_id = actor AND role = 'admin' AND archived_at IS NULL) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO target FROM public.profiles WHERE id = target_profile_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'profile_not_found' USING ERRCODE = 'P0002'; END IF;
  IF target.archived_at IS NULL THEN RETURN 'not_archived'; END IF;
  UPDATE public.profiles SET archived_at = NULL, role = 'reader' WHERE id = target_profile_id;
  RETURN 'unarchived';
END $$;
REVOKE ALL ON FUNCTION public.unarchive_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unarchive_member(uuid) TO authenticated;

-- History contains references to people; only active members may read it.
CREATE OR REPLACE FUNCTION public.is_active_member() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE auth_user_id = auth.uid() AND archived_at IS NULL)
$$;
REVOKE ALL ON FUNCTION public.is_active_member() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_active_member() TO authenticated;
DROP POLICY IF EXISTS assignment_history_read ON public.schedule_assignment_history;
CREATE POLICY assignment_history_read ON public.schedule_assignment_history FOR SELECT TO authenticated USING (public.is_active_member());
GRANT SELECT ON public.schedule_assignment_history TO authenticated;

CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE auth_user_id = auth.uid() AND role = 'admin' AND archived_at IS NULL)
$$;
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- Active members can read published assignments; administrators can also read drafts.
-- The restrictive archived-actor policy below still denies archived users.
DROP POLICY IF EXISTS v139_active_schedule_slots_read ON public.schedule_slots;
CREATE POLICY v139_active_schedule_slots_read ON public.schedule_slots FOR SELECT TO authenticated
  USING (public.is_active_member() AND (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.masses m WHERE m.id = schedule_slots.mass_id AND m.is_published IS TRUE
    )
  ));
GRANT SELECT ON public.schedule_slots TO authenticated;

-- Restrictive policies supplement, but do not replace, each table's existing policies.
-- Accounts without a linked profile still require onboarding; only archived actors are denied.
CREATE OR REPLACE FUNCTION public.actor_not_archived() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE auth_user_id = auth.uid() AND archived_at IS NOT NULL
  )
$$;
REVOKE ALL ON FUNCTION public.actor_not_archived() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.actor_not_archived() TO authenticated;
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['masses','schedule_slots','unavailable_dates','announcements','announcement_views','push_subscriptions'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS deny_archived_actor ON public.%I', table_name);
    EXECUTE format('CREATE POLICY deny_archived_actor ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.actor_not_archived()) WITH CHECK (public.actor_not_archived())', table_name);
  END LOOP;
END $$;
-- app_settings stays publicly readable (version check), but archived actors may not write it.
DO $$
DECLARE cmd text;
BEGIN
  FOREACH cmd IN ARRAY ARRAY['INSERT','UPDATE','DELETE'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS deny_archived_actor_%s ON public.app_settings', lower(cmd));
  END LOOP;
  CREATE POLICY deny_archived_actor_insert ON public.app_settings AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.actor_not_archived());
  CREATE POLICY deny_archived_actor_update ON public.app_settings AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.actor_not_archived()) WITH CHECK (public.actor_not_archived());
  CREATE POLICY deny_archived_actor_delete ON public.app_settings AS RESTRICTIVE FOR DELETE TO authenticated USING (public.actor_not_archived());
END $$;
DROP POLICY IF EXISTS profiles_archived_read_guard ON public.profiles;
CREATE POLICY profiles_archived_read_guard ON public.profiles AS RESTRICTIVE FOR SELECT TO authenticated
  USING (public.actor_not_archived() OR auth_user_id = auth.uid());
DROP POLICY IF EXISTS profiles_archived_update_guard ON public.profiles;
CREATE POLICY profiles_archived_update_guard ON public.profiles AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.actor_not_archived()) WITH CHECK (public.actor_not_archived());
REVOKE DELETE ON public.profiles FROM PUBLIC, anon, authenticated;

-- Role and archive changes must not be writable through the Data API (verified by the check below).
REVOKE UPDATE ON public.profiles FROM PUBLIC, anon, authenticated;
DO $$
DECLARE columns_to_grant text;
BEGIN
  SELECT string_agg(format('%I', a.attname), ', ') INTO columns_to_grant
    FROM pg_attribute a
    WHERE a.attrelid = 'public.profiles'::regclass AND a.attnum > 0 AND NOT a.attisdropped
      AND a.attname = ANY(ARRAY['auth_user_id','email','full_name','avatar_url','whatsapp','birth_date','preferences','claimed_at','updated_at','last_seen_at']);
  IF columns_to_grant IS NOT NULL THEN
    EXECUTE format('GRANT UPDATE (%s) ON public.profiles TO authenticated', columns_to_grant);
  END IF;
  IF has_column_privilege('authenticated', 'public.profiles', 'role', 'UPDATE')
     OR has_column_privilege('authenticated', 'public.profiles', 'archived_at', 'UPDATE')
     OR has_column_privilege('anon', 'public.profiles', 'role', 'UPDATE')
     OR has_column_privilege('anon', 'public.profiles', 'archived_at', 'UPDATE') THEN
    RAISE EXCEPTION 'inherited_sensitive_profile_update_privilege';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.set_member_role(target_profile_id uuid, new_role text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE actor uuid := auth.uid();
BEGIN
  PERFORM pg_advisory_xact_lock(13739001);
  IF actor IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE auth_user_id = actor AND role = 'admin' AND archived_at IS NULL) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF new_role NOT IN ('admin','reader') OR new_role IS NULL THEN RAISE EXCEPTION 'invalid_role'; END IF;
  UPDATE public.profiles SET role = new_role WHERE id = target_profile_id AND archived_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'profile_not_found' USING ERRCODE = 'P0002'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.set_member_role(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_member_role(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_profile_insert() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND (NEW.role IS DISTINCT FROM 'reader' OR NEW.archived_at IS NOT NULL) THEN
    RAISE EXCEPTION 'invalid_initial_profile_state' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_profile_insert ON public.profiles;
CREATE TRIGGER guard_profile_insert BEFORE INSERT ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.guard_profile_insert();

CREATE OR REPLACE FUNCTION public.update_mass_with_slots(target_mass_id uuid, mass_data jsonb, slot_data jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE actor uuid := auth.uid(); slot jsonb; slot_key uuid; assigned uuid; retained uuid[] := ARRAY[]::uuid[];
BEGIN
  PERFORM pg_advisory_xact_lock(13739001);
  IF actor IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE auth_user_id = actor AND role = 'admin' AND archived_at IS NULL) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(slot_data) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'invalid_slots'; END IF;
  UPDATE public.masses SET date = (mass_data->>'date')::date, time = (mass_data->>'time')::time,
    special_description = mass_data->>'special_description', month_reference = mass_data->>'month_reference',
    liturgical_color = mass_data->>'liturgical_color', is_published = false WHERE id = target_mass_id AND schedule_revision = (mass_data->>'expected_revision')::bigint;
  IF NOT FOUND THEN RAISE EXCEPTION 'schedule_conflict'; END IF;
  FOR slot IN SELECT * FROM jsonb_array_elements(slot_data) LOOP
    slot_key := NULLIF(slot->>'id','')::uuid;
    assigned := NULLIF(slot->>'profileId','')::uuid;
    IF slot_key IS NOT NULL THEN
      IF slot_key = ANY(retained) THEN RAISE EXCEPTION 'duplicate_slot'; END IF;
      UPDATE public.schedule_slots SET role = slot->>'role', profile_id = assigned,
        is_confirmed = CASE WHEN profile_id IS DISTINCT FROM assigned THEN false ELSE is_confirmed END,
        is_swap_requested = CASE WHEN profile_id IS DISTINCT FROM assigned THEN false ELSE is_swap_requested END
        WHERE id = slot_key AND mass_id = target_mass_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'slot_not_found'; END IF;
      retained := array_append(retained, slot_key);
    ELSE
      INSERT INTO public.schedule_slots(mass_id, role, profile_id) VALUES(target_mass_id, slot->>'role', assigned) RETURNING id INTO slot_key;
      retained := array_append(retained, slot_key);
    END IF;
  END LOOP;
  DELETE FROM public.schedule_slots WHERE mass_id = target_mass_id AND NOT (id = ANY(retained));
END $$;
REVOKE ALL ON FUNCTION public.update_mass_with_slots(uuid,jsonb,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_mass_with_slots(uuid,jsonb,jsonb) TO authenticated;

-- Preserve successive replacements without overwriting original_profile_id.
CREATE OR REPLACE FUNCTION public.record_slot_replacement() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF OLD.profile_id IS NOT NULL AND OLD.profile_id IS DISTINCT FROM NEW.profile_id
     AND NOT (NEW.profile_id IS NULL AND EXISTS (
       SELECT 1 FROM public.schedule_assignment_history h
       WHERE h.slot_id = OLD.id AND h.profile_id = OLD.profile_id
         AND h.event_type = 'member_archived' AND h.occurred_at = now()
         AND h.actor_auth_user_id IS NOT DISTINCT FROM auth.uid()
     )) THEN
    INSERT INTO public.schedule_assignment_history(slot_id, mass_id, role, profile_id, event_type, actor_auth_user_id)
      VALUES(OLD.id, OLD.mass_id, OLD.role, OLD.profile_id, 'assignment_changed', auth.uid());
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS record_slot_replacement ON public.schedule_slots;
CREATE TRIGGER record_slot_replacement AFTER UPDATE OF profile_id ON public.schedule_slots FOR EACH ROW EXECUTE FUNCTION public.record_slot_replacement();

-- Serialize date/time changes against archiving as well as slot changes.
CREATE OR REPLACE FUNCTION public.lock_mass_schedule_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(13739001);
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  NEW.schedule_revision := OLD.schedule_revision + 1;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS lock_mass_schedule_change ON public.masses;
CREATE TRIGGER lock_mass_schedule_change BEFORE UPDATE OR DELETE ON public.masses FOR EACH ROW EXECUTE FUNCTION public.lock_mass_schedule_change();

CREATE OR REPLACE FUNCTION public.delete_mass_safely(target_mass_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE actor uuid := auth.uid();
BEGIN
  PERFORM pg_advisory_xact_lock(13739001);
  IF actor IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE auth_user_id = actor AND role = 'admin' AND archived_at IS NULL) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.schedule_assignment_history WHERE mass_id = target_mass_id) THEN
    RAISE EXCEPTION 'mass_has_assignment_history';
  END IF;
  DELETE FROM public.announcements WHERE related_schedule_slot_id IN (SELECT id FROM public.schedule_slots WHERE mass_id = target_mass_id);
  DELETE FROM public.schedule_slots WHERE mass_id = target_mass_id;
  DELETE FROM public.masses WHERE id = target_mass_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'mass_not_found' USING ERRCODE = 'P0002'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.delete_mass_safely(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_mass_safely(uuid) TO authenticated;

-- Old clients delete announcements before slots. Protect related announcements too.
CREATE OR REPLACE FUNCTION public.guard_history_announcement() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(13739001);
  IF OLD.related_schedule_slot_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.schedule_assignment_history WHERE slot_id = OLD.related_schedule_slot_id
  ) THEN RAISE EXCEPTION 'announcement_has_assignment_history'; END IF;
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS guard_history_announcement ON public.announcements;
CREATE TRIGGER guard_history_announcement BEFORE DELETE ON public.announcements FOR EACH ROW EXECUTE FUNCTION public.guard_history_announcement();

-- Trigger functions are invoked by PostgreSQL, never directly as RPC.
REVOKE ALL ON FUNCTION public.guard_profile_admin_state() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_active_slot_assignment() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_assignment_history() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_profile_insert() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_slot_replacement() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lock_mass_schedule_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_history_announcement() FROM PUBLIC, anon, authenticated;

-- Write boundary: create a mass and all its slots in one transaction.
CREATE OR REPLACE FUNCTION public.create_mass_with_slots(mass_data jsonb, slot_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE actor uuid := auth.uid(); created public.masses%ROWTYPE; slot jsonb;
BEGIN
  PERFORM pg_advisory_xact_lock(13739001);
  IF actor IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE auth_user_id = actor AND role = 'admin' AND archived_at IS NULL) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(slot_data) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'invalid_slots'; END IF;
  INSERT INTO public.masses(date,time,special_description,month_reference,liturgical_color,is_published)
    VALUES ((mass_data->>'date')::date,(mass_data->>'time')::time,mass_data->>'special_description',mass_data->>'month_reference',mass_data->>'liturgical_color',false)
    RETURNING * INTO created;
  FOR slot IN SELECT * FROM jsonb_array_elements(slot_data) LOOP
    INSERT INTO public.schedule_slots(mass_id,role,profile_id)
      VALUES (created.id,slot->>'role',NULLIF(slot->>'profileId','')::uuid);
  END LOOP;
  SELECT * INTO created FROM public.masses WHERE id=created.id;
  RETURN to_jsonb(created);
END $$;
REVOKE ALL ON FUNCTION public.create_mass_with_slots(jsonb,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_mass_with_slots(jsonb,jsonb) TO authenticated;

-- Single-slot actions bind the operation to the authenticated active member.
CREATE OR REPLACE FUNCTION public.perform_slot_action(target_slot_id uuid, action_name text, requested_profile_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE actor uuid := auth.uid(); member public.profiles%ROWTYPE; target public.schedule_slots%ROWTYPE; previous_auth uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(13739001);
  SELECT * INTO member FROM public.profiles WHERE auth_user_id=actor AND archived_at IS NULL;
  IF actor IS NULL OR NOT FOUND THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  IF requested_profile_id IS NOT NULL AND requested_profile_id <> member.id THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  SELECT s.* INTO target FROM public.schedule_slots s JOIN public.masses m ON m.id=s.mass_id
    WHERE s.id=target_slot_id AND m.is_published AND m.date >= (now() AT TIME ZONE 'America/Sao_Paulo')::date FOR UPDATE OF s;
  IF NOT FOUND THEN RAISE EXCEPTION 'slot_not_available' USING ERRCODE='P0002'; END IF;
  IF action_name = 'confirm' AND target.profile_id=member.id THEN
    UPDATE public.schedule_slots SET is_confirmed=true WHERE id=target.id RETURNING * INTO target;
  ELSIF action_name = 'request_swap' AND target.profile_id=member.id THEN
    UPDATE public.schedule_slots SET is_swap_requested=true WHERE id=target.id RETURNING * INTO target;
  ELSIF action_name = 'cancel_swap' AND target.profile_id=member.id THEN
    UPDATE public.schedule_slots SET is_swap_requested=false WHERE id=target.id RETURNING * INTO target;
  ELSIF action_name = 'accept_swap' AND target.is_swap_requested AND target.profile_id IS DISTINCT FROM member.id THEN
    SELECT auth_user_id INTO previous_auth FROM public.profiles WHERE id=target.profile_id;
    UPDATE public.schedule_slots SET profile_id=member.id,is_swap_requested=false,is_confirmed=true WHERE id=target.id RETURNING * INTO target;
  ELSE
    RAISE EXCEPTION 'forbidden_slot_action' USING ERRCODE='42501';
  END IF;
  RETURN jsonb_build_object('slot',to_jsonb(target),'profile',jsonb_build_object('id',member.id,'full_name',member.full_name,'avatar_url',member.avatar_url,'auth_user_id',member.auth_user_id,'archived_at',member.archived_at),'previous_auth_user_id',previous_auth);
END $$;
REVOKE ALL ON FUNCTION public.perform_slot_action(uuid,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.perform_slot_action(uuid,text,uuid) TO authenticated;

-- Deny multi-request legacy writes before their first modification.
REVOKE INSERT, UPDATE, DELETE ON public.masses, public.schedule_slots FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.profiles, public.masses, public.schedule_slots, public.schedule_assignment_history FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.schedule_assignment_history FROM PUBLIC, anon, authenticated;
GRANT UPDATE (is_published, liturgical_color) ON public.masses TO authenticated;
DO $$
DECLARE r text; col record;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF has_table_privilege(r,'public.masses','INSERT') OR has_table_privilege(r,'public.masses','DELETE')
       OR has_table_privilege(r,'public.masses','TRUNCATE')
       OR has_table_privilege(r,'public.schedule_slots','INSERT') OR has_table_privilege(r,'public.schedule_slots','DELETE')
       OR has_table_privilege(r,'public.schedule_slots','TRUNCATE')
       OR has_table_privilege(r,'public.schedule_assignment_history','INSERT')
       OR has_table_privilege(r,'public.schedule_assignment_history','UPDATE')
       OR has_table_privilege(r,'public.schedule_assignment_history','DELETE')
       OR has_table_privilege(r,'public.schedule_assignment_history','TRUNCATE')
       OR has_table_privilege(r,'public.profiles','TRUNCATE') THEN
      RAISE EXCEPTION 'inherited_schedule_write_privilege: %', r;
    END IF;
    IF has_table_privilege(r,'public.masses','REFERENCES') OR has_table_privilege(r,'public.masses','TRIGGER')
       OR has_table_privilege(r,'public.schedule_slots','REFERENCES') OR has_table_privilege(r,'public.schedule_slots','TRIGGER')
       OR has_table_privilege(r,'public.schedule_assignment_history','REFERENCES')
       OR has_table_privilege(r,'public.schedule_assignment_history','TRIGGER')
       OR has_table_privilege(r,'public.profiles','REFERENCES') OR has_table_privilege(r,'public.profiles','TRIGGER') THEN
      RAISE EXCEPTION 'inherited_schedule_ddl_privilege: %', r;
    END IF;
    FOR col IN SELECT attname FROM pg_attribute WHERE attrelid='public.masses'::regclass AND attnum>0 AND NOT attisdropped AND attname NOT IN ('is_published','liturgical_color') LOOP
      IF has_column_privilege(r,'public.masses',col.attname,'UPDATE') THEN RAISE EXCEPTION 'inherited_mass_update_privilege: %.%',r,col.attname; END IF;
    END LOOP;
    FOR col IN SELECT attname FROM pg_attribute WHERE attrelid='public.schedule_slots'::regclass AND attnum>0 AND NOT attisdropped LOOP
      IF has_column_privilege(r,'public.schedule_slots',col.attname,'UPDATE') THEN RAISE EXCEPTION 'inherited_slot_update_privilege: %.%',r,col.attname; END IF;
    END LOOP;
  END LOOP;
  IF has_function_privilege('anon','public.is_admin()','EXECUTE') THEN
    RAISE EXCEPTION 'exposed_admin_probe_rpc';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.set_masses_publication(target_mass_ids uuid[], publish boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog, public AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(13739001);
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  IF target_mass_ids IS NULL OR publish IS NULL THEN RAISE EXCEPTION 'invalid_arguments'; END IF;
  UPDATE public.masses SET is_published=publish WHERE id=ANY(target_mass_ids);
END $$;
REVOKE ALL ON FUNCTION public.set_masses_publication(uuid[],boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_masses_publication(uuid[],boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.publish_mass_month(target_month text) RETURNS TABLE(id uuid, date date)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog, public AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(13739001);
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  IF target_month IS NULL THEN RAISE EXCEPTION 'invalid_arguments'; END IF;
  RETURN QUERY UPDATE public.masses m SET is_published=true WHERE m.month_reference=target_month RETURNING m.id,m.date;
END $$;
REVOKE ALL ON FUNCTION public.publish_mass_month(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_mass_month(text) TO authenticated;

REVOKE UPDATE (is_published, liturgical_color) ON public.masses FROM PUBLIC, anon, authenticated;
DO $$
DECLARE r text; c record;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
    FOR c IN SELECT attname FROM pg_attribute WHERE attrelid='public.masses'::regclass AND attnum>0 AND NOT attisdropped LOOP
      IF has_column_privilege(r,'public.masses',c.attname,'UPDATE') THEN RAISE EXCEPTION 'inherited_mass_update_privilege: %.%',r,c.attname; END IF;
    END LOOP;
  END LOOP;
END $$;

-- Do not rely on table grants alone: explicit or inherited column grants must also fail closed.
REVOKE INSERT, UPDATE, DELETE ON public.schedule_assignment_history FROM PUBLIC, anon, authenticated;
DO $$
DECLARE r text; t text; c record;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
    FOREACH t IN ARRAY ARRAY['masses','schedule_slots','schedule_assignment_history'] LOOP
      IF has_table_privilege(r,format('public.%I',t),'DELETE') THEN RAISE EXCEPTION 'inherited_delete_privilege: %.%',r,t; END IF;
      FOR c IN SELECT attname FROM pg_attribute WHERE attrelid=format('public.%I',t)::regclass AND attnum>0 AND NOT attisdropped LOOP
        IF has_column_privilege(r,format('public.%I',t),c.attname,'INSERT') OR has_column_privilege(r,format('public.%I',t),c.attname,'UPDATE') THEN
          RAISE EXCEPTION 'inherited_column_write_privilege: %.%.%',r,t,c.attname;
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;
END $$;

-- Changes to a slot invalidate open editing forms for that mass.
CREATE OR REPLACE FUNCTION public.bump_mass_revision_from_slot() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog, public AS $$
BEGIN
  UPDATE public.masses SET schedule_revision=schedule_revision WHERE id=CASE WHEN TG_OP='DELETE' THEN OLD.mass_id ELSE NEW.mass_id END;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
DROP TRIGGER IF EXISTS bump_mass_revision_from_slot ON public.schedule_slots;
CREATE TRIGGER bump_mass_revision_from_slot AFTER INSERT OR UPDATE OR DELETE ON public.schedule_slots FOR EACH ROW EXECUTE FUNCTION public.bump_mass_revision_from_slot();
REVOKE ALL ON FUNCTION public.bump_mass_revision_from_slot() FROM PUBLIC, anon, authenticated;

-- Old clients remove linked announcements before failing to delete slots.
-- Require the authorized transaction functions for linked announcement deletion.
CREATE OR REPLACE FUNCTION public.guard_linked_announcement_write() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog, public AS $$
DECLARE trusted_owner name;
BEGIN
  SELECT pg_get_userbyid(proowner) INTO trusted_owner FROM pg_proc WHERE oid='public.delete_mass_safely(uuid)'::regprocedure;
  IF current_user <> trusted_owner THEN
    IF TG_OP = 'DELETE' AND OLD.related_schedule_slot_id IS NOT NULL THEN
      RAISE EXCEPTION 'linked_announcement_requires_rpc' USING ERRCODE='42501';
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.related_schedule_slot_id IS DISTINCT FROM OLD.related_schedule_slot_id THEN
      RAISE EXCEPTION 'linked_announcement_requires_rpc' USING ERRCODE='42501';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_linked_announcement_write ON public.announcements;
CREATE TRIGGER guard_linked_announcement_write BEFORE UPDATE OR DELETE ON public.announcements FOR EACH ROW EXECUTE FUNCTION public.guard_linked_announcement_write();
REVOKE ALL ON FUNCTION public.guard_linked_announcement_write() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.delete_announcement_safely(target_announcement_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog, public AS $$
DECLARE actor uuid := auth.uid(); member public.profiles%ROWTYPE; target public.announcements%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(13739001);
  SELECT * INTO member FROM public.profiles WHERE auth_user_id=actor AND archived_at IS NULL;
  IF actor IS NULL OR NOT FOUND THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  SELECT * INTO target FROM public.announcements WHERE id=target_announcement_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'announcement_not_found' USING ERRCODE='P0002'; END IF;
  IF member.role IS DISTINCT FROM 'admin' AND target.profile_id IS DISTINCT FROM member.id THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  DELETE FROM public.announcements WHERE id=target_announcement_id;
END $$;
REVOKE ALL ON FUNCTION public.delete_announcement_safely(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_announcement_safely(uuid) TO authenticated;
DO $$
DECLARE owner_role name; r text;
BEGIN
 SELECT pg_get_userbyid(proowner) INTO owner_role FROM pg_proc WHERE oid='public.delete_mass_safely(uuid)'::regprocedure;
 IF owner_role <> (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid='public.delete_announcement_safely(uuid)'::regprocedure) THEN RAISE EXCEPTION 'function_owners_must_match'; END IF;
 FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
   IF pg_has_role(r,owner_role,'MEMBER') THEN RAISE EXCEPTION 'application_role_inherits_privileged_owner'; END IF;
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.save_schedule_batch(entries jsonb, deleted_masses jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog, public AS $$
DECLARE entry jsonb; removed jsonb; item_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(13739001);
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  IF jsonb_typeof(entries) IS DISTINCT FROM 'array' OR jsonb_typeof(deleted_masses) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'invalid_arguments'; END IF;
  FOR removed IN SELECT * FROM jsonb_array_elements(deleted_masses) LOOP
    item_id := (removed->>'id')::uuid;
    IF NOT EXISTS (SELECT 1 FROM public.masses WHERE id=item_id AND schedule_revision=(removed->>'expectedRevision')::bigint) THEN RAISE EXCEPTION 'schedule_conflict'; END IF;
    PERFORM public.delete_mass_safely(item_id);
  END LOOP;
  FOR entry IN SELECT * FROM jsonb_array_elements(entries) LOOP
    item_id := NULLIF(entry->>'mass_id','')::uuid;
    IF item_id IS NULL THEN
      PERFORM public.create_mass_with_slots(entry->'mass_data',entry->'slot_data');
    ELSE
      PERFORM public.update_mass_with_slots(item_id,entry->'mass_data',entry->'slot_data');
    END IF;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.save_schedule_batch(jsonb,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_schedule_batch(jsonb,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_masses_safely(target_mass_ids uuid[]) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog, public AS $$
DECLARE item_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(13739001);
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  IF target_mass_ids IS NULL THEN RAISE EXCEPTION 'invalid_arguments'; END IF;
  FOREACH item_id IN ARRAY target_mass_ids LOOP PERFORM public.delete_mass_safely(item_id); END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.delete_masses_safely(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_masses_safely(uuid[]) TO authenticated;

-- Fail closed if application roles can plant objects in the definer search path or inherit its owner.
DO $$
DECLARE definer oid; r text; f record; table_oid oid; bypass boolean;
BEGIN
  SELECT proowner INTO definer FROM pg_proc WHERE oid='public.archive_member(uuid)'::regprocedure;
  SELECT rolsuper OR rolbypassrls INTO bypass FROM pg_roles WHERE oid=definer;
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF has_schema_privilege(r,'public','CREATE') OR pg_has_role(r,definer,'MEMBER') THEN
      RAISE EXCEPTION 'unsafe_definer_environment: %',r;
    END IF;
  END LOOP;
  FOR f IN SELECT p.oid,p.proowner,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname=ANY(ARRAY['archive_member','set_member_role','update_mass_with_slots','delete_mass_safely','create_mass_with_slots','perform_slot_action','set_masses_publication','publish_mass_month','delete_announcement_safely','save_schedule_batch','delete_masses_safely']) LOOP
    IF f.proowner <> definer THEN RAISE EXCEPTION 'inconsistent_definer_owner: %',f.proname; END IF;
  END LOOP;
  IF NOT bypass THEN
    FOREACH table_oid IN ARRAY ARRAY['public.profiles'::regclass::oid,'public.masses'::regclass::oid,'public.schedule_slots'::regclass::oid,'public.schedule_assignment_history'::regclass::oid,'public.announcements'::regclass::oid] LOOP
      IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid=table_oid AND relowner=definer AND NOT relforcerowsecurity) THEN
        RAISE EXCEPTION 'definer_cannot_safely_bypass_rls: %',table_oid::regclass;
      END IF;
    END LOOP;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.set_missing_mass_color(target_mass_id uuid, color text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog, public AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(13739001);
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  IF color IS NULL OR color NOT IN ('Verde','Roxo','Vermelho','Rosa','Branco') THEN RAISE EXCEPTION 'invalid_color'; END IF;
  UPDATE public.masses SET liturgical_color=color WHERE id=target_mass_id AND liturgical_color IS NULL;
END $$;
REVOKE ALL ON FUNCTION public.set_missing_mass_color(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_missing_mass_color(uuid,text) TO authenticated;
DO $$ BEGIN
 IF (SELECT proowner FROM pg_proc WHERE oid='public.set_missing_mass_color(uuid,text)'::regprocedure) <>
    (SELECT proowner FROM pg_proc WHERE oid='public.archive_member(uuid)'::regprocedure) THEN RAISE EXCEPTION 'inconsistent_definer_owner'; END IF;
END $$;
