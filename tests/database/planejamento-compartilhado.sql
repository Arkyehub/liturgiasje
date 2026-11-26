\set ON_ERROR_STOP on
-- Planejamento compartilhado: schedule_plans + funções plan_*. Executar após migration_planejamento_compartilhado.sql.
-- Dados sintéticos, banco descartável. Perfis criados aqui como superusuário.
INSERT INTO auth.users(id) VALUES
 ('c0000000-0000-0000-0000-0000000000a1'),('c0000000-0000-0000-0000-0000000000a2'),
 ('c0000000-0000-0000-0000-0000000000a3'),('c0000000-0000-0000-0000-0000000000a4');
INSERT INTO public.profiles(id,auth_user_id,email,full_name,role) VALUES
 ('d0000000-0000-0000-0000-0000000000a1','c0000000-0000-0000-0000-0000000000a1','pc-a@local','Admin A','admin'),
 ('d0000000-0000-0000-0000-0000000000a2','c0000000-0000-0000-0000-0000000000a2','pc-b@local','Admin B','admin'),
 ('d0000000-0000-0000-0000-0000000000a4','c0000000-0000-0000-0000-0000000000a4','pc-r@local','Leitor','reader');
INSERT INTO public.profiles(id,auth_user_id,email,full_name,role,archived_at) VALUES
 ('d0000000-0000-0000-0000-0000000000a3','c0000000-0000-0000-0000-0000000000a3','pc-x@local','Admin Arquivado','admin',now());

