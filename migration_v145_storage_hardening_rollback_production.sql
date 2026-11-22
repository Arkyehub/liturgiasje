-- Rollback da v1.45 no PRODUCTION: restaura as 11 policies de storage.objects e remove os limites dos buckets
-- (estado observado em 20/11/2026, antes da v1.45). Depende de public.users (existe até a v1.44 ser aplicada;
-- se a v1.44 já foi aplicada, reverta-a antes ou troque a subconsulta por public.is_admin()).
UPDATE storage.buckets SET file_size_limit = NULL, allowed_mime_types = NULL WHERE id IN ('avatars','announcement_media','mass-photos','leaflets');
DO $$ DECLARE p record; BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='storage' AND tablename='objects' LOOP
    EXECUTE format('DROP POLICY %I ON storage.objects', p.policyname);
  END LOOP;
END $$;
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
