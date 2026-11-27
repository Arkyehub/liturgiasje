\set ON_ERROR_STOP on
-- Configurações do planejamento: planner_settings + plan_copy de 4 argumentos.
-- Executar após migration_planejamento_compartilhado.sql, migration_planejamento_sem_reserva.sql e
-- migration_planejamento_configuracoes.sql, em banco descartável. Perfis sintéticos (prefixos c1/d1).
INSERT INTO auth.users(id) VALUES
 ('c1000000-0000-0000-0000-0000000000a1'),('c1000000-0000-0000-0000-0000000000a2'),
 ('c1000000-0000-0000-0000-0000000000a3'),('c1000000-0000-0000-0000-0000000000a4');
INSERT INTO public.profiles(id,auth_user_id,email,full_name,role) VALUES
 ('d1000000-0000-0000-0000-0000000000a1','c1000000-0000-0000-0000-0000000000a1','cfg-a@local','Cfg A','admin'),
 ('d1000000-0000-0000-0000-0000000000a2','c1000000-0000-0000-0000-0000000000a2','cfg-b@local','Cfg B','admin'),
 ('d1000000-0000-0000-0000-0000000000a4','c1000000-0000-0000-0000-0000000000a4','cfg-r@local','Cfg Leitor','reader');
INSERT INTO public.profiles(id,auth_user_id,email,full_name,role,archived_at) VALUES
 ('d1000000-0000-0000-0000-0000000000a3','c1000000-0000-0000-0000-0000000000a3','cfg-x@local','Cfg Arquivado','admin',now());

