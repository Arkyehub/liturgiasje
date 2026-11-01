\set ON_ERROR_STOP on
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',false);
UPDATE public.masses SET time='11:30' WHERE id='30000000-0000-0000-0000-000000000001';
DO $$ BEGIN
 BEGIN DELETE FROM public.schedule_slots WHERE mass_id='30000000-0000-0000-0000-000000000001'; RAISE EXCEPTION 'unexpected delete'; EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'slot_has_assignment_history' THEN RAISE; END IF; END;
 IF (SELECT time FROM public.masses WHERE id='30000000-0000-0000-0000-000000000001') <> '11:30'::time THEN RAISE EXCEPTION 'legacy reproduction failed'; END IF;
END $$;
SELECT 'legacy mass update committed before slot deletion failed' AS result;
