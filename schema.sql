-- 1. Tabelas de Identidade e Usuários
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    avatar_url TEXT,
    role TEXT CHECK (role IN ('admin', 'reader')) DEFAULT 'reader',
    whatsapp TEXT,
    birth_date DATE,
    preferences JSONB DEFAULT '{}',
    claimed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Tabelas de Escala e Missas
CREATE TABLE IF NOT EXISTS public.masses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE NOT NULL,
    time TIME NOT NULL,
    special_description TEXT,
    external_group TEXT, -- Ex: "Catequese"
    month_reference TEXT NOT NULL, -- Ex: "2026-04"
    is_published BOOLEAN DEFAULT false,
    photo_url TEXT,
    photo_description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.schedule_slots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mass_id UUID REFERENCES public.masses(id) ON DELETE CASCADE,
    role TEXT CHECK (role IN ('C', '1L', '2L', 'P', 'L')),
    profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    original_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    is_confirmed BOOLEAN DEFAULT false,
    is_swap_requested BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.unavailable_dates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(profile_id, date)
);

-- 3. Tabelas de Comunicação e App
CREATE TABLE IF NOT EXISTS public.announcements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT,
    content TEXT NOT NULL,
    type TEXT CHECK (type IN ('Aviso', 'Troca')),
    image_url TEXT,
    image_urls JSONB DEFAULT '[]',
    audio_url TEXT,
    audio_urls JSONB DEFAULT '[]',
    pdf_urls JSONB DEFAULT '[]',
    related_schedule_slot_id UUID REFERENCES public.schedule_slots(id) ON DELETE SET NULL,
    expires_at TIMESTAMPTZ,
    is_published BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.announcement_views (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    announcement_id UUID REFERENCES public.announcements(id) ON DELETE CASCADE,
    profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    viewed_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(announcement_id, profile_id)
);

CREATE TABLE IF NOT EXISTS public.app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    subscription JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, subscription)
);

-- 4. Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.masses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcement_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unavailable_dates ENABLE ROW LEVEL SECURITY;

-- 5. Funções de Segurança RLS
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE auth_user_id = auth.uid() AND role = 'admin'
  );
END;
$$;

-- 6. Políticas de Segurança (RLS Policies)
CREATE POLICY "Profiles are viewable by authenticated users" ON public.profiles FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Admins podem tudo" ON public.profiles FOR ALL USING (public.is_admin());
CREATE POLICY "Usuários podem atualizar o próprio perfil" ON public.profiles FOR UPDATE USING ((auth.uid() = auth_user_id) OR public.is_admin());
CREATE POLICY "Usuários podem criar o próprio perfil" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = auth_user_id);

CREATE POLICY "Masses are viewable by everyone" ON public.masses FOR SELECT USING (true);
CREATE POLICY "Announcements are viewable by everyone" ON public.announcements FOR SELECT USING (true);
CREATE POLICY "App settings are viewable by everyone" ON public.app_settings FOR SELECT USING (true);
