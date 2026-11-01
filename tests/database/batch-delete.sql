\set ON_ERROR_STOP on
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',false);
DO $$ BEGIN
 BEGIN
  PERFORM public.delete_masses_safely(ARRAY['30000000-0000-0000-0000-000000000002'::uuid,'30000000-0000-0000-0000-000000000001'::uuid]);
  RAISE EXCEPTION 'batch deletion unexpectedly succeeded';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'mass_has_assignment_history' THEN RAISE; END IF; END;
 IF NOT EXISTS(SELECT 1 FROM public.masses WHERE id='30000000-0000-0000-0000-000000000002') THEN RAISE EXCEPTION 'partial deletion'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.announcements WHERE id='50000000-0000-0000-0000-000000000001') THEN RAISE EXCEPTION 'announcement lost'; END IF;
END $$;
RESET ROLE;
SELECT 'batch deletion rollback passed' AS result;
