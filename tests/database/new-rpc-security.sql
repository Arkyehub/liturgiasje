\set ON_ERROR_STOP on
DO $$ DECLARE f text; BEGIN
 FOREACH f IN ARRAY ARRAY['public.create_mass_with_slots(jsonb,jsonb)','public.perform_slot_action(uuid,text,uuid)','public.set_masses_publication(uuid[],boolean)','public.publish_mass_month(text)','public.delete_announcement_safely(uuid)','public.save_schedule_batch(jsonb,jsonb)','public.delete_masses_safely(uuid[])','public.set_missing_mass_color(uuid,text)'] LOOP
  IF has_function_privilege('anon',f,'EXECUTE') THEN RAISE EXCEPTION 'anon RPC: %',f; END IF;
 END LOOP;
END $$;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','',false);
DO $$ BEGIN
 BEGIN PERFORM public.create_mass_with_slots('{}','[]'); RAISE EXCEPTION 'missing session accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.save_schedule_batch('[]','[]'); RAISE EXCEPTION 'missing session accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',false);
DO $$ BEGIN
 BEGIN PERFORM public.create_mass_with_slots('{}','[]'); RAISE EXCEPTION 'reader create accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.delete_masses_safely(ARRAY[]::uuid[]); RAISE EXCEPTION 'reader delete accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT 'new RPC authorization passed' AS result;