-- Auxiliar: executa SQL e exige o erro (SQLERRM) esperado.
CREATE FUNCTION pg_temp.expect_err(stmt text, code text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE failed boolean := false; msg text;
BEGIN
  BEGIN EXECUTE stmt;
  EXCEPTION WHEN OTHERS THEN failed := true; msg := SQLERRM; END;
  IF NOT failed THEN RAISE EXCEPTION 'esperava erro % mas passou: %', code, stmt; END IF;
  IF msg <> code THEN RAISE EXCEPTION 'esperava erro % mas veio %: %', code, msg, stmt; END IF;
END $$;

-- (1) privilégios
DO $$ DECLARE f record; n int := 0; BEGIN
  FOR f IN SELECT p.oid::regprocedure AS sig, p.proname FROM pg_proc p
           WHERE p.pronamespace='public'::regnamespace AND p.proname LIKE 'plan\_%' LOOP
    n := n + 1;
    IF has_function_privilege('anon', f.sig, 'EXECUTE') THEN RAISE EXCEPTION 'anon executa %', f.sig; END IF;
  END LOOP;
  IF n < 10 THEN RAISE EXCEPTION 'funcoes plan_* ausentes (%)', n; END IF;
END $$;
DO $$ DECLARE f text; r text; p text; BEGIN
  FOREACH f IN ARRAY ARRAY['plan_list(text[])','plan_open(text,text)','plan_get(uuid)','plan_copy(uuid,boolean)',
    'plan_save(uuid,text,text,bigint,jsonb)','plan_heartbeat(uuid,text)','plan_release(uuid,text)',
    'plan_conclude(uuid,text)','plan_reopen(uuid,text)','plan_discard(uuid)'] LOOP
    IF NOT has_function_privilege('authenticated','public.'||f,'EXECUTE') THEN RAISE EXCEPTION 'authenticated sem EXECUTE em %', f; END IF;
  END LOOP;
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
    FOREACH p IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE'] LOOP
      IF has_table_privilege(r,'public.schedule_plans',p) THEN RAISE EXCEPTION '% tem % direto em schedule_plans', r, p; END IF;
    END LOOP;
  END LOOP;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.schedule_plans'::regclass) THEN RAISE EXCEPTION 'RLS desligado'; END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='schedule_plans') THEN RAISE EXCEPTION 'policy inesperada'; END IF;
END $$;

SET ROLE authenticated;
-- acesso direto negado
DO $$ BEGIN
  PERFORM pg_temp.expect_err('SELECT * FROM public.schedule_plans','permission denied for table schedule_plans');
  PERFORM pg_temp.expect_err('INSERT INTO public.schedule_plans(month_reference,owner_profile_id) VALUES (''2026-12'',''d0000000-0000-0000-0000-0000000000a1'')','permission denied for table schedule_plans');
  PERFORM pg_temp.expect_err('UPDATE public.schedule_plans SET revision=9','permission denied for table schedule_plans');
  PERFORM pg_temp.expect_err('DELETE FROM public.schedule_plans','permission denied for table schedule_plans');
END $$;

-- (2) sem sessão, leitor, arquivado
SELECT set_config('request.jwt.claim.sub','',false);
SELECT pg_temp.expect_err($$SELECT public.plan_list(ARRAY['2026-12'])$$,'forbidden');
SELECT pg_temp.expect_err($$SELECT public.plan_open('2026-12','s1')$$,'forbidden');
SELECT set_config('request.jwt.claim.sub','c0000000-0000-0000-0000-0000000000a4',false);
SELECT pg_temp.expect_err($$SELECT public.plan_list(ARRAY['2026-12'])$$,'forbidden');
SELECT pg_temp.expect_err($$SELECT public.plan_open('2026-12','s1')$$,'forbidden');
SELECT pg_temp.expect_err($$SELECT public.plan_get(gen_random_uuid())$$,'forbidden');
SELECT set_config('request.jwt.claim.sub','c0000000-0000-0000-0000-0000000000a3',false);
SELECT pg_temp.expect_err($$SELECT public.plan_list(ARRAY['2026-12'])$$,'forbidden');
SELECT pg_temp.expect_err($$SELECT public.plan_open('2026-12','s1')$$,'forbidden');
DO $$ BEGIN
  BEGIN PERFORM public.plan_list(ARRAY['2026-12']); RAISE EXCEPTION 'arquivado aceito';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;

-- (3) plan_open
SELECT set_config('request.jwt.claim.sub','c0000000-0000-0000-0000-0000000000a1',false);
SELECT public.plan_open('2026-12','sA1') AS r \gset
SELECT set_config('t.r', :'r', false);
DO $$ DECLARE r jsonb := current_setting('t.r'); BEGIN
  IF r->>'mode' <> 'edit' THEN RAISE EXCEPTION 'open 1: %', r; END IF;
  IF (r->'plan'->>'isMine')::boolean IS NOT TRUE OR r->'plan'->>'status' <> 'em_andamento'
     OR (r->'plan'->>'revision')::bigint <> 0 OR r->'plan'->>'ownerName' <> 'Admin A' THEN RAISE EXCEPTION 'open 1 plano: %', r; END IF;
  IF jsonb_typeof(r->'plan'->'state') <> 'null' THEN RAISE EXCEPTION 'state inicial: %', r; END IF;
END $$;
SELECT (:'r'::jsonb)->'plan'->>'id' AS pa \gset
SELECT set_config('t.pa', :'pa', false);
SELECT public.plan_open('2026-12','sA2') AS r2 \gset
SELECT set_config('t.r2', :'r2', false);
DO $$ DECLARE r jsonb := current_setting('t.r2'); BEGIN
  IF r->>'mode' <> 'readonly' OR r->>'holderLastSeen' IS NULL THEN RAISE EXCEPTION 'open outro aparelho: %', r; END IF;
  IF (r->'plan'->>'openElsewhere')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'openElsewhere: %', r; END IF;
END $$;
SELECT public.plan_open('2026-12','sA1') AS r3 \gset
SELECT set_config('t.r3', :'r3', false);
DO $$ DECLARE r jsonb := current_setting('t.r3'); BEGIN
  IF r->>'mode' <> 'edit' OR r->'plan'->>'id' <> current_setting('t.pa') THEN RAISE EXCEPTION 'open mesma sessao: %', r; END IF;
END $$;
SELECT pg_temp.expect_err($$SELECT public.plan_open('2026-13','x')$$,'invalid_arguments');
SELECT pg_temp.expect_err($$SELECT public.plan_open('2026-12','')$$,'invalid_arguments');
RESET ROLE;
DO $$ BEGIN
  IF (SELECT count(*) FROM public.schedule_plans WHERE month_reference='2026-12') <> 1 THEN RAISE EXCEPTION 'plan_open duplicou o plano'; END IF;
END $$;

-- (4) reserva vencida (121 s) é assumida por outra sessão
UPDATE public.schedule_plans SET lock_heartbeat_at = now() - interval '121 seconds' WHERE id = :'pa';
SET ROLE authenticated;
SELECT public.plan_open('2026-12','sA2') AS r4 \gset
SELECT set_config('t.r4', :'r4', false);
DO $$ DECLARE r jsonb := current_setting('t.r4'); BEGIN
  IF r->>'mode' <> 'edit' THEN RAISE EXCEPTION 'takeover: %', r; END IF;
END $$;
-- a sessão antiga perdeu a reserva
SELECT pg_temp.expect_err(format('SELECT public.plan_save(%L,''sA1'',''q0'',0,''{"a":1}'')',:'pa'),'plan_lock_lost');

-- (5) plan_save
SELECT pg_temp.expect_err(format('SELECT public.plan_save(%L,''sA2'',''q1'',5,''{"a":1}'')',:'pa'),'plan_revision_conflict');
SELECT pg_temp.expect_err(format($f$SELECT public.plan_save(%L,'sA2','q1',0,jsonb_build_object('x',repeat('a',524300)))$f$,:'pa'),'plan_too_large');
SELECT pg_temp.expect_err(format('SELECT public.plan_save(%L,''sA2'','''',0,''{"a":1}'')',:'pa'),'invalid_arguments');
SELECT pg_temp.expect_err(format('SELECT public.plan_save(%L,''sA2'',''q1'',0,''[1]'')',:'pa'),'invalid_arguments');
RESET ROLE;
UPDATE public.schedule_plans SET updated_at = now() - interval '5 days', expires_at = now() + interval '25 days' WHERE id = :'pa';
SET ROLE authenticated;
SELECT public.plan_save(:'pa','sA2','q1',0,'{"missas":[{"d":"2026-12-06"}]}') AS rev \gset
SELECT set_config('t.rev', :'rev', false);
DO $$ BEGIN IF current_setting('t.rev')::bigint <> 1 THEN RAISE EXCEPTION 'revisao apos save: %', current_setting('t.rev')::bigint; END IF; END $$;
SELECT public.plan_save(:'pa','sA2','q1',0,'{"missas":["IGNORADO"]}') AS rev_again \gset
SELECT set_config('t.rev_again', :'rev_again', false);
DO $$ BEGIN IF current_setting('t.rev_again')::bigint <> 1 THEN RAISE EXCEPTION 'request_id repetido: %', current_setting('t.rev_again')::bigint; END IF; END $$;
RESET ROLE;
DO $$ DECLARE sp public.schedule_plans; BEGIN
  SELECT * INTO sp FROM public.schedule_plans WHERE id = current_setting('t.pa')::uuid;
  IF sp.revision <> 1 THEN RAISE EXCEPTION 'revision %', sp.revision; END IF;
  IF sp.state <> '{"missas":[{"d":"2026-12-06"}]}'::jsonb THEN RAISE EXCEPTION 'state reaplicado: %', sp.state; END IF;
  IF sp.updated_at < now() - interval '1 minute' THEN RAISE EXCEPTION 'updated_at nao atualizado'; END IF;
  IF sp.expires_at < now() + interval '29 days 23 hours' OR sp.expires_at > now() + interval '30 days 1 hour' THEN RAISE EXCEPTION 'expires_at: %', sp.expires_at; END IF;
END $$;

-- (6) admin B
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','c0000000-0000-0000-0000-0000000000a2',false);
SELECT pg_temp.expect_err(format('SELECT public.plan_save(%L,''sA2'',''qb'',1,''{"hack":1}'')',:'pa'),'forbidden');
SELECT pg_temp.expect_err(format('SELECT public.plan_heartbeat(%L,''sA2'')',:'pa'),'forbidden');
SELECT pg_temp.expect_err(format('SELECT public.plan_conclude(%L,''sA2'')',:'pa'),'forbidden');
SELECT pg_temp.expect_err(format('SELECT public.plan_reopen(%L,''sB1'')',:'pa'),'forbidden');
SELECT pg_temp.expect_err(format('SELECT public.plan_release(%L,''sA2'')',:'pa'),'forbidden');
SELECT public.plan_get(:'pa') AS g \gset
SELECT set_config('t.g', :'g', false);
DO $$ DECLARE g jsonb := current_setting('t.g'); BEGIN
  IF g->>'ownerName' <> 'Admin A' OR (g->>'isMine')::boolean IS NOT FALSE
     OR g->'state' <> '{"missas":[{"d":"2026-12-06"}]}'::jsonb OR (g->>'revision')::bigint <> 1 THEN RAISE EXCEPTION 'plan_get de B: %', g; END IF;
END $$;
SELECT public.plan_get(gen_random_uuid()) IS NULL AS nulo \gset
SELECT set_config('t.nulo', :'nulo', false);
DO $$ BEGIN IF NOT current_setting('t.nulo')::boolean THEN RAISE EXCEPTION 'plan_get inexistente nao e null'; END IF; END $$;
RESET ROLE;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.schedule_plans WHERE owner_profile_id='d0000000-0000-0000-0000-0000000000a2') THEN RAISE EXCEPTION 'plan_get criou plano para B'; END IF;
  IF (SELECT lock_session_id FROM public.schedule_plans WHERE id=current_setting('t.pa')::uuid) <> 'sA2' THEN RAISE EXCEPTION 'plan_get mexeu na reserva'; END IF;
END $$;

-- (7) plan_copy
SET ROLE authenticated;
SELECT public.plan_copy(:'pa', false) AS c \gset
SELECT set_config('t.c', :'c', false);
DO $$ DECLARE c jsonb := current_setting('t.c'); BEGIN
  IF c->>'ownerName' <> 'Admin B' OR (c->>'isMine')::boolean IS NOT TRUE OR c->>'copiedFromName' <> 'Admin A'
     OR c->>'monthReference' <> '2026-12' OR c->'state' <> '{"missas":[{"d":"2026-12-06"}]}'::jsonb THEN RAISE EXCEPTION 'copy: %', c; END IF;
END $$;
SELECT (:'c'::jsonb)->>'id' AS pb \gset
SELECT set_config('t.pb', :'pb', false);
RESET ROLE;
DO $$ BEGIN
  IF (SELECT copied_from_owner_id FROM public.schedule_plans WHERE id=current_setting('t.pb')::uuid) <> 'd0000000-0000-0000-0000-0000000000a1' THEN RAISE EXCEPTION 'copied_from_owner_id'; END IF;
END $$;
-- A muda o dela; B (com conteúdo) precisa de overwrite
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','c0000000-0000-0000-0000-0000000000a1',false);
SELECT public.plan_save(:'pa','sA2','q2',1,'{"missas":[],"v":2}') AS rev \gset
SELECT set_config('t.rev', :'rev', false);
SELECT set_config('request.jwt.claim.sub','c0000000-0000-0000-0000-0000000000a2',false);
SELECT pg_temp.expect_err(format('SELECT public.plan_copy(%L,false)',:'pa'),'plan_exists');
SELECT public.plan_copy(:'pa', true) AS c2 \gset
SELECT set_config('t.c2', :'c2', false);
DO $$ DECLARE c jsonb := current_setting('t.c2'); BEGIN
  IF c->'state' <> '{"missas":[],"v":2}'::jsonb OR c->>'id' <> current_setting('t.pb') THEN RAISE EXCEPTION 'overwrite: %', c; END IF;
END $$;
SELECT pg_temp.expect_err(format('SELECT public.plan_copy(%L,true)',:'pb'),'invalid_arguments');
SELECT pg_temp.expect_err($$SELECT public.plan_copy(gen_random_uuid(),true)$$,'plan_not_found');
RESET ROLE;

-- (8) plan_list
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','c0000000-0000-0000-0000-0000000000a1',false);
SELECT pg_temp.expect_err($$SELECT public.plan_list(ARRAY['2026-01','2026-02','2026-03','2026-04','2026-05','2026-06','2026-07','2026-08','2026-09','2026-10','2026-11','2026-12','2027-01'])$$,'invalid_arguments');
SELECT pg_temp.expect_err($$SELECT public.plan_list(ARRAY['xx'])$$,'invalid_arguments');
SELECT public.plan_list(ARRAY['2026-12']) AS l \gset
SELECT set_config('t.l', :'l', false);
DO $$ DECLARE l jsonb := current_setting('t.l'); a jsonb; b jsonb; BEGIN
  IF jsonb_array_length(l) <> 2 THEN RAISE EXCEPTION 'list: %', l; END IF;
  SELECT x INTO a FROM jsonb_array_elements(l) x WHERE x->>'ownerName'='Admin A';
  SELECT x INTO b FROM jsonb_array_elements(l) x WHERE x->>'ownerName'='Admin B';
  IF (a->>'isMine')::boolean IS NOT TRUE OR (b->>'isMine')::boolean IS NOT FALSE THEN RAISE EXCEPTION 'isMine: %', l; END IF;
  IF (a->>'openElsewhere')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'reserva viva de A: %', a; END IF;
  IF (b->>'openElsewhere')::boolean IS NOT FALSE THEN RAISE EXCEPTION 'B sem reserva: %', b; END IF;
  IF b->>'copiedFromName' <> 'Admin A' THEN RAISE EXCEPTION 'copiedFromName: %', b; END IF;
END $$;
SELECT public.plan_list(ARRAY[]::text[]) AS lv \gset
SELECT set_config('t.lv', :'lv', false);
DO $$ BEGIN IF current_setting('t.lv')::jsonb <> '[]'::jsonb THEN RAISE EXCEPTION 'lista vazia: %', current_setting('t.lv'); END IF; END $$;
RESET ROLE;
-- reserva vencida => openElsewhere falso
UPDATE public.schedule_plans SET lock_heartbeat_at = now() - interval '121 seconds' WHERE id = :'pa';
-- vencidos são apagados; os demais ficam
INSERT INTO public.schedule_plans(month_reference,owner_profile_id,expires_at) VALUES
 ('2027-01','d0000000-0000-0000-0000-0000000000a2', now() - interval '1 second'),
 ('2027-02','d0000000-0000-0000-0000-0000000000a2', now() + interval '1 day');
SET ROLE authenticated;
SELECT public.plan_list(ARRAY['2026-12','2027-01','2027-02']) AS l2 \gset
SELECT set_config('t.l2', :'l2', false);
DO $$ DECLARE l jsonb := current_setting('t.l2'); BEGIN
  IF jsonb_array_length(l) <> 3 THEN RAISE EXCEPTION 'list2: %', l; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(l) x WHERE (x->>'openElsewhere')::boolean) THEN RAISE EXCEPTION 'openElsewhere com reserva vencida: %', l; END IF;
END $$;
RESET ROLE;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.schedule_plans WHERE month_reference='2027-01') THEN RAISE EXCEPTION 'plano vencido nao apagado'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.schedule_plans WHERE month_reference='2027-02') THEN RAISE EXCEPTION 'plano valido apagado'; END IF;
  IF (SELECT count(*) FROM public.schedule_plans WHERE month_reference='2026-12') <> 2 THEN RAISE EXCEPTION 'planos de 2026-12 apagados'; END IF;
END $$;

-- (9) conclude / save / open / reopen
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','c0000000-0000-0000-0000-0000000000a1',false);
SELECT pg_temp.expect_err(format('SELECT public.plan_conclude(%L,''outra'')',:'pa'),'plan_lock_lost');
SELECT public.plan_conclude(:'pa','sA2');
RESET ROLE;
DO $$ DECLARE sp public.schedule_plans; BEGIN
  SELECT * INTO sp FROM public.schedule_plans WHERE id=current_setting('t.pa')::uuid;
  IF sp.status <> 'concluido' OR sp.concluded_at IS NULL OR sp.lock_session_id IS NOT NULL OR sp.lock_heartbeat_at IS NOT NULL THEN RAISE EXCEPTION 'conclude: %', sp; END IF;
  IF sp.state <> '{"missas":[],"v":2}'::jsonb THEN RAISE EXCEPTION 'conclude perdeu o state'; END IF;
END $$;
SET ROLE authenticated;
SELECT pg_temp.expect_err(format('SELECT public.plan_save(%L,''sA2'',''q3'',2,''{"a":3}'')',:'pa'),'plan_concluded');
SELECT public.plan_open('2026-12','sA9') AS r5 \gset
SELECT set_config('t.r5', :'r5', false);
DO $$ DECLARE r jsonb := current_setting('t.r5'); BEGIN
  IF r->>'mode' <> 'concluded' OR r->'plan'->'state' <> '{"missas":[],"v":2}'::jsonb THEN RAISE EXCEPTION 'open concluido: %', r; END IF;
END $$;
SELECT public.plan_reopen(:'pa','sA9') AS r6 \gset
SELECT set_config('t.r6', :'r6', false);
DO $$ DECLARE r jsonb := current_setting('t.r6'); BEGIN
  IF r->>'mode' <> 'edit' OR r->'plan'->>'status' <> 'em_andamento' OR r->'plan'->'state' <> '{"missas":[],"v":2}'::jsonb
     OR (r->'plan'->>'revision')::bigint <> 2 THEN RAISE EXCEPTION 'reopen: %', r; END IF;
END $$;
RESET ROLE;
DO $$ BEGIN
  IF (SELECT lock_session_id FROM public.schedule_plans WHERE id=current_setting('t.pa')::uuid) <> 'sA9' THEN RAISE EXCEPTION 'reopen nao reservou'; END IF;
  IF (SELECT concluded_at FROM public.schedule_plans WHERE id=current_setting('t.pa')::uuid) IS NOT NULL THEN RAISE EXCEPTION 'concluded_at nao limpo'; END IF;
END $$;

-- (10) plano vencido nao grava
UPDATE public.schedule_plans SET expires_at = now() - interval '1 minute' WHERE id = :'pa';
SET ROLE authenticated;
SELECT pg_temp.expect_err(format('SELECT public.plan_save(%L,''sA9'',''q4'',2,''{"a":4}'')',:'pa'),'plan_expired');
RESET ROLE;
UPDATE public.schedule_plans SET expires_at = now() + interval '10 days' WHERE id = :'pa';

-- (12) release idempotente e heartbeat com sessão errada
SET ROLE authenticated;
SELECT public.plan_heartbeat(:'pa','sA9');
SELECT pg_temp.expect_err(format('SELECT public.plan_heartbeat(%L,''errada'')',:'pa'),'plan_lock_lost');
SELECT public.plan_release(:'pa','errada');
RESET ROLE;
DO $$ BEGIN IF (SELECT lock_session_id FROM public.schedule_plans WHERE id=current_setting('t.pa')::uuid) <> 'sA9' THEN RAISE EXCEPTION 'release de sessao errada liberou'; END IF; END $$;
SET ROLE authenticated;
SELECT public.plan_release(:'pa','sA9');
SELECT public.plan_release(:'pa','sA9');
SELECT public.plan_release(gen_random_uuid(),'sA9');
SELECT pg_temp.expect_err(format('SELECT public.plan_heartbeat(%L,''sA9'')',:'pa'),'plan_lock_lost');
RESET ROLE;
DO $$ BEGIN IF (SELECT lock_session_id FROM public.schedule_plans WHERE id=current_setting('t.pa')::uuid) IS NOT NULL THEN RAISE EXCEPTION 'release nao liberou'; END IF; END $$;

-- (11) discard: só o dono
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','c0000000-0000-0000-0000-0000000000a2',false);
SELECT pg_temp.expect_err(format('SELECT public.plan_discard(%L)',:'pa'),'forbidden');
SELECT public.plan_discard(:'pb');
SELECT pg_temp.expect_err(format('SELECT public.plan_discard(%L)',:'pb'),'plan_not_found');
RESET ROLE;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.schedule_plans WHERE id=current_setting('t.pa')::uuid) THEN RAISE EXCEPTION 'discard de nao dono apagou'; END IF;
  IF EXISTS (SELECT 1 FROM public.schedule_plans WHERE id=current_setting('t.pb')::uuid) THEN RAISE EXCEPTION 'discard do dono nao apagou'; END IF;
END $$;

SELECT 'planejamento compartilhado passed' AS result;
