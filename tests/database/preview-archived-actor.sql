\set ON_ERROR_STOP on
-- Run after fixture-preview-policies.sql + migration. Proves an archived administrator keeps no access through
-- the permissive administrator policies observed in Preview, that app_settings stays publicly readable,
-- and that an archived unclaimed profile cannot be claimed.
INSERT INTO auth.users(id) VALUES ('10000000-0000-0000-0000-0000000000b1'),('10000000-0000-0000-0000-0000000000b2'),('10000000-0000-0000-0000-0000000000b3');
INSERT INTO public.profiles(id,auth_user_id,email,full_name,role) VALUES
('20000000-0000-0000-0000-0000000000b1','10000000-0000-0000-0000-0000000000b1','pa1@local','PA Admin','admin'),
('20000000-0000-0000-0000-0000000000b2','10000000-0000-0000-0000-0000000000b2','pa2@local','PA Old Admin','admin');
INSERT INTO public.profiles(id,email,full_name,role,archived_at) VALUES ('20000000-0000-0000-0000-0000000000b3','pa3@local','PA Unclaimed','reader',now());
INSERT INTO public.app_settings(key,value) VALUES ('pa_key','v');
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-0000000000b1',false);
SELECT public.archive_member('20000000-0000-0000-0000-0000000000b2');
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-0000000000b2',false);
DO $$ DECLARE n int; BEGIN
 -- archived admin: no reads or writes on operational tables
 SELECT count(*) INTO n FROM public.masses; IF n <> 0 THEN RAISE EXCEPTION 'archived admin reads masses'; END IF;
 SELECT count(*) INTO n FROM public.announcements; IF n <> 0 THEN RAISE EXCEPTION 'archived admin reads announcements'; END IF;
 BEGIN INSERT INTO public.announcements(content,type) VALUES ('x','Aviso'); RAISE EXCEPTION 'archived admin wrote announcement'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 UPDATE public.app_settings SET value='hacked' WHERE key='pa_key'; GET DIAGNOSTICS n = ROW_COUNT;
 IF n <> 0 THEN RAISE EXCEPTION 'archived admin changed app_settings'; END IF;
 BEGIN INSERT INTO public.app_settings(key,value) VALUES ('pa_new','x'); RAISE EXCEPTION 'archived admin inserted app_settings'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 DELETE FROM public.app_settings WHERE key='pa_key'; GET DIAGNOSTICS n = ROW_COUNT;
 IF n <> 0 THEN RAISE EXCEPTION 'archived admin deleted app_settings'; END IF;
 BEGIN PERFORM public.archive_member('20000000-0000-0000-0000-0000000000b1'); RAISE EXCEPTION 'archived admin used RPC'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 -- cannot self-reactivate or change role through the Data API
 BEGIN UPDATE public.profiles SET archived_at=NULL WHERE id='20000000-0000-0000-0000-0000000000b2'; RAISE EXCEPTION 'self reactivation allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 -- cannot claim an archived unclaimed profile
 BEGIN UPDATE public.profiles SET auth_user_id='10000000-0000-0000-0000-0000000000b2' WHERE id='20000000-0000-0000-0000-0000000000b3'; GET DIAGNOSTICS n = ROW_COUNT; IF n <> 0 THEN RAISE EXCEPTION 'archived profile claimed'; END IF; EXCEPTION WHEN insufficient_privilege OR raise_exception THEN IF SQLERRM <> 'archived_profile_claim' AND SQLSTATE <> '42501' THEN RAISE; END IF; END;
END $$;
RESET ROLE;
-- active administrator and anonymous settings reads still work
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-0000000000b1',false);
DO $$ DECLARE n int; BEGIN
 UPDATE public.app_settings SET value='ok' WHERE key='pa_key'; GET DIAGNOSTICS n = ROW_COUNT;
 IF n <> 1 THEN RAISE EXCEPTION 'active admin cannot update app_settings'; END IF;
END $$;
RESET ROLE;
SET ROLE anon;
SELECT set_config('request.jwt.claim.sub','',false);
DO $$ BEGIN IF (SELECT count(*) FROM public.app_settings WHERE key='pa_key') <> 1 THEN RAISE EXCEPTION 'anon cannot read app_settings'; END IF; END $$;
RESET ROLE;
SELECT 'preview archived actor assertions passed' AS result;
