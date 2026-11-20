\set ON_ERROR_STOP on
-- Teste da v1.45 (endurecimento do Storage) em PostgreSQL descartável, sobre fixture.sql + schema.sql +
-- fixture-preview-policies.sql + migration_archive_profiles.sql. Os dados e o schema de storage são sintéticos.
-- Rodar a partir da raiz:  psql -X -v ON_ERROR_STOP=1 -d <banco> -f tests/database/storage-hardening.sql
CREATE SCHEMA storage;
CREATE TABLE storage.buckets (id text PRIMARY KEY, public boolean, file_size_limit bigint, allowed_mime_types text[]);
CREATE TABLE storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text REFERENCES storage.buckets(id), name text, owner_id text);
CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1] $$;
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA storage TO anon, authenticated;
GRANT ALL ON storage.objects, storage.buckets TO anon, authenticated;
INSERT INTO storage.buckets(id, public) VALUES ('avatars',true),('announcement_media',true),('leaflets',true),('mass-photos',true);
-- tabela legada citada pelas policies do Production (só para o rollback poder recriá-las)
CREATE TABLE public.users (id uuid PRIMARY KEY, role text);
GRANT SELECT ON public.users TO anon, authenticated;

-- usuários: admin, leitor, outro leitor. O id do perfil é DIFERENTE do id de login (como no Production).
INSERT INTO auth.users(id) VALUES ('10000000-0000-0000-0000-0000000000b1'),('10000000-0000-0000-0000-0000000000b2'),('10000000-0000-0000-0000-0000000000b3');
INSERT INTO public.profiles(id,auth_user_id,email,full_name,role) VALUES
('20000000-0000-0000-0000-0000000000b1','10000000-0000-0000-0000-0000000000b1','st-admin@local','ST Admin','admin'),
('20000000-0000-0000-0000-0000000000b2','10000000-0000-0000-0000-0000000000b2','st-leitor@local','ST Leitor','reader'),
('20000000-0000-0000-0000-0000000000b3','10000000-0000-0000-0000-0000000000b3','st-outro@local','ST Outro','reader');
INSERT INTO public.users VALUES ('10000000-0000-0000-0000-0000000000b1','admin');
INSERT INTO storage.objects(bucket_id,name) VALUES
 ('announcement_media','uploads/a.webp'),('avatars','20000000-0000-0000-0000-0000000000b3/avatar-1.webp'),
 ('leaflets','folheto_atual.pdf'),('mass-photos','m/1.jpg');

-- estado ANTES = policies do Production (11), conforme observado
CREATE POLICY "Acesso Público para Visualização" ON storage.objects FOR SELECT TO public USING (bucket_id = 'announcement_media'::text);
CREATE POLICY "Upload Autenticado v1" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'announcement_media'::text);
CREATE POLICY "Usuários Autenticados podem Atualizar" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'announcement_media'::text);
CREATE POLICY "Usuários Autenticados podem Deletar" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'announcement_media'::text);
CREATE POLICY "Usuários Autenticados podem fazer Upload" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'announcement_media'::text);
CREATE POLICY "Usuários autenticados podem enviar fotos" ON storage.objects FOR INSERT TO public WITH CHECK ((bucket_id = 'mass-photos'::text) AND (auth.role() = 'authenticated'::text));
CREATE POLICY "Usuários podem atualizar seus próprios avatars" ON storage.objects FOR UPDATE TO public USING ((bucket_id = 'avatars'::text) AND ((auth.uid())::text = (storage.foldername(name))[1]));
CREATE POLICY "Usuários podem deletar seus próprios avatars" ON storage.objects FOR DELETE TO public USING ((bucket_id = 'avatars'::text) AND ((auth.uid())::text = (storage.foldername(name))[1]));
CREATE POLICY "Usuários podem fazer upload de seus próprios avatars" ON storage.objects FOR INSERT TO public WITH CHECK ((bucket_id = 'avatars'::text) AND ((auth.uid())::text = (storage.foldername(name))[1]));
CREATE POLICY storage_avatars_owner_manage ON storage.objects FOR ALL TO public USING ((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text));
CREATE POLICY storage_media_admin_manage ON storage.objects FOR ALL TO public USING ((bucket_id = 'announcement_media'::text) AND (EXISTS (SELECT 1 FROM public.users WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::text)))));

