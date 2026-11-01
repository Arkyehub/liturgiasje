\set ON_ERROR_STOP on
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',false);
DO $$ BEGIN BEGIN PERFORM public.set_missing_mass_color('30000000-0000-0000-0000-000000000002','Verde'); RAISE EXCEPTION 'reader updated color'; EXCEPTION WHEN insufficient_privilege THEN NULL; END; END $$;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',false);
SELECT public.set_missing_mass_color('30000000-0000-0000-0000-000000000002','Verde');
DO $$ BEGIN IF (SELECT liturgical_color FROM public.masses WHERE id='30000000-0000-0000-0000-000000000002') <> 'Verde' THEN RAISE EXCEPTION 'color not set'; END IF; END $$;
RESET ROLE;
