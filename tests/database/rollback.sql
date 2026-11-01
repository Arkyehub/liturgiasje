\set ON_ERROR_STOP on
-- Requires archive-integration.sql and uses only synthetic fixture identities.
INSERT INTO public.masses(id,date,time,month_reference) VALUES ('30000000-0000-0000-0000-000000000003',current_date+70,'10:00','2099-02');
INSERT INTO public.schedule_slots(id,mass_id,role,profile_id) VALUES ('40000000-0000-0000-0000-000000000003','30000000-0000-0000-0000-000000000003',NULL,'20000000-0000-0000-0000-000000000004');
CREATE FUNCTION public.fixture_reject_archive() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id='20000000-0000-0000-0000-000000000004' AND NEW.archived_at IS NOT NULL THEN RAISE EXCEPTION 'fixture_failure'; END IF; RETURN NEW; END $$;
CREATE TRIGGER fixture_reject_archive BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.fixture_reject_archive();
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',false);
DO $$ BEGIN
 BEGIN PERFORM public.archive_member('20000000-0000-0000-0000-000000000004'); RAISE EXCEPTION 'expected failure'; EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'fixture_failure' THEN RAISE; END IF; END;
 IF (SELECT archived_at FROM public.profiles WHERE id='20000000-0000-0000-0000-000000000004') IS NOT NULL THEN RAISE EXCEPTION 'profile partially archived'; END IF;
 IF (SELECT profile_id FROM public.schedule_slots WHERE id='40000000-0000-0000-0000-000000000003') <> '20000000-0000-0000-0000-000000000004' THEN RAISE EXCEPTION 'slot partially cleared'; END IF;
 IF EXISTS (SELECT 1 FROM public.schedule_assignment_history WHERE slot_id='40000000-0000-0000-0000-000000000003') THEN RAISE EXCEPTION 'partial history'; END IF;
END $$;
RESET ROLE;
DROP TRIGGER fixture_reject_archive ON public.profiles;
DROP FUNCTION public.fixture_reject_archive();
SELECT 'rollback assertions passed' AS result;
