-- ==============================================================================
-- KORI FILMS CONTROL — Esquema de Base de Datos Supabase (PostgreSQL)
-- Dominio: control.korifilms.cl
-- ==============================================================================

-- 1. ESTRUCTURA ACTUAL DE TENCHA MATCHERÍA (Ya presente en Supabase)
-- ------------------------------------------------------------------------------
-- Tablas activas:
--   - categorias (id text primary key, carpeta text, nombre text, jp text, intro text, orden int)
--   - productos (id serial primary key, categoria_id text, carpeta text, nombre text, sub text,
--                jp text, precio numeric, temperatura text, tags text[], disponible boolean default true,
--                descripcion text, variantes jsonb, orden int, created_at timestamptz)
--   - recomendados (id serial primary key, nombre text, sub text, jp text, precio numeric, ...)
--   - visitas (id serial primary key, visitor_id text, es_recurrente boolean, created_at timestamptz)

-- 2. TABLAS MULTI-TENANT PARA FUTUROS RESTAURANTES / LOCALES (Opcional en SQL Editor)
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.locales (
  id text PRIMARY KEY,                   -- Slug único, ej. 'tencha'
  nombre text NOT NULL,                  -- ej. 'Tencha Matchería'
  tipo text DEFAULT 'Cafetería / Bar',
  ciudad text DEFAULT 'Santiago, Chile',
  activo boolean DEFAULT true,
  logo_url text,
  created_at timestamptz DEFAULT now()
);

-- Insertar Tencha como primer local si no existe
INSERT INTO public.locales (id, nombre, tipo, ciudad, activo)
VALUES ('tencha', 'Tencha Matchería', 'Cafetería & Matcha Bar', 'Santiago, Chile', true)
ON CONFLICT (id) DO NOTHING;

-- Tabla de vinculación de usuarios autorizados por local
CREATE TABLE IF NOT EXISTS public.locales_usuarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  local_id text REFERENCES public.locales(id) ON DELETE CASCADE,
  user_email text NOT NULL,
  rol text NOT NULL DEFAULT 'admin_local', -- 'superadmin', 'admin_local', 'staff'
  nombre text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(local_id, user_email)
);

-- Insertar accesos iniciales
INSERT INTO public.locales_usuarios (local_id, user_email, rol, nombre)
VALUES 
  ('tencha', 'admin@korifilms.cl', 'superadmin', 'Superadmin Kori Films'),
  ('tencha', 'contacto@tencha.cl', 'admin_local', 'Administrador Tencha')
ON CONFLICT (local_id, user_email) DO NOTHING;

-- 3. POLÍTICAS DE ROW LEVEL SECURITY (RLS)
-- ------------------------------------------------------------------------------
ALTER TABLE public.productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categorias ENABLE ROW LEVEL SECURITY;

-- Política de lectura pública (para comensales que abren la carta digital)
CREATE POLICY "Lectura pública de productos" 
ON public.productos FOR SELECT 
USING (true);

CREATE POLICY "Lectura pública de categorias" 
ON public.categorias FOR SELECT 
USING (true);

-- Política de actualización para usuarios autorizados
CREATE POLICY "Gestión autorizada de productos" 
ON public.productos FOR ALL 
USING (auth.role() = 'authenticated' OR auth.role() = 'anon');

-- 4. BUCKET DE ALMACENAMIENTO PARA FOTOS Y VIDEOS
-- ------------------------------------------------------------------------------
-- Para habilitar subida directa de fotos y videos gastronómicos:
-- En Supabase Dashboard -> Storage -> Crear bucket "menu-media" con acceso público.
