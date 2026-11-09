\set ON_ERROR_STOP on
INSERT INTO auth.users(id) VALUES ('10000000-0000-0000-0000-0000000000a1'),('10000000-0000-0000-0000-0000000000a2'),('10000000-0000-0000-0000-0000000000a3');
INSERT INTO public.profiles(id,auth_user_id,email,full_name,role) VALUES
('20000000-0000-0000-0000-0000000000a1','10000000-0000-0000-0000-0000000000a1','ua-admin@local','UA Admin','admin'),
('20000000-0000-0000-0000-0000000000a2','10000000-0000-0000-0000-0000000000a2','ua-former@local','UA Former Admin','admin'),
('20000000-0000-0000-0000-0000000000a3','10000000-0000-0000-0000-0000000000a3','ua-reader@local','UA Reader','reader');
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-0000000000a1',false);
SELECT public.archive_member('20000000-0000-0000-0000-0000000000a2');
SELECT public.archive_member('20000000-0000-0000-0000-0000000000a3');
-- an archived actor cannot reactivate anyone
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-0000000000a3',false);
DO $$ BEGIN
 BEGIN PERFORM public.unarchive_member('20000000-0000-0000-0000-0000000000a3'); RAISE EXCEPTION 'archived actor reactivated self'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
-- a reader cannot reactivate anyone
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',false);
UPDATE public.profiles SET archived_at = NULL WHERE id = '20000000-0000-0000-0000-0000000000a3';
SET ROLE authenticated;
DO $$ BEGIN
 BEGIN PERFORM public.unarchive_member('20000000-0000-0000-0000-0000000000a2'); RAISE EXCEPTION 'reader reactivated member'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
-- an administrator can; the former administrator returns as reader; repeat is a no-op; unknown id is rejected
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-0000000000a1',false);
DO $$ BEGIN
 IF public.unarchive_member('20000000-0000-0000-0000-0000000000a2') <> 'unarchived' THEN RAISE EXCEPTION 'not reactivated'; END IF;
 IF (SELECT archived_at IS NOT NULL OR role <> 'reader' FROM public.profiles WHERE id='20000000-0000-0000-0000-0000000000a2') THEN RAISE EXCEPTION 'unexpected state after reactivation'; END IF;
 IF public.unarchive_member('20000000-0000-0000-0000-0000000000a2') <> 'not_archived' THEN RAISE EXCEPTION 'repeat not idempotent'; END IF;
 BEGIN PERFORM public.unarchive_member('99999999-0000-0000-0000-000000000000'); RAISE EXCEPTION 'unknown id accepted'; EXCEPTION WHEN no_data_found THEN NULL; END;
END $$;
RESET ROLE;
DO $$ BEGIN IF has_function_privilege('anon','public.unarchive_member(uuid)','EXECUTE') THEN RAISE EXCEPTION 'anonymous RPC access'; END IF; END $$;
SELECT 'unarchive assertions passed' AS result;
