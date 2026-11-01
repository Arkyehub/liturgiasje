\set ON_ERROR_STOP on
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',false);
SELECT public.update_mass_with_slots('30000000-0000-0000-0000-000000000001',jsonb_build_object('date','2099-01-01','time','12:00','month_reference','2099-01','expected_revision',(SELECT schedule_revision FROM public.masses WHERE id='30000000-0000-0000-0000-000000000001')),jsonb_build_array(jsonb_build_object('id','40000000-0000-0000-0000-000000000001','role','1L','profileId','20000000-0000-0000-0000-000000000005')));
DO $$ BEGIN
 IF (SELECT profile_id FROM public.schedule_slots WHERE id='40000000-0000-0000-0000-000000000001') <> '20000000-0000-0000-0000-000000000005' THEN RAISE EXCEPTION 'replacement missing'; END IF;
 IF (SELECT count(*) FROM public.schedule_assignment_history WHERE slot_id='40000000-0000-0000-0000-000000000001') < 3 THEN RAISE EXCEPTION 'history missing'; END IF;
 BEGIN PERFORM public.update_mass_with_slots('30000000-0000-0000-0000-000000000001',jsonb_build_object('date','2099-01-01','time','13:00','month_reference','2099-01','expected_revision',(SELECT schedule_revision FROM public.masses WHERE id='30000000-0000-0000-0000-000000000001')),'[]'); RAISE EXCEPTION 'deletion should fail'; EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'slot_has_assignment_history' THEN RAISE; END IF; END;
 IF (SELECT time FROM public.masses WHERE id='30000000-0000-0000-0000-000000000001') <> '12:00'::time THEN RAISE EXCEPTION 'edit was partial'; END IF;
END $$;
RESET ROLE;
SELECT 'atomic edit assertions passed' AS result;
