\set ON_ERROR_STOP on
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',false);
DO $$ DECLARE rev bigint; BEGIN
 SELECT schedule_revision INTO rev FROM public.masses WHERE id='30000000-0000-0000-0000-000000000001';
 PERFORM public.save_schedule_batch(jsonb_build_array(
  jsonb_build_object('mass_id','30000000-0000-0000-0000-000000000001','mass_data',jsonb_build_object('date','2099-01-01','time','16:00','month_reference','2099-01','expected_revision',rev),'slot_data',jsonb_build_array(jsonb_build_object('id','40000000-0000-0000-0000-000000000001','role','1L','profileId','20000000-0000-0000-0000-000000000004'))),
  jsonb_build_object('mass_id',null,'mass_data',jsonb_build_object('date','2099-08-01','time','10:00','month_reference','2099-08'),'slot_data','[]'::jsonb)), '[]');
 IF (SELECT time FROM public.masses WHERE id='30000000-0000-0000-0000-000000000001') <> '16:00'::time OR NOT EXISTS (SELECT 1 FROM public.masses WHERE month_reference='2099-08') THEN RAISE EXCEPTION 'batch did not apply'; END IF;
END $$;
RESET ROLE;
SELECT 'batch success passed' AS result;
