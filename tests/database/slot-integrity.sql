\set ON_ERROR_STOP on
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',false);
DO $$ BEGIN
 BEGIN
  UPDATE public.schedule_slots SET mass_id='30000000-0000-0000-0000-000000000002' WHERE id='40000000-0000-0000-0000-000000000001';
  RAISE EXCEPTION 'moving a historical slot unexpectedly succeeded';
 EXCEPTION WHEN insufficient_privilege THEN NULL; WHEN raise_exception THEN IF SQLERRM <> 'slot_has_assignment_history' THEN RAISE; END IF; END;
END $$;
RESET ROLE;
