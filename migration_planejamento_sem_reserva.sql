-- Planejamento compartilhado: remove a reserva por aparelho.
-- Executar DEPOIS de migration_planejamento_compartilhado.sql. Idempotente (CREATE OR REPLACE + UPDATE).
--
-- Antes: um plano só podia ser editado por uma sessão (reserva de 120 s); fechar o app deixava a reserva presa e o
-- próprio dono via "aberto em outro aparelho". Agora o dono abre o plano de qualquer aparelho; a proteção contra
-- gravações concorrentes é só a revisão otimista (plan_revision_conflict) e a idempotência por request_id.
-- Os parâmetros de sessão continuam nas assinaturas (compatibilidade com aplicativos já publicados) mas são ignorados.
-- plan_heartbeat e plan_release viram no-ops pelo mesmo motivo. As colunas lock_* ficam sem uso (e zeradas).
-- Não altera dados de planejamento; não toca em nenhuma outra tabela.

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

CREATE OR REPLACE FUNCTION public.plan_enter(p_id uuid, me uuid, p_session text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE sp public.schedule_plans;
BEGIN
  SELECT * INTO sp FROM public.schedule_plans WHERE id = p_id;
  RETURN jsonb_build_object(
    'mode', CASE WHEN sp.status = 'concluido' THEN 'concluded' ELSE 'edit' END,
    'plan', public.plan_detail(sp, me, p_session));
END $$;
REVOKE ALL ON FUNCTION public.plan_enter(uuid, uuid, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.plan_list(p_months text[]) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE me uuid; m text; result jsonb;
BEGIN
  me := public.plan_actor();
  IF p_months IS NULL OR cardinality(p_months) > 12 THEN RAISE EXCEPTION 'invalid_arguments'; END IF;
  FOREACH m IN ARRAY p_months LOOP
    IF m IS NULL OR m !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'invalid_arguments'; END IF;
  END LOOP;
  DELETE FROM public.schedule_plans WHERE id IN (
    SELECT id FROM public.schedule_plans WHERE expires_at < now() ORDER BY id FOR UPDATE SKIP LOCKED);
  SELECT COALESCE(jsonb_agg(public.plan_item(sp, me) ORDER BY sp.month_reference, sp.created_at, sp.id), '[]'::jsonb)
    INTO result
    FROM public.schedule_plans sp WHERE sp.month_reference = ANY(p_months);
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.plan_list(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plan_list(text[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.plan_open(p_month text, p_session text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE me uuid; sp public.schedule_plans; tries int := 0;
BEGIN
  me := public.plan_actor();
  IF p_month IS NULL OR p_month !~ '^\d{4}-(0[1-9]|1[0-2])$'
     OR p_session IS NULL OR p_session = '' OR length(p_session) > 128 THEN
    RAISE EXCEPTION 'invalid_arguments';
  END IF;
  LOOP
    tries := tries + 1;
    INSERT INTO public.schedule_plans(month_reference, owner_profile_id) VALUES (p_month, me)
      ON CONFLICT (month_reference, owner_profile_id) DO NOTHING;
    SELECT * INTO sp FROM public.schedule_plans
     WHERE month_reference = p_month AND owner_profile_id = me FOR UPDATE;
    IF FOUND THEN
      IF sp.expires_at < now() THEN
        DELETE FROM public.schedule_plans WHERE id = sp.id;
        CONTINUE;
      END IF;
      EXIT;
    END IF;
    IF tries >= 3 THEN RAISE EXCEPTION 'plan_not_found'; END IF;
  END LOOP;
  RETURN public.plan_enter(sp.id, me, p_session);
END $$;
REVOKE ALL ON FUNCTION public.plan_open(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plan_open(text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.plan_copy(p_source uuid, p_session text, p_overwrite boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE me uuid; src public.schedule_plans; sp public.schedule_plans; tries int := 0;
BEGIN
  me := public.plan_actor();
  IF p_source IS NULL OR p_overwrite IS NULL OR p_session IS NULL OR p_session = '' OR length(p_session) > 128 THEN
    RAISE EXCEPTION 'invalid_arguments';
  END IF;
  SELECT * INTO src FROM public.schedule_plans WHERE id = p_source AND expires_at >= now();
  IF NOT FOUND THEN RAISE EXCEPTION 'plan_not_found'; END IF;
  IF src.owner_profile_id = me THEN RAISE EXCEPTION 'invalid_arguments'; END IF;
  LOOP
    tries := tries + 1;
    INSERT INTO public.schedule_plans(month_reference, owner_profile_id) VALUES (src.month_reference, me)
      ON CONFLICT (month_reference, owner_profile_id) DO NOTHING;
    SELECT * INTO sp FROM public.schedule_plans
     WHERE month_reference = src.month_reference AND owner_profile_id = me FOR UPDATE;
    EXIT WHEN FOUND;
    IF tries >= 3 THEN RAISE EXCEPTION 'plan_not_found'; END IF;
  END LOOP;
  IF sp.state IS NOT NULL AND sp.expires_at >= now() AND NOT p_overwrite THEN
    RAISE EXCEPTION 'plan_exists';
  END IF;
  SELECT * INTO src FROM public.schedule_plans WHERE id = p_source AND expires_at >= now();
  IF NOT FOUND THEN RAISE EXCEPTION 'plan_not_found'; END IF;
  IF src.state IS NULL THEN RAISE EXCEPTION 'plan_not_found'; END IF;
  UPDATE public.schedule_plans SET
      state = src.state,
      status = 'em_andamento',
      concluded_at = NULL,
      revision = sp.revision + 1,
      last_request_id = NULL,
      copied_from_owner_id = src.owner_profile_id,
      updated_at = now(),
      expires_at = now() + interval '30 days'
    WHERE id = sp.id RETURNING * INTO sp;
  RETURN public.plan_detail(sp, me, p_session);
END $$;
REVOKE ALL ON FUNCTION public.plan_copy(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plan_copy(uuid, text, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.plan_save(p_plan_id uuid, p_session text, p_request_id text, p_expected_revision bigint, p_state jsonb) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE me uuid; sp public.schedule_plans;
BEGIN
  me := public.plan_actor();
  IF p_plan_id IS NULL OR p_session IS NULL OR p_session = '' OR p_request_id IS NULL OR p_request_id = '' OR length(p_request_id) > 128
     OR p_expected_revision IS NULL OR jsonb_typeof(p_state) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'invalid_arguments';
  END IF;
  SELECT * INTO sp FROM public.schedule_plans WHERE id = p_plan_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'plan_not_found'; END IF;
  IF sp.owner_profile_id <> me THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF sp.status = 'concluido' THEN RAISE EXCEPTION 'plan_concluded'; END IF;
  IF sp.last_request_id = p_request_id THEN RETURN sp.revision; END IF;
  IF sp.revision <> p_expected_revision THEN RAISE EXCEPTION 'plan_revision_conflict'; END IF;
  IF sp.expires_at < now() THEN RAISE EXCEPTION 'plan_expired'; END IF;
  IF octet_length(p_state::text) > 524288 THEN RAISE EXCEPTION 'plan_too_large'; END IF;
  UPDATE public.schedule_plans SET
      state = p_state, revision = sp.revision + 1, last_request_id = p_request_id,
      updated_at = now(), expires_at = now() + interval '30 days'
    WHERE id = sp.id RETURNING revision INTO sp.revision;
  RETURN sp.revision;
END $$;
REVOKE ALL ON FUNCTION public.plan_save(uuid, text, text, bigint, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plan_save(uuid, text, text, bigint, jsonb) TO authenticated;

-- No-ops (mantidos para aplicativos já publicados que ainda os chamam).
CREATE OR REPLACE FUNCTION public.plan_heartbeat(p_plan_id uuid, p_session text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE me uuid; sp public.schedule_plans;
BEGIN
  me := public.plan_actor();
  IF p_plan_id IS NULL OR p_session IS NULL OR p_session = '' THEN RAISE EXCEPTION 'invalid_arguments'; END IF;
  SELECT * INTO sp FROM public.schedule_plans WHERE id = p_plan_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'plan_not_found'; END IF;
  IF sp.owner_profile_id <> me THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.plan_heartbeat(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plan_heartbeat(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.plan_release(p_plan_id uuid, p_session text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE me uuid; sp public.schedule_plans;
BEGIN
  me := public.plan_actor();
  IF p_plan_id IS NULL OR p_session IS NULL OR p_session = '' THEN RAISE EXCEPTION 'invalid_arguments'; END IF;
  SELECT * INTO sp FROM public.schedule_plans WHERE id = p_plan_id;
  IF NOT FOUND THEN RETURN; END IF;
  IF sp.owner_profile_id <> me THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.plan_release(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plan_release(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.plan_conclude(p_plan_id uuid, p_session text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE me uuid; sp public.schedule_plans;
BEGIN
  me := public.plan_actor();
  IF p_plan_id IS NULL OR p_session IS NULL OR p_session = '' THEN RAISE EXCEPTION 'invalid_arguments'; END IF;
  SELECT * INTO sp FROM public.schedule_plans WHERE id = p_plan_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'plan_not_found'; END IF;
  IF sp.owner_profile_id <> me THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF sp.status = 'concluido' THEN RETURN; END IF;
  IF sp.expires_at < now() THEN RAISE EXCEPTION 'plan_expired'; END IF;
  UPDATE public.schedule_plans SET
      status = 'concluido', concluded_at = now(),
      updated_at = now(), expires_at = now() + interval '30 days'
    WHERE id = sp.id;
END $$;
REVOKE ALL ON FUNCTION public.plan_conclude(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plan_conclude(uuid, text) TO authenticated;

-- plan_reopen e plan_discard não dependem da reserva (plan_reopen usa plan_enter, já substituída acima).

UPDATE public.schedule_plans SET lock_session_id = NULL, lock_heartbeat_at = NULL
 WHERE lock_session_id IS NOT NULL OR lock_heartbeat_at IS NOT NULL;
