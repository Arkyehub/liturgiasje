\set ON_ERROR_STOP on
INSERT INTO auth.users(id) VALUES ('10000000-0000-0000-0000-000000000001'),('10000000-0000-0000-0000-000000000002'),('10000000-0000-0000-0000-000000000003');
INSERT INTO public.profiles(id,auth_user_id,email,full_name,role) VALUES
('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','admin@local','Admin','admin'),
('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','a@local','A','reader'),
('20000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000003','b@local','B','reader');
INSERT INTO public.masses(id,date,time,month_reference,is_published) VALUES ('30000000-0000-0000-0000-000000000001',current_date+60,'10:00','2099-01',true);
INSERT INTO public.schedule_slots(id,mass_id,role,profile_id) VALUES ('40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','1L','20000000-0000-0000-0000-000000000002');
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',false);
SELECT public.archive_member('20000000-0000-0000-0000-000000000002');
DO $$ BEGIN
 BEGIN UPDATE public.masses SET time='11:30' WHERE id='30000000-0000-0000-0000-000000000001'; RAISE EXCEPTION 'legacy mass update allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN DELETE FROM public.schedule_slots WHERE mass_id='30000000-0000-0000-0000-000000000001'; RAISE EXCEPTION 'legacy slot deletion allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN UPDATE public.schedule_slots SET profile_id='20000000-0000-0000-0000-000000000003' WHERE id='40000000-0000-0000-0000-000000000001'; RAISE EXCEPTION 'direct assignment allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 IF (SELECT time FROM public.masses WHERE id='30000000-0000-0000-0000-000000000001') <> '10:00'::time THEN RAISE EXCEPTION 'mass changed'; END IF;
 IF (SELECT profile_id FROM public.schedule_slots WHERE id='40000000-0000-0000-0000-000000000001') IS NOT NULL THEN RAISE EXCEPTION 'slot changed'; END IF;
 IF (SELECT count(*) FROM public.schedule_assignment_history WHERE slot_id='40000000-0000-0000-0000-000000000001') <> 1 THEN RAISE EXCEPTION 'history changed'; END IF;
 BEGIN PERFORM public.create_mass_with_slots(jsonb_build_object('date','2099-02-01','time','10:00','month_reference','2099-02'),jsonb_build_array(jsonb_build_object('role','INVALID','profileId','20000000-0000-0000-0000-000000000003'))); RAISE EXCEPTION 'invalid creation allowed'; EXCEPTION WHEN check_violation THEN NULL; END;
 IF EXISTS (SELECT 1 FROM public.masses WHERE month_reference='2099-02') THEN RAISE EXCEPTION 'partial creation'; END IF;
END $$;
SELECT public.update_mass_with_slots('30000000-0000-0000-0000-000000000001',jsonb_build_object('date','2099-01-01','time','12:00','month_reference','2099-01','expected_revision',(SELECT schedule_revision FROM public.masses WHERE id='30000000-0000-0000-0000-000000000001')),jsonb_build_array(jsonb_build_object('id','40000000-0000-0000-0000-000000000001','role','1L','profileId','20000000-0000-0000-0000-000000000003')));
DO $$ BEGIN
 IF (SELECT time FROM public.masses WHERE id='30000000-0000-0000-0000-000000000001') <> '12:00'::time THEN RAISE EXCEPTION 'edit failed'; END IF;
 IF (SELECT profile_id FROM public.schedule_slots WHERE id='40000000-0000-0000-0000-000000000001') <> '20000000-0000-0000-0000-000000000003' THEN RAISE EXCEPTION 'assignment failed'; END IF;
 BEGIN PERFORM public.update_mass_with_slots('30000000-0000-0000-0000-000000000001',jsonb_build_object('date','2099-01-01','time','13:00','month_reference','2099-01','expected_revision',(SELECT schedule_revision FROM public.masses WHERE id='30000000-0000-0000-0000-000000000001')),'[]'); RAISE EXCEPTION 'invalid deletion allowed'; EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'slot_has_assignment_history' THEN RAISE; END IF; END;
 IF (SELECT time FROM public.masses WHERE id='30000000-0000-0000-0000-000000000001') <> '12:00'::time THEN RAISE EXCEPTION 'partial edit'; END IF;
END $$;
RESET ROLE;
SELECT 'write boundary assertions passed' AS result;