CREATE FUNCTION pg_temp.expect_err(stmt text, code text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE failed boolean := false; msg text;
BEGIN
  BEGIN EXECUTE stmt;
  EXCEPTION WHEN OTHERS THEN failed := true; msg := SQLERRM; END;
  IF NOT failed THEN RAISE EXCEPTION 'esperava erro % mas passou: %', code, stmt; END IF;
  IF msg <> code THEN RAISE EXCEPTION 'esperava erro % mas veio %: %', code, msg, stmt; END IF;
END $$;

-- (1) privilégios e nenhuma semente
DO $$ DECLARE f text; r text; p text; BEGIN
  FOREACH f IN ARRAY ARRAY['planner_settings_get()','planner_settings_save(jsonb,jsonb)','plan_copy(uuid,text,boolean,boolean)','plan_copy(uuid,text,boolean)'] LOOP
    IF NOT has_function_privilege('authenticated','public.'||f,'EXECUTE') THEN RAISE EXCEPTION 'authenticated sem EXECUTE em %', f; END IF;
    IF has_function_privilege('anon','public.'||f,'EXECUTE') THEN RAISE EXCEPTION 'anon executa %', f; END IF;
  END LOOP;
  FOREACH f IN ARRAY ARRAY['planner_settings_significant(jsonb,jsonb)','planner_settings_json(jsonb,jsonb)'] LOOP
    IF has_function_privilege('authenticated','public.'||f,'EXECUTE') OR has_function_privilege('anon','public.'||f,'EXECUTE') THEN RAISE EXCEPTION 'helper exposto: %', f; END IF;
  END LOOP;
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
    FOREACH p IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE'] LOOP
      IF has_table_privilege(r,'public.planner_settings',p) THEN RAISE EXCEPTION '% tem % direto em planner_settings', r, p; END IF;
    END LOOP;
  END LOOP;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.planner_settings'::regclass) THEN RAISE EXCEPTION 'RLS desligada'; END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='planner_settings') THEN RAISE EXCEPTION 'policy inesperada'; END IF;
  IF (SELECT count(*) FROM public.planner_settings) <> 0 THEN RAISE EXCEPTION 'a migration semeou linhas'; END IF;
END $$;

SET ROLE authenticated;
DO $$ BEGIN
  PERFORM pg_temp.expect_err('SELECT * FROM public.planner_settings','permission denied for table planner_settings');
END $$;

-- (2) quem não pode
SELECT set_config('request.jwt.claim.sub','',false);
SELECT pg_temp.expect_err($$SELECT public.planner_settings_get()$$,'forbidden');
SELECT set_config('request.jwt.claim.sub','c1000000-0000-0000-0000-0000000000a4',false);
SELECT pg_temp.expect_err($$SELECT public.planner_settings_get()$$,'forbidden');
SELECT pg_temp.expect_err($$SELECT public.planner_settings_save('[]','{}')$$,'forbidden');
SELECT set_config('request.jwt.claim.sub','c1000000-0000-0000-0000-0000000000a3',false);
SELECT pg_temp.expect_err($$SELECT public.planner_settings_get()$$,'forbidden');

-- (3) get sem linha: padrões, sem missas
SELECT set_config('request.jwt.claim.sub','c1000000-0000-0000-0000-0000000000a1',false);
SELECT public.planner_settings_get() AS g0 \gset
SELECT set_config('t.g0', :'g0', false);
DO $$ BEGIN
  IF current_setting('t.g0')::jsonb <> '{"standardMasses":[],"lampRules":{},"hasCustom":false}'::jsonb THEN RAISE EXCEPTION 'get sem linha: %', current_setting('t.g0'); END IF;
END $$;

-- (4) validações (nada é gravado)
SELECT pg_temp.expect_err($$SELECT public.planner_settings_save('{}','{}')$$,'invalid_settings');
SELECT pg_temp.expect_err($$SELECT public.planner_settings_save('[]','[]')$$,'invalid_settings');
SELECT pg_temp.expect_err($$SELECT public.planner_settings_save(NULL,'{}')$$,'invalid_settings');
SELECT pg_temp.expect_err($$SELECT public.planner_settings_save('[{"weekday":7,"time":"09:00","roles":["C"]}]','{}')$$,'invalid_settings');
SELECT pg_temp.expect_err($$SELECT public.planner_settings_save('[{"weekday":"2","time":"09:00","roles":["C"]}]','{}')$$,'invalid_settings');
SELECT pg_temp.expect_err($$SELECT public.planner_settings_save('[{"weekday":2,"time":"25:00","roles":["C"]}]','{}')$$,'invalid_settings');
SELECT pg_temp.expect_err($$SELECT public.planner_settings_save('[{"weekday":2,"time":"9:00","roles":["C"]}]','{}')$$,'invalid_settings');
SELECT pg_temp.expect_err($$SELECT public.planner_settings_save('[{"weekday":2,"time":"09:00","roles":[]}]','{}')$$,'invalid_settings');
SELECT pg_temp.expect_err($$SELECT public.planner_settings_save('[{"weekday":2,"time":"09:00","roles":["C","C"]}]','{}')$$,'invalid_settings');
SELECT pg_temp.expect_err($$SELECT public.planner_settings_save('[{"weekday":2,"time":"09:00","roles":["X"]}]','{}')$$,'invalid_settings');
SELECT pg_temp.expect_err($$SELECT public.planner_settings_save('[{"weekday":2,"time":"09:00","roles":[1]}]','{}')$$,'invalid_settings');
SELECT pg_temp.expect_err($$SELECT public.planner_settings_save('[{"weekday":2,"time":"09:00","roles":["L","1L"]}]','{}')$$,'invalid_settings');
SELECT pg_temp.expect_err($$SELECT public.planner_settings_save('[{"weekday":2,"time":"09:00","roles":["L","2L"]}]','{}')$$,'invalid_settings');
SELECT pg_temp.expect_err($$SELECT public.planner_settings_save('[{"weekday":2,"time":"09:00","roles":["C"]},{"weekday":2,"time":"09:00","roles":["L"]}]','{}')$$,'invalid_settings');
SELECT pg_temp.expect_err($$SELECT public.planner_settings_save('["x"]','{}')$$,'invalid_settings');
SELECT pg_temp.expect_err($$SELECT public.planner_settings_save('[]','{"balance":"sim"}')$$,'invalid_settings');
SELECT pg_temp.expect_err($$SELECT public.planner_settings_save((SELECT jsonb_agg(jsonb_build_object('weekday',(g%7),'time',lpad((g/7)::text,2,'0')||':00','roles',jsonb_build_array('C'))) FROM generate_series(0,70) g),'{}')$$,'invalid_settings');
SELECT pg_temp.expect_err($$SELECT public.planner_settings_save('[]', jsonb_build_object('balance', true, 'x', repeat('a', 40000)))$$,'settings_too_large');
RESET ROLE;
DO $$ BEGIN
  IF (SELECT count(*) FROM public.planner_settings) <> 0 THEN RAISE EXCEPTION 'validação gravou linha'; END IF;
END $$;

-- (5) save válido: upsert, normalização, hasCustom
SET ROLE authenticated;
SELECT public.planner_settings_save(
  '[{"weekday":2,"time":"19:00","roles":["L","C"]},{"weekday":0,"time":"09:00","roles":["P","2L","1L","C"]},{"weekday":0,"time":"07:00","roles":["C"]}]',
  '{"balance":false,"preferences":true,"coisa":true}') AS s1 \gset
SELECT set_config('t.s1', :'s1', false);
DO $$ DECLARE s jsonb := current_setting('t.s1')::jsonb; BEGIN
  IF s->'standardMasses' <> '[{"weekday":0,"time":"07:00","roles":["C"]},{"weekday":0,"time":"09:00","roles":["C","1L","2L","P"]},{"weekday":2,"time":"19:00","roles":["C","L"]}]'::jsonb THEN RAISE EXCEPTION 'normalização das missas: %', s; END IF;
  IF s->'lampRules' <> '{"balance":false,"preferences":true}'::jsonb THEN RAISE EXCEPTION 'regras (chaves desconhecidas devem sair): %', s; END IF;
  IF (s->>'hasCustom')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'hasCustom: %', s; END IF;
END $$;
SELECT public.planner_settings_get() AS g1 \gset
SELECT set_config('t.g1', :'g1', false);
DO $$ BEGIN IF current_setting('t.g1')::jsonb <> current_setting('t.s1')::jsonb THEN RAISE EXCEPTION 'get difere do save'; END IF; END $$;
-- segundo save substitui (upsert)
SELECT public.planner_settings_save('[]','{}') AS s2 \gset
SELECT set_config('t.s2', :'s2', false);
DO $$ BEGIN
  IF current_setting('t.s2')::jsonb <> '{"standardMasses":[],"lampRules":{},"hasCustom":false}'::jsonb THEN RAISE EXCEPTION 'save vazio: %', current_setting('t.s2'); END IF;
END $$;
RESET ROLE;
DO $$ BEGIN
  IF (SELECT count(*) FROM public.planner_settings WHERE profile_id='d1000000-0000-0000-0000-0000000000a1') <> 1 THEN RAISE EXCEPTION 'upsert duplicou'; END IF;
END $$;

-- (6) só regras "ligadas" (true) não é significativo; regra desligada é
SET ROLE authenticated;
SELECT (public.planner_settings_save('[]','{"balance":true,"sameDay":true}')->>'hasCustom')::boolean AS hc \gset
SELECT set_config('t.hc', :'hc'::text, false);
DO $$ BEGIN IF current_setting('t.hc')::boolean THEN RAISE EXCEPTION 'regras ligadas não deveriam ser significativas'; END IF; END $$;
RESET ROLE;

-- (7) isolamento entre coordenadores
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','c1000000-0000-0000-0000-0000000000a1',false);
SELECT public.planner_settings_save('[{"weekday":6,"time":"18:00","roles":["C","L"]}]','{"weekends":false}');
SELECT set_config('request.jwt.claim.sub','c1000000-0000-0000-0000-0000000000a2',false);
SELECT public.planner_settings_get() AS gb \gset
SELECT set_config('t.gb', :'gb', false);
DO $$ BEGIN
  IF current_setting('t.gb')::jsonb <> '{"standardMasses":[],"lampRules":{},"hasCustom":false}'::jsonb THEN RAISE EXCEPTION 'B enxergou as de A: %', current_setting('t.gb'); END IF;
END $$;
RESET ROLE;

-- (8) ownerHasSettings em plan_list e plan_copy com/sem configurações
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','c1000000-0000-0000-0000-0000000000a1',false);
SELECT (public.plan_open('2030-02','sa')->'plan'->>'id') AS pa \gset
SELECT set_config('t.pa', :'pa', false);
SELECT public.plan_save(:'pa','sa','k1',0,'{"missas":[{"d":"x"}]}');
SELECT set_config('request.jwt.claim.sub','c1000000-0000-0000-0000-0000000000a2',false);
SELECT public.plan_list(ARRAY['2030-02']) AS l1 \gset
SELECT set_config('t.l1', :'l1', false);
DO $$ DECLARE it jsonb := current_setting('t.l1')::jsonb->0; BEGIN
  IF (it->>'ownerHasSettings')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'ownerHasSettings de A (tem missa padrão e regra desligada): %', it; END IF;
END $$;
-- B copia SEM configurações: as de B continuam as mesmas (vazias)
SELECT public.plan_copy(:'pa','sb',false,false) AS c1 \gset
SELECT public.planner_settings_get() AS gb2 \gset
SELECT set_config('t.gb2', :'gb2', false);
DO $$ BEGIN IF current_setting('t.gb2')::jsonb->'standardMasses' <> '[]'::jsonb THEN RAISE EXCEPTION 'cópia sem configurações mexeu nas de B'; END IF; END $$;
-- B copia COM configurações: passa a ter as de A (substitui)
SELECT public.planner_settings_save('[{"weekday":1,"time":"06:00","roles":["L"]}]','{}');
SELECT public.plan_copy(:'pa','sb',true,true) AS c2 \gset
SELECT public.planner_settings_get() AS gb3 \gset
SELECT set_config('t.gb3', :'gb3', false);
DO $$ BEGIN
  IF current_setting('t.gb3')::jsonb->'standardMasses' <> '[{"weekday":6,"time":"18:00","roles":["C","L"]}]'::jsonb THEN RAISE EXCEPTION 'cópia com configurações: %', current_setting('t.gb3'); END IF;
  IF current_setting('t.gb3')::jsonb->'lampRules' <> '{"weekends":false}'::jsonb THEN RAISE EXCEPTION 'regras copiadas: %', current_setting('t.gb3'); END IF;
END $$;
-- A não foi alterada pela cópia de B
SELECT set_config('request.jwt.claim.sub','c1000000-0000-0000-0000-0000000000a1',false);
SELECT public.planner_settings_get() AS ga2 \gset
SELECT set_config('t.ga2', :'ga2', false);
DO $$ BEGIN IF current_setting('t.ga2')::jsonb->'standardMasses' <> '[{"weekday":6,"time":"18:00","roles":["C","L"]}]'::jsonb THEN RAISE EXCEPTION 'A foi alterada'; END IF; END $$;
RESET ROLE;

-- (9) origem SEM configurações significativas: copy_settings=true não apaga as de B
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','c1000000-0000-0000-0000-0000000000a1',false);
SELECT public.planner_settings_save('[]','{"balance":true}');
SELECT (public.plan_open('2030-03','sa')->'plan'->>'id') AS pa3 \gset
SELECT set_config('t.pa3', :'pa3', false);
SELECT public.plan_save(:'pa3','sa','k3',0,'{"missas":[]}');
SELECT set_config('request.jwt.claim.sub','c1000000-0000-0000-0000-0000000000a2',false);
SELECT public.planner_settings_save('[{"weekday":3,"time":"20:00","roles":["C"]}]','{"sameDay":false}');
SELECT public.plan_copy(:'pa3','sb',false,true);
SELECT public.planner_settings_get() AS gb4 \gset
SELECT set_config('t.gb4', :'gb4', false);
DO $$ BEGIN
  IF current_setting('t.gb4')::jsonb->'standardMasses' <> '[{"weekday":3,"time":"20:00","roles":["C"]}]'::jsonb THEN RAISE EXCEPTION 'origem sem significado apagou as minhas: %', current_setting('t.gb4'); END IF;
END $$;
SELECT public.plan_list(ARRAY['2030-03']) AS l3 \gset
SELECT set_config('t.l3', :'l3', false);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(current_setting('t.l3')::jsonb) x WHERE x->>'ownerName'='Cfg A' AND (x->>'ownerHasSettings')::boolean) THEN RAISE EXCEPTION 'ownerHasSettings verdadeiro sem configurações significativas'; END IF;
END $$;
RESET ROLE;

