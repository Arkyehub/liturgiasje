-- v1.45 — endurecimento do Storage (NÃO APLICADO em Production). Aplicar só com autorização específica.
-- Aplicado primeiro no Preview. Rollback: migration_v145_storage_hardening_rollback_{preview,production}.sql
-- (cada um restaura as policies exatas observadas no respectivo ambiente em 20/11/2026).
--
-- Problemas corrigidos (observados nos dois ambientes):
--   * Preview: QUALQUER usuário autenticado podia inserir, alterar e apagar objetos de QUALQUER bucket (policies sem bucket_id).
--   * Production: qualquer autenticado alterava/apagava arquivos de announcement_media (policies só por bucket), havia policies
--     duplicadas, e a policy de admin decidia por public.users (tabela legada).
--   * Nenhum bucket tinha limite de tamanho ou tipo (há avatar de 7,7 MB no Production).
--
-- Regras novas (o app só usa getPublicUrl, upload com upsert e remove):
--   * leitura: buckets públicos (necessário para upsert, que consulta o objeto); URLs públicas não dependem de policy.
--   * announcement_media: escrita somente administrador (is_admin(), baseado em profiles).
--   * avatars: escrita pelo dono da pasta. O app grava em <profiles.id>/..., antigos uploads usam <auth uid>/...;
--     as DUAS formas são aceitas, e administradores também.
--   * mass-photos e leaflets: sem escrita pela API (o app não grava neles; service_role continua podendo).
--   * limites de tamanho/tipo nos buckets (só afetam novos uploads; arquivos existentes não mudam).
--     announcement_media não restringe tipo: gravações de áudio usam audio/webm;codecs=... e documentos variam.

-- 1) limites dos buckets
UPDATE storage.buckets SET file_size_limit = 2097152,  allowed_mime_types = ARRAY['image/webp','image/jpeg','image/png'] WHERE id = 'avatars';
UPDATE storage.buckets SET file_size_limit = 26214400                                                                  WHERE id = 'announcement_media';
UPDATE storage.buckets SET file_size_limit = 5242880,  allowed_mime_types = ARRAY['image/*']                           WHERE id = 'mass-photos';
UPDATE storage.buckets SET file_size_limit = 10485760, allowed_mime_types = ARRAY['application/pdf']                   WHERE id = 'leaflets';

-- 2) policies de storage.objects: substitui TODAS as existentes por um conjunto mínimo e escopado
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' LOOP
    EXECUTE format('DROP POLICY %I ON storage.objects', p.policyname);
  END LOOP;
END $$;

CREATE POLICY storage_public_read ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id IN ('avatars', 'announcement_media', 'leaflets', 'mass-photos'));

CREATE POLICY storage_media_admin_write ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'announcement_media' AND public.is_admin())
  WITH CHECK (bucket_id = 'announcement_media' AND public.is_admin());

CREATE POLICY storage_avatars_owner_write ON storage.objects FOR ALL TO authenticated
  USING (
    bucket_id = 'avatars' AND (
      (storage.foldername(name))[1] = (SELECT auth.uid())::text
      OR (storage.foldername(name))[1] IN (SELECT p.id::text FROM public.profiles p WHERE p.auth_user_id = (SELECT auth.uid()))
      OR public.is_admin()
    )
  )
  WITH CHECK (
    bucket_id = 'avatars' AND (
      (storage.foldername(name))[1] = (SELECT auth.uid())::text
      OR (storage.foldername(name))[1] IN (SELECT p.id::text FROM public.profiles p WHERE p.auth_user_id = (SELECT auth.uid()))
      OR public.is_admin()
    )
  );
