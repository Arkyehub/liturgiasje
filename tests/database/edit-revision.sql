\set ON_ERROR_STOP on
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',false);
DO $$ DECLARE rev bigint; BEGIN
 SELECT schedule_revision INTO rev FROM public.masses WHERE id='30000000-0000-0000-0000-000000000001';
 PERFORM public.update_mass_with_slots('30000000-0000-0000-0000-000000000001',jsonb_build_object('date','2099-01-01','time','14:00','month_reference','2099-01','expected_revision',rev),jsonb_build_array(jsonb_build_object('id','40000000-0000-0000-0000-000000000001','role','1L','profileId','20000000-0000-0000-0000-000000000004')));
 BEGIN PERFORM public.update_mass_with_slots('30000000-0000-0000-0000-000000000001',jsonb_build_object('date','2099-01-01','time','15:00','month_reference','2099-01','expected_revision',rev),jsonb_build_array(jsonb_build_object('id','40000000-0000-0000-0000-000000000001','role','1L','profileId','20000000-0000-0000-0000-000000000004'))); RAISE EXCEPTION 'stale edit accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'schedule_conflict' THEN RAISE; END IF; END;
END $$;
RESET ROLE;
