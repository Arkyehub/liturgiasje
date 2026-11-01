\set ON_ERROR_STOP on
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',false);
DO $$ DECLARE created jsonb; created_id uuid; BEGIN
 created := public.create_mass_with_slots(jsonb_build_object('date','2099-07-01','time','10:00','month_reference','2099-07'),jsonb_build_array(jsonb_build_object('role','1L','profileId','20000000-0000-0000-0000-000000000003')));
 created_id := (created->>'id')::uuid;
 IF NOT EXISTS (SELECT 1 FROM public.schedule_slots WHERE mass_id=created_id AND profile_id='20000000-0000-0000-0000-000000000003') THEN RAISE EXCEPTION 'new slot missing'; END IF;
 PERFORM public.delete_mass_safely(created_id);
 IF EXISTS (SELECT 1 FROM public.masses WHERE id=created_id) THEN RAISE EXCEPTION 'delete failed'; END IF;
END $$;
RESET ROLE;
SELECT 'atomic create and delete passed' AS result;
