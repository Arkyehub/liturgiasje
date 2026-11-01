\set ON_ERROR_STOP on
INSERT INTO public.masses(id,date,time,month_reference) VALUES ('30000000-0000-0000-0000-000000000002',current_date+80,'10:00','2099-03');
INSERT INTO public.schedule_slots(id,mass_id,role,profile_id) VALUES ('40000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000002','1L','20000000-0000-0000-0000-000000000003');
INSERT INTO public.announcements(id,content,related_schedule_slot_id) VALUES ('50000000-0000-0000-0000-000000000001','fixture','40000000-0000-0000-0000-000000000002');
CREATE POLICY fixture_announcement_delete ON public.announcements FOR DELETE TO authenticated USING (true);
CREATE POLICY fixture_announcement_update ON public.announcements FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',false);
DO $$ BEGIN
 BEGIN UPDATE public.announcements SET related_schedule_slot_id=NULL WHERE id='50000000-0000-0000-0000-000000000001'; RAISE EXCEPTION 'legacy unlink succeeded'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN DELETE FROM public.announcements WHERE related_schedule_slot_id='40000000-0000-0000-0000-000000000002'; RAISE EXCEPTION 'legacy linked announcement deletion succeeded'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
