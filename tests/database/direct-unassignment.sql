\set ON_ERROR_STOP on
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',false);
UPDATE public.schedule_slots SET profile_id=NULL WHERE id='40000000-0000-0000-0000-000000000001';
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.schedule_assignment_history WHERE slot_id='40000000-0000-0000-0000-000000000001' AND profile_id='20000000-0000-0000-0000-000000000005' AND event_type='assignment_changed') THEN RAISE EXCEPTION 'unassignment was not recorded'; END IF;
END $$;
SELECT 'direct unassignment recorded' AS result;
