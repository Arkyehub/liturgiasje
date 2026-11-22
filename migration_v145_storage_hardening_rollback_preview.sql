-- Rollback da v1.45 no PREVIEW: restaura as 4 policies de storage.objects e remove os limites dos buckets
-- (estado observado em 20/11/2026, antes da v1.45).
UPDATE storage.buckets SET file_size_limit = NULL, allowed_mime_types = NULL WHERE id IN ('avatars','announcement_media','mass-photos','leaflets');
DO $$ DECLARE p record; BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='storage' AND tablename='objects' LOOP
    EXECUTE format('DROP POLICY %I ON storage.objects', p.policyname);
  END LOOP;
END $$;
CREATE POLICY "Acesso público leitura para todos" ON storage.objects FOR SELECT TO public USING (true);
CREATE POLICY "Delete para autenticados"          ON storage.objects FOR DELETE TO authenticated USING (true);
CREATE POLICY "Update para autenticados"          ON storage.objects FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Upload para autenticados"          ON storage.objects FOR INSERT TO authenticated WITH CHECK (true);
