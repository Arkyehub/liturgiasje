-- Planejamentos por coordenador (compartilhado): tabela schedule_plans e funções plan_*.
-- Idempotente. Pré-requisito: migration_archive_profiles.sql (public.is_admin, perfis arquivados).
-- Não aplicar em banco remoto sem autorização específica (ver AGENTS.md). Rollback:
-- migration_planejamento_compartilhado_rollback.sql
--
-- Acesso somente por funções SECURITY DEFINER: RLS ligado, nenhuma policy, grants de tabela revogados.
-- Cada função trava apenas a linha do plano (SELECT ... FOR UPDATE); não usa o lock global 13739001.
-- Reserva viva = lock_heartbeat_at > now() - 120 s. Só o dono reserva e grava.

CREATE TABLE IF NOT EXISTS public.schedule_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month_reference text NOT NULL CHECK (month_reference ~ '^\d{4}-\d{2}$'),
  owner_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  state jsonb,
  status text NOT NULL DEFAULT 'em_andamento' CHECK (status IN ('em_andamento','concluido')),
  revision bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '30 days',
  copied_from_owner_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  concluded_at timestamptz,
  lock_session_id text,
  lock_heartbeat_at timestamptz,
  last_request_id text,
  UNIQUE (month_reference, owner_profile_id)
);
ALTER TABLE public.schedule_plans ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.schedule_plans FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------- helpers internos
-- Perfil admin ativo de auth.uid(); caso contrário 'forbidden'.
CREATE OR REPLACE FUNCTION public.plan_actor() RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE me uuid;
BEGIN
  SELECT id INTO me FROM public.profiles
   WHERE auth_user_id = auth.uid() AND role = 'admin' AND archived_at IS NULL;
  IF me IS NULL THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  RETURN me;
END $$;
REVOKE ALL ON FUNCTION public.plan_actor() FROM PUBLIC, anon, authenticated;

-- Item de listagem. openElsewhere: reserva viva de outra sessão (ou qualquer reserva viva se p_session é nulo).
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
    'openElsewhere', (sp.lock_heartbeat_at IS NOT NULL
                      AND sp.lock_heartbeat_at > now() - interval '120 seconds'
                      AND (p_session IS NULL OR sp.lock_session_id IS DISTINCT FROM p_session))
  )
