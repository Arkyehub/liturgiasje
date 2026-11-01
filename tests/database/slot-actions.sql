\set ON_ERROR_STOP on
INSERT INTO auth.users(id) VALUES ('10000000-0000-0000-0000-000000000004');
INSERT INTO public.profiles(id,auth_user_id,email,full_name,role) VALUES ('20000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000004','c@local','C','reader');
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',false);
SELECT public.set_masses_publication(ARRAY['30000000-0000-0000-0000-000000000001'::uuid],true);
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',false);
SELECT public.perform_slot_action('40000000-0000-0000-0000-000000000001','confirm','20000000-0000-0000-0000-000000000003');
SELECT public.perform_slot_action('40000000-0000-0000-0000-000000000001','request_swap');
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000004',false);
DO $$ BEGIN
 BEGIN PERFORM public.perform_slot_action('40000000-0000-0000-0000-000000000001','confirm','20000000-0000-0000-0000-000000000003'); RAISE EXCEPTION 'impersonation allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.set_masses_publication(ARRAY['30000000-0000-0000-0000-000000000001'::uuid],false); RAISE EXCEPTION 'reader published'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT public.perform_slot_action('40000000-0000-0000-0000-000000000001','accept_swap','20000000-0000-0000-0000-000000000004');
DO $$ BEGIN
 IF (SELECT profile_id FROM public.schedule_slots WHERE id='40000000-0000-0000-0000-000000000001') <> '20000000-0000-0000-0000-000000000004' THEN RAISE EXCEPTION 'swap failed'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.schedule_assignment_history WHERE profile_id='20000000-0000-0000-0000-000000000003' AND slot_id='40000000-0000-0000-0000-000000000001') THEN RAISE EXCEPTION 'swap history missing'; END IF;
END $$;
RESET ROLE;
SELECT 'slot action assertions passed' AS result;