-- reproduz o problema ANTES: um leitor comum apaga um arquivo do mural
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-0000000000b2',false);
DO $$ DECLARE n int; BEGIN
  DELETE FROM storage.objects WHERE bucket_id='announcement_media' AND name='uploads/a.webp';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'setup: o problema do Production (leitor apaga mídia do mural) deveria ser reproduzível'; END IF;
END $$;
RESET ROLE;
INSERT INTO storage.objects(bucket_id,name) VALUES ('announcement_media','uploads/a.webp');

\i migration_v145_storage_hardening.sql

-- limites
DO $$ BEGIN
  IF (SELECT file_size_limit FROM storage.buckets WHERE id='avatars') <> 2097152 THEN RAISE EXCEPTION 'limite avatars'; END IF;
  IF (SELECT file_size_limit FROM storage.buckets WHERE id='announcement_media') <> 26214400 THEN RAISE EXCEPTION 'limite mural'; END IF;
  IF (SELECT allowed_mime_types FROM storage.buckets WHERE id='announcement_media') IS NOT NULL THEN RAISE EXCEPTION 'mural não deve restringir tipo'; END IF;
  IF (SELECT count(*) FROM pg_policies WHERE schemaname='storage' AND tablename='objects') <> 3 THEN RAISE EXCEPTION 'esperadas 3 policies'; END IF;
END $$;

-- helper: tenta uma operação e devolve true se permitida
CREATE FUNCTION public.t_try_insert(b text, n text) RETURNS boolean LANGUAGE plpgsql AS $$ BEGIN INSERT INTO storage.objects(bucket_id,name) VALUES (b,n); RETURN true; EXCEPTION WHEN insufficient_privilege THEN RETURN false; END $$;
CREATE FUNCTION public.t_try_change(op text, b text, n text) RETURNS boolean LANGUAGE plpgsql AS $$ DECLARE c int; BEGIN
  IF op = 'update' THEN UPDATE storage.objects SET owner_id = 'x' WHERE bucket_id=b AND name=n; ELSE DELETE FROM storage.objects WHERE bucket_id=b AND name=n; END IF;
  GET DIAGNOSTICS c = ROW_COUNT; RETURN c > 0; EXCEPTION WHEN insufficient_privilege THEN RETURN false; END $$;
GRANT EXECUTE ON FUNCTION public.t_try_insert(text,text), public.t_try_change(text,text,text) TO authenticated, anon;

-- LEITOR (perfil b2, login b2)
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-0000000000b2',false);
DO $$ BEGIN
  IF NOT public.t_try_insert('avatars','20000000-0000-0000-0000-0000000000b2/avatar-2.webp') THEN RAISE EXCEPTION 'leitor deve gravar avatar na pasta do próprio perfil'; END IF;
  IF NOT public.t_try_insert('avatars','10000000-0000-0000-0000-0000000000b2/avatar-3.webp') THEN RAISE EXCEPTION 'leitor deve gravar avatar na pasta do próprio login (formato antigo)'; END IF;
  IF public.t_try_insert('avatars','20000000-0000-0000-0000-0000000000b3/hack.webp') THEN RAISE EXCEPTION 'leitor gravou na pasta de outro perfil'; END IF;
  IF public.t_try_insert('avatars','10000000-0000-0000-0000-0000000000b3/hack.webp') THEN RAISE EXCEPTION 'leitor gravou na pasta do login de outro'; END IF;
  IF public.t_try_change('delete','avatars','20000000-0000-0000-0000-0000000000b3/avatar-1.webp') THEN RAISE EXCEPTION 'leitor apagou avatar de outro'; END IF;
  IF public.t_try_change('update','avatars','20000000-0000-0000-0000-0000000000b3/avatar-1.webp') THEN RAISE EXCEPTION 'leitor alterou avatar de outro'; END IF;
  IF NOT public.t_try_change('delete','avatars','20000000-0000-0000-0000-0000000000b2/avatar-2.webp') THEN RAISE EXCEPTION 'leitor deve apagar o próprio avatar'; END IF;
  IF public.t_try_insert('announcement_media','uploads/x.webp') THEN RAISE EXCEPTION 'leitor gravou no mural'; END IF;
  IF public.t_try_change('update','announcement_media','uploads/a.webp') THEN RAISE EXCEPTION 'leitor alterou mídia do mural'; END IF;
  IF public.t_try_change('delete','announcement_media','uploads/a.webp') THEN RAISE EXCEPTION 'leitor apagou mídia do mural'; END IF;
  IF public.t_try_insert('mass-photos','m/2.jpg') THEN RAISE EXCEPTION 'leitor gravou em mass-photos'; END IF;
  IF public.t_try_insert('leaflets','x.pdf') THEN RAISE EXCEPTION 'leitor gravou em leaflets'; END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id='announcement_media') THEN RAISE EXCEPTION 'leitor deve conseguir ler (necessário para upsert)'; END IF;
