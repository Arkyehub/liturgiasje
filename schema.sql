-- 1. Tabelas de Identidade e Usuários
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id),
    email TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    avatar_url TEXT,
    role TEXT CHECK (role IN ('admin', 'reader')) DEFAULT 'reader',
    whatsapp TEXT,
    birth_date DATE,
    preferences JSONB DEFAULT '{}',
    claimed_at TIMESTAMPTZ,
    is_self_registered BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name TEXT NOT NULL,
    whatsapp TEXT,
    is_claimed BOOLEAN DEFAULT false,
    claimed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
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
    reader_id UUID REFERENCES public.users(id),
    member_id UUID REFERENCES public.members(id),
    original_reader_id UUID REFERENCES public.users(id),
    is_confirmed BOOLEAN DEFAULT false,
    is_swap_requested BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.unavailable_dates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, date)
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
    related_schedule_slot_id UUID REFERENCES public.schedule_slots(id) ON DELETE SET NULL,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES public.users(id)
);

CREATE TABLE IF NOT EXISTS public.announcement_views (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    announcement_id UUID REFERENCES public.announcements(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    viewed_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(announcement_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    subscription JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, subscription)
);

-- 4. Row Level Security (RLS)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.masses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcement_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unavailable_dates ENABLE ROW LEVEL SECURITY;

-- Exemplo de Política: Users are viewable by authenticated users
CREATE POLICY "Users are viewable by authenticated users" ON public.users FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Masses are viewable by everyone" ON public.masses FOR SELECT USING (true);
CREATE POLICY "Announcements are viewable by everyone" ON public.announcements FOR SELECT USING (true);
CREATE POLICY "App settings are viewable by everyone" ON public.app_settings FOR SELECT USING (true);