-- (10) falha na cópia desfaz tudo (origem inexistente): configurações de B intactas
SET ROLE authenticated;
SELECT pg_temp.expect_err($$SELECT public.plan_copy(gen_random_uuid(),'sb',false,true)$$,'plan_not_found');
SELECT pg_temp.expect_err(format('SELECT public.plan_copy(%L,%L,false,NULL)',current_setting('t.pa3'),'sb'),'invalid_arguments');
SELECT public.planner_settings_get() AS gb5 \gset
SELECT set_config('t.gb5', :'gb5', false);
DO $$ BEGIN IF current_setting('t.gb5')::jsonb->'standardMasses' <> '[{"weekday":3,"time":"20:00","roles":["C"]}]'::jsonb THEN RAISE EXCEPTION 'falha alterou as configurações'; END IF; END $$;
-- a de 3 argumentos continua funcionando
SELECT (public.plan_copy(current_setting('t.pa3')::uuid,'sb',true)->>'monthReference') AS m3 \gset
DO $$ BEGIN NULL; END $$;
RESET ROLE;

-- (11) removendo o perfil, a linha vai junto (ON DELETE CASCADE)
DO $$ BEGIN
  DELETE FROM public.profiles WHERE id='d1000000-0000-0000-0000-0000000000a2';
  IF EXISTS (SELECT 1 FROM public.planner_settings WHERE profile_id='d1000000-0000-0000-0000-0000000000a2') THEN RAISE EXCEPTION 'cascade falhou'; END IF;
END $$;

SELECT 'configuracoes do planejamento passed' AS result;
