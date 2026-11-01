\set ON_ERROR_STOP on
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',false);
DO $$ DECLARE rev bigint; old_time time; entries jsonb; BEGIN
 SELECT schedule_revision,time INTO rev,old_time FROM public.masses WHERE id='30000000-0000-0000-0000-000000000001';
 entries := jsonb_build_array(
  jsonb_build_object('mass_id','30000000-0000-0000-0000-000000000001','mass_data',jsonb_build_object('date','2099-01-01','time','17:00','month_reference','2099-01','expected_revision',rev),'slot_data',jsonb_build_array(jsonb_build_object('id','40000000-0000-0000-0000-000000000001','role','1L','profileId','20000000-0000-0000-0000-000000000004'))),
  jsonb_build_object('mass_id',null,'mass_data',jsonb_build_object('date','2099-07-01','time','10:00','month_reference','2099-07'),'slot_data',jsonb_build_array(jsonb_build_object('role','INVALID','profileId','20000000-0000-0000-0000-000000000003'))));
 BEGIN PERFORM public.save_schedule_batch(entries,'[]'); RAISE EXCEPTION 'invalid batch accepted'; EXCEPTION WHEN check_violation THEN NULL; END;
 IF (SELECT time FROM public.masses WHERE id='30000000-0000-0000-0000-000000000001') <> old_time THEN RAISE EXCEPTION 'partial batch'; END IF;
 IF EXISTS (SELECT 1 FROM public.masses WHERE month_reference='2099-07') THEN RAISE EXCEPTION 'partial create'; END IF;
END $$;
RESET ROLE;
SELECT 'batch rollback passed' AS result;
