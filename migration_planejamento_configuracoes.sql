-- Configurações do planejamento por coordenador: missas padrão e regras da lâmpada.
-- Executar DEPOIS de migration_planejamento_compartilhado.sql e migration_planejamento_sem_reserva.sql.
-- Idempotente. NÃO semeia nenhuma missa padrão: cada coordenador (e cada igreja) define a sua estrutura.
--
-- Uma tabela, uma linha por coordenador (profile_id). RLS ligada sem políticas; acesso só pelas funções abaixo.
-- plan_copy ganha uma versão de 4 argumentos (sem valor padrão) que também pode copiar as configurações do dono
-- do planejamento de origem; a versão de 3 argumentos continua intacta para aplicativos já publicados.

CREATE TABLE IF NOT EXISTS public.planner_settings (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  standard_masses jsonb NOT NULL DEFAULT '[]'::jsonb,
  lamp_rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.planner_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.planner_settings FROM PUBLIC, anon, authenticated;

-- "Significativo": ao menos uma missa padrão ou ao menos uma regra desligada.
CREATE OR REPLACE FUNCTION public.planner_settings_significant(sm jsonb, lr jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, public AS $$
  SELECT COALESCE(jsonb_array_length(sm), 0) > 0
      OR EXISTS (SELECT 1 FROM jsonb_each(COALESCE(lr, '{}'::jsonb)) e WHERE e.value = 'false'::jsonb)
$$;
REVOKE ALL ON FUNCTION public.planner_settings_significant(jsonb, jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.planner_settings_json(sm jsonb, lr jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, public AS $$
  SELECT jsonb_build_object('standardMasses', sm, 'lampRules', lr,
                            'hasCustom', public.planner_settings_significant(sm, lr))
$$;
REVOKE ALL ON FUNCTION public.planner_settings_json(jsonb, jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.planner_settings_get() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE me uuid; r public.planner_settings;
BEGIN
  me := public.plan_actor();
  SELECT * INTO r FROM public.planner_settings WHERE profile_id = me;
  IF NOT FOUND THEN RETURN public.planner_settings_json('[]'::jsonb, '{}'::jsonb); END IF;
  RETURN public.planner_settings_json(r.standard_masses, r.lamp_rules);
END $$;
REVOKE ALL ON FUNCTION public.planner_settings_get() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.planner_settings_get() TO authenticated;

CREATE OR REPLACE FUNCTION public.planner_settings_save(p_standard_masses jsonb, p_lamp_rules jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  me uuid;
  item jsonb;
  role_name text;
  roles_seen text[];
  keys_seen text[] := ARRAY[]::text[];
  key text;
  role_order text[] := ARRAY['C','1L','2L','L','P'];
  rule_keys text[] := ARRAY['balance','preferences','affinity','sameDay','weekends','history'];
  clean_masses jsonb;
  clean_rules jsonb := '{}'::jsonb;
  rk text;
BEGIN
  me := public.plan_actor();
  IF jsonb_typeof(p_standard_masses) IS DISTINCT FROM 'array' OR jsonb_typeof(p_lamp_rules) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'invalid_settings';
  END IF;
  IF octet_length(p_standard_masses::text) + octet_length(p_lamp_rules::text) > 32768 THEN
    RAISE EXCEPTION 'settings_too_large';
  END IF;
  IF jsonb_array_length(p_standard_masses) > 70 THEN RAISE EXCEPTION 'invalid_settings'; END IF;

  FOR item IN SELECT * FROM jsonb_array_elements(p_standard_masses) LOOP
    IF jsonb_typeof(item) <> 'object'
       OR (item->>'weekday') IS NULL OR (item->>'weekday') !~ '^[0-6]$' OR jsonb_typeof(item->'weekday') <> 'number'
       OR jsonb_typeof(item->'time') IS DISTINCT FROM 'string' OR (item->>'time') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       OR jsonb_typeof(item->'roles') IS DISTINCT FROM 'array'
       OR jsonb_array_length(item->'roles') NOT BETWEEN 1 AND 5 THEN
      RAISE EXCEPTION 'invalid_settings';
    END IF;
    roles_seen := ARRAY[]::text[];
    FOR i IN 0 .. jsonb_array_length(item->'roles') - 1 LOOP
      IF jsonb_typeof(item->'roles'->i) <> 'string' THEN RAISE EXCEPTION 'invalid_settings'; END IF;
      role_name := item->'roles'->>i;
      IF NOT (role_name = ANY (role_order)) OR role_name = ANY (roles_seen) THEN RAISE EXCEPTION 'invalid_settings'; END IF;
      roles_seen := roles_seen || role_name;
    END LOOP;
    IF 'L' = ANY (roles_seen) AND ('1L' = ANY (roles_seen) OR '2L' = ANY (roles_seen)) THEN
      RAISE EXCEPTION 'invalid_settings';
    END IF;
    key := (item->>'weekday') || '|' || (item->>'time');
    IF key = ANY (keys_seen) THEN RAISE EXCEPTION 'invalid_settings'; END IF;
    keys_seen := keys_seen || key;
  END LOOP;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'weekday', (x.item->>'weekday')::int,
           'time', x.item->>'time',
           'roles', (SELECT COALESCE(jsonb_agg(ro ORDER BY array_position(role_order, ro)), '[]'::jsonb)
                       FROM jsonb_array_elements_text(x.item->'roles') ro)
         ) ORDER BY (x.item->>'weekday')::int, x.item->>'time'), '[]'::jsonb)
    INTO clean_masses
    FROM jsonb_array_elements(p_standard_masses) AS x(item);

  FOREACH rk IN ARRAY rule_keys LOOP
    IF p_lamp_rules ? rk THEN
      IF jsonb_typeof(p_lamp_rules->rk) <> 'boolean' THEN RAISE EXCEPTION 'invalid_settings'; END IF;
      clean_rules := clean_rules || jsonb_build_object(rk, p_lamp_rules->rk);
    END IF;
  END LOOP;

  INSERT INTO public.planner_settings(profile_id, standard_masses, lamp_rules, updated_at)
       VALUES (me, clean_masses, clean_rules, now())
  ON CONFLICT (profile_id) DO UPDATE
    SET standard_masses = EXCLUDED.standard_masses, lamp_rules = EXCLUDED.lamp_rules, updated_at = now();
  RETURN public.planner_settings_json(clean_masses, clean_rules);
END $$;
REVOKE ALL ON FUNCTION public.planner_settings_save(jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.planner_settings_save(jsonb, jsonb) TO authenticated;

-- plan_item (usado por plan_list/plan_detail/plan_enter) ganha ownerHasSettings.
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
    'hasContent', sp.state IS NOT NULL,
    'ownerHasSettings', EXISTS (
      SELECT 1 FROM public.planner_settings ps
       WHERE ps.profile_id = sp.owner_profile_id
         AND public.planner_settings_significant(ps.standard_masses, ps.lamp_rules))
  )
$$;
REVOKE ALL ON FUNCTION public.plan_item(public.schedule_plans, uuid, text) FROM PUBLIC, anon, authenticated;

-- plan_copy de 4 argumentos: a cópia do planejamento é a da versão de 3 argumentos (mesma transação); depois, se
-- pedido e se o dono da origem tem configurações significativas, elas substituem as do coordenador atual.
-- Origem sem configurações significativas: não mexe nas minhas.
CREATE OR REPLACE FUNCTION public.plan_copy(p_source uuid, p_session text, p_overwrite boolean, p_copy_settings boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE me uuid; result jsonb; owner_id uuid; src public.planner_settings;
BEGIN
  me := public.plan_actor();
  IF p_copy_settings IS NULL THEN RAISE EXCEPTION 'invalid_arguments'; END IF;
  result := public.plan_copy(p_source, p_session, p_overwrite);
  IF p_copy_settings THEN
    SELECT owner_profile_id INTO owner_id FROM public.schedule_plans WHERE id = p_source;
    SELECT * INTO src FROM public.planner_settings WHERE profile_id = owner_id;
    IF FOUND AND public.planner_settings_significant(src.standard_masses, src.lamp_rules) THEN
      INSERT INTO public.planner_settings(profile_id, standard_masses, lamp_rules, updated_at)
           VALUES (me, src.standard_masses, src.lamp_rules, now())
      ON CONFLICT (profile_id) DO UPDATE
        SET standard_masses = EXCLUDED.standard_masses, lamp_rules = EXCLUDED.lamp_rules, updated_at = now();
    END IF;
  END IF;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.plan_copy(uuid, text, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plan_copy(uuid, text, boolean, boolean) TO authenticated;
