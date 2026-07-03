-- Migração para alinhar o banco de Produção (pvgjzunalzpwaditseys) com o banco de Preview/Desenvolvimento (zusvuqhexyxvlbmxcfea)

-- 1. Tabela public.masses: Adicionar coluna liturgical_color
ALTER TABLE public.masses ADD COLUMN IF NOT EXISTS liturgical_color TEXT;

-- 2. Tabela public.announcements:
-- Remover o default antigo
ALTER TABLE public.announcements ALTER COLUMN image_urls DROP DEFAULT;
ALTER TABLE public.announcements ALTER COLUMN audio_urls DROP DEFAULT;
ALTER TABLE public.announcements ALTER COLUMN pdf_urls DROP DEFAULT;

-- Converter as colunas
ALTER TABLE public.announcements 
  ALTER COLUMN image_urls TYPE JSONB USING COALESCE(to_jsonb(image_urls), '[]'::jsonb),
  ALTER COLUMN audio_urls TYPE JSONB USING COALESCE(to_jsonb(audio_urls), '[]'::jsonb),
  ALTER COLUMN pdf_urls TYPE JSONB USING COALESCE(to_jsonb(pdf_urls), '[]'::jsonb);

-- Setar o novo default
ALTER TABLE public.announcements ALTER COLUMN image_urls SET DEFAULT '[]'::jsonb;
ALTER TABLE public.announcements ALTER COLUMN audio_urls SET DEFAULT '[]'::jsonb;
ALTER TABLE public.announcements ALTER COLUMN pdf_urls SET DEFAULT '[]'::jsonb;

-- Remover coluna legada created_by se existir
ALTER TABLE public.announcements DROP COLUMN IF EXISTS created_by CASCADE;

-- 3. Tabela public.schedule_slots:
-- Remover colunas legadas reader_id, original_reader_id, member_id
ALTER TABLE public.schedule_slots DROP COLUMN IF EXISTS reader_id CASCADE;
ALTER TABLE public.schedule_slots DROP COLUMN IF EXISTS original_reader_id CASCADE;
ALTER TABLE public.schedule_slots DROP COLUMN IF EXISTS member_id CASCADE;

-- 4. Remover tabela legada public.members (não existente no preview/dev)
DROP TABLE IF EXISTS public.members CASCADE;
