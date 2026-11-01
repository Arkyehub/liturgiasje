\set ON_ERROR_STOP on
DO $$ BEGIN
 IF has_function_privilege('anon','public.archive_member(uuid)','EXECUTE') THEN RAISE EXCEPTION 'anonymous RPC access'; END IF;
 IF has_function_privilege('anon','public.set_member_role(uuid,text)','EXECUTE') THEN RAISE EXCEPTION 'anonymous role RPC access'; END IF;
 IF has_function_privilege('authenticated','public.record_slot_replacement()','EXECUTE') THEN RAISE EXCEPTION 'trigger function publicly executable'; END IF;
 IF has_column_privilege('authenticated','public.profiles','role','UPDATE') OR has_column_privilege('authenticated','public.profiles','archived_at','UPDATE') THEN RAISE EXCEPTION 'sensitive columns writable'; END IF;
END $$;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000005',false);
DO $$ BEGIN
 BEGIN INSERT INTO public.schedule_assignment_history(slot_id,mass_id,role,profile_id,event_type) VALUES ('40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','1L','20000000-0000-0000-0000-000000000005','assignment_changed'); RAISE EXCEPTION 'history writable'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.set_member_role('20000000-0000-0000-0000-000000000005','admin'); RAISE EXCEPTION 'reader role RPC allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT 'privilege assertions passed' AS result;
