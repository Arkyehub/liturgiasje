-- Desfaz migration_planejamento_configuracoes.sql: remove as funções novas, restaura plan_item (sem
-- ownerHasSettings) e apaga a tabela planner_settings (as configurações dos coordenadores SÃO apagadas).
-- A plan_copy de 3 argumentos e o resto do planejamento compartilhado não são tocados.

DROP FUNCTION IF EXISTS public.plan_copy(uuid, text, boolean, boolean);
DROP FUNCTION IF EXISTS public.planner_settings_save(jsonb, jsonb);
DROP FUNCTION IF EXISTS public.planner_settings_get();

CREATE OR REPLACE FUNCTION public.plan_item(sp public.schedule_plans, me uuid, p_session text DEFAULT NULL) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT jsonb_build_object(
    'id', sp.id,
    'monthReference', sp.month_reference,
    'ownerProfileId', sp.owner_profile_id,
    'ownerName', (SELECT full_name FROM public.profiles WHERE id = sp.owner_profile_id),
    'isMine', sp.owner_profile_id = me,
    'status', sp.status,
    'createdAt', sp.created_at,
    'updatedAt', sp.updated_at,
    'expiresAt', sp.expires_at,
    'copiedFromName', (SELECT full_name FROM public.profiles WHERE id = sp.copied_from_owner_id),
    'concludedAt', sp.concluded_at,
    'hasContent', sp.state IS NOT NULL
  )
$$;
REVOKE ALL ON FUNCTION public.plan_item(public.schedule_plans, uuid, text) FROM PUBLIC, anon, authenticated;

DROP FUNCTION IF EXISTS public.planner_settings_json(jsonb, jsonb);
DROP FUNCTION IF EXISTS public.planner_settings_significant(jsonb, jsonb);
DROP TABLE IF EXISTS public.planner_settings;
