-- Rollback de migration_planejamento_compartilhado.sql: remove as funções plan_* e a tabela schedule_plans.
-- Descarta os planejamentos gravados. Nada mais é alterado.
DROP FUNCTION IF EXISTS public.plan_discard(uuid);
DROP FUNCTION IF EXISTS public.plan_reopen(uuid, text);
DROP FUNCTION IF EXISTS public.plan_conclude(uuid, text);
DROP FUNCTION IF EXISTS public.plan_release(uuid, text);
DROP FUNCTION IF EXISTS public.plan_heartbeat(uuid, text);
DROP FUNCTION IF EXISTS public.plan_save(uuid, text, text, bigint, jsonb);
DROP FUNCTION IF EXISTS public.plan_copy(uuid, text, boolean);
DROP FUNCTION IF EXISTS public.plan_copy(uuid, boolean);
DROP FUNCTION IF EXISTS public.plan_get(uuid);
DROP FUNCTION IF EXISTS public.plan_open(text, text);
DROP FUNCTION IF EXISTS public.plan_list(text[]);
DROP FUNCTION IF EXISTS public.plan_enter(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.plan_detail(public.schedule_plans, uuid, text);
DROP FUNCTION IF EXISTS public.plan_item(public.schedule_plans, uuid, text);
DROP FUNCTION IF EXISTS public.plan_actor();
DROP TABLE IF EXISTS public.schedule_plans;