END $$;

-- ADMIN (perfil b1, login b1)
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-0000000000b1',false);
DO $$ BEGIN
  IF NOT public.t_try_insert('announcement_media','announcements/audio/rec-1.webm') THEN RAISE EXCEPTION 'admin deve gravar no mural'; END IF;
  IF NOT public.t_try_change('update','announcement_media','announcements/audio/rec-1.webm') THEN RAISE EXCEPTION 'admin deve alterar mídia (upsert)'; END IF;
  IF NOT public.t_try_change('delete','announcement_media','announcements/audio/rec-1.webm') THEN RAISE EXCEPTION 'admin deve apagar mídia'; END IF;
  IF public.t_try_insert('leaflets','x.pdf') THEN RAISE EXCEPTION 'nem admin grava em leaflets pela API'; END IF;
END $$;

-- ANÔNIMO: lê, não escreve
RESET ROLE; SET ROLE anon;
SELECT set_config('request.jwt.claim.sub','',false);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id='avatars') THEN RAISE EXCEPTION 'anon deve ler'; END IF;
  IF public.t_try_insert('avatars','x/y.webp') THEN RAISE EXCEPTION 'anon gravou'; END IF;
END $$;
RESET ROLE;

-- idempotência
\i migration_v145_storage_hardening.sql
DO $$ BEGIN IF (SELECT count(*) FROM pg_policies WHERE schemaname='storage' AND tablename='objects') <> 3 THEN RAISE EXCEPTION 'não idempotente'; END IF; END $$;

-- ROLLBACK Production restaura as 11 policies e remove limites
\i migration_v145_storage_hardening_rollback_production.sql
DO $$ BEGIN
  IF (SELECT count(*) FROM pg_policies WHERE schemaname='storage' AND tablename='objects') <> 11 THEN RAISE EXCEPTION 'rollback production: esperadas 11 policies'; END IF;
  IF EXISTS (SELECT 1 FROM storage.buckets WHERE file_size_limit IS NOT NULL OR allowed_mime_types IS NOT NULL) THEN RAISE EXCEPTION 'rollback não removeu limites'; END IF;
END $$;

-- ROLLBACK Preview: reaplica a v1.45 e volta ao estado de 4 policies
\i migration_v145_storage_hardening.sql
\i migration_v145_storage_hardening_rollback_preview.sql
DO $$ BEGIN
  IF (SELECT count(*) FROM pg_policies WHERE schemaname='storage' AND tablename='objects') <> 4 THEN RAISE EXCEPTION 'rollback preview: esperadas 4 policies'; END IF;
END $$;
DROP FUNCTION public.t_try_insert(text,text), public.t_try_change(text,text,text);
SELECT 'storage hardening + rollbacks assertions passed' AS result;