$$;
REVOKE ALL ON FUNCTION public.plan_item(public.schedule_plans, uuid, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.plan_detail(sp public.schedule_plans, me uuid, p_session text DEFAULT NULL) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT public.plan_item(sp, me, p_session) || jsonb_build_object('revision', sp.revision, 'state', sp.state)
$$;
REVOKE ALL ON FUNCTION public.plan_detail(public.schedule_plans, uuid, text) FROM PUBLIC, anon, authenticated;

-- Decide edit/readonly/concluded para o plano já travado do dono e, se possível, reserva.
CREATE OR REPLACE FUNCTION public.plan_enter(p_id uuid, me uuid, p_session text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE sp public.schedule_plans; mode text; seen timestamptz;
BEGIN
  SELECT * INTO sp FROM public.schedule_plans WHERE id = p_id;
  IF sp.status = 'concluido' THEN
    mode := 'concluded';
  ELSIF sp.lock_heartbeat_at IS NOT NULL
        AND sp.lock_heartbeat_at > now() - interval '120 seconds'
        AND sp.lock_session_id IS DISTINCT FROM p_session THEN
    mode := 'readonly'; seen := sp.lock_heartbeat_at;
  ELSE
    UPDATE public.schedule_plans SET lock_session_id = p_session, lock_heartbeat_at = now()
     WHERE id = p_id RETURNING * INTO sp;
    mode := 'edit';
  END IF;
  RETURN jsonb_build_object('mode', mode, 'holderLastSeen', seen,
                            'plan', public.plan_detail(sp, me, p_session));
END $$;
REVOKE ALL ON FUNCTION public.plan_enter(uuid, uuid, text) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------- API
CREATE OR REPLACE FUNCTION public.plan_list(p_months text[]) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE me uuid; m text; result jsonb;
BEGIN
  me := public.plan_actor();
  IF p_months IS NULL OR cardinality(p_months) > 12 THEN RAISE EXCEPTION 'invalid_arguments'; END IF;
  FOREACH m IN ARRAY p_months LOOP
    IF m IS NULL OR m !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'invalid_arguments'; END IF;
  END LOOP;
  DELETE FROM public.schedule_plans WHERE expires_at < now();
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
        DELETE FROM public.schedule_plans WHERE id = sp.id;  -- vencido: recomeça do zero
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

-- Leitura pura: nunca cria nem reserva.
CREATE OR REPLACE FUNCTION public.plan_get(p_plan_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE me uuid; sp public.schedule_plans;
BEGIN
  me := public.plan_actor();
  IF p_plan_id IS NULL THEN RAISE EXCEPTION 'invalid_arguments'; END IF;
  SELECT * INTO sp FROM public.schedule_plans WHERE id = p_plan_id AND expires_at >= now();
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN public.plan_detail(sp, me);
END $$;
REVOKE ALL ON FUNCTION public.plan_get(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plan_get(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.plan_copy(p_source uuid, p_overwrite boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE me uuid; src public.schedule_plans; sp public.schedule_plans; tries int := 0;
BEGIN
  me := public.plan_actor();
  IF p_source IS NULL OR p_overwrite IS NULL THEN RAISE EXCEPTION 'invalid_arguments'; END IF;
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
  -- Releitura do estado da origem já com o plano do chamador travado.
  SELECT * INTO src FROM public.schedule_plans WHERE id = p_source;
  UPDATE public.schedule_plans SET
      state = src.state,
      status = 'em_andamento',
      concluded_at = NULL,
      revision = sp.revision + 1,      -- outro aparelho com reserva recebe conflito ao gravar
      last_request_id = NULL,
      copied_from_owner_id = src.owner_profile_id,
      updated_at = now(),
      expires_at = now() + interval '30 days'
    WHERE id = sp.id RETURNING * INTO sp;
  RETURN public.plan_detail(sp, me);
END $$;
REVOKE ALL ON FUNCTION public.plan_copy(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plan_copy(uuid, boolean) TO authenticated;

-- Ordem das checagens: plano/dono, concluído, reserva, request_id repetido, revisão, vencido, tamanho.
-- (concluído vem antes da reserva porque plan_conclude libera a reserva.)
CREATE OR REPLACE FUNCTION public.plan_save(p_plan_id uuid, p_session text, p_request_id text, p_expected_revision bigint, p_state jsonb) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE me uuid; sp public.schedule_plans;
BEGIN
  me := public.plan_actor();
  IF p_plan_id IS NULL OR p_session IS NULL OR p_session = '' OR p_request_id IS NULL OR p_request_id = ''
     OR p_expected_revision IS NULL OR jsonb_typeof(p_state) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'invalid_arguments';
  END IF;
  SELECT * INTO sp FROM public.schedule_plans WHERE id = p_plan_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'plan_not_found'; END IF;
  IF sp.owner_profile_id <> me THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF sp.status = 'concluido' THEN RAISE EXCEPTION 'plan_concluded'; END IF;
  IF sp.lock_session_id IS DISTINCT FROM p_session THEN RAISE EXCEPTION 'plan_lock_lost'; END IF;
  IF sp.last_request_id = p_request_id THEN RETURN sp.revision; END IF;
  IF sp.revision <> p_expected_revision THEN RAISE EXCEPTION 'plan_revision_conflict'; END IF;
  IF sp.expires_at < now() THEN RAISE EXCEPTION 'plan_expired'; END IF;
  IF octet_length(p_state::text) > 524288 THEN RAISE EXCEPTION 'plan_too_large'; END IF;
  UPDATE public.schedule_plans SET
      state = p_state, revision = sp.revision + 1, last_request_id = p_request_id,
      lock_heartbeat_at = now(), updated_at = now(), expires_at = now() + interval '30 days'
    WHERE id = sp.id RETURNING revision INTO sp.revision;
  RETURN sp.revision;
END $$;
REVOKE ALL ON FUNCTION public.plan_save(uuid, text, text, bigint, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plan_save(uuid, text, text, bigint, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.plan_heartbeat(p_plan_id uuid, p_session text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE me uuid; sp public.schedule_plans;
BEGIN
  me := public.plan_actor();
  IF p_plan_id IS NULL OR p_session IS NULL OR p_session = '' THEN RAISE EXCEPTION 'invalid_arguments'; END IF;
  SELECT * INTO sp FROM public.schedule_plans WHERE id = p_plan_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'plan_not_found'; END IF;
  IF sp.owner_profile_id <> me THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF sp.lock_session_id IS DISTINCT FROM p_session THEN RAISE EXCEPTION 'plan_lock_lost'; END IF;
  UPDATE public.schedule_plans SET lock_heartbeat_at = now() WHERE id = sp.id;
END $$;
REVOKE ALL ON FUNCTION public.plan_heartbeat(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plan_heartbeat(uuid, text) TO authenticated;

-- Idempotente: plano inexistente ou reserva de outra sessão não são erro.
CREATE OR REPLACE FUNCTION public.plan_release(p_plan_id uuid, p_session text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE me uuid; sp public.schedule_plans;
BEGIN
  me := public.plan_actor();
  IF p_plan_id IS NULL OR p_session IS NULL OR p_session = '' THEN RAISE EXCEPTION 'invalid_arguments'; END IF;
  SELECT * INTO sp FROM public.schedule_plans WHERE id = p_plan_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF sp.owner_profile_id <> me THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF sp.lock_session_id = p_session THEN
    UPDATE public.schedule_plans SET lock_session_id = NULL, lock_heartbeat_at = NULL WHERE id = sp.id;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.plan_release(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plan_release(uuid, text) TO authenticated;

-- Mantém o state; libera a reserva; concluído também vence em 30 dias. Repetir é inofensivo.
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
  IF sp.lock_session_id IS DISTINCT FROM p_session THEN RAISE EXCEPTION 'plan_lock_lost'; END IF;
  UPDATE public.schedule_plans SET
      status = 'concluido', concluded_at = now(), lock_session_id = NULL, lock_heartbeat_at = NULL,
      updated_at = now(), expires_at = now() + interval '30 days'
    WHERE id = sp.id;
END $$;
REVOKE ALL ON FUNCTION public.plan_conclude(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plan_conclude(uuid, text) TO authenticated;

-- Volta a em_andamento mantendo o state e reserva (ou devolve readonly se outro aparelho já a segura).
CREATE OR REPLACE FUNCTION public.plan_reopen(p_plan_id uuid, p_session text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE me uuid; sp public.schedule_plans;
BEGIN
  me := public.plan_actor();
  IF p_plan_id IS NULL OR p_session IS NULL OR p_session = '' OR length(p_session) > 128 THEN
    RAISE EXCEPTION 'invalid_arguments';
  END IF;
  SELECT * INTO sp FROM public.schedule_plans WHERE id = p_plan_id FOR UPDATE;
  IF NOT FOUND OR sp.expires_at < now() THEN RAISE EXCEPTION 'plan_not_found'; END IF;
  IF sp.owner_profile_id <> me THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF sp.status = 'concluido' THEN
    UPDATE public.schedule_plans SET
        status = 'em_andamento', concluded_at = NULL, updated_at = now(), expires_at = now() + interval '30 days'
      WHERE id = sp.id;
  END IF;
  RETURN public.plan_enter(sp.id, me, p_session);
END $$;
REVOKE ALL ON FUNCTION public.plan_reopen(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plan_reopen(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.plan_discard(p_plan_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE me uuid; sp public.schedule_plans;
BEGIN
  me := public.plan_actor();
  IF p_plan_id IS NULL THEN RAISE EXCEPTION 'invalid_arguments'; END IF;
  SELECT * INTO sp FROM public.schedule_plans WHERE id = p_plan_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'plan_not_found'; END IF;
  IF sp.owner_profile_id <> me THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  DELETE FROM public.schedule_plans WHERE id = sp.id;
END $$;
REVOKE ALL ON FUNCTION public.plan_discard(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plan_discard(uuid) TO authenticated;
