-- Schema for OmniAgenda / CalendarAsist Tasks in Supabase (PostgreSQL)
-- Multitenant / Multiusuario con Supabase Auth

create table if not exists public.tasks (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade default auth.uid(),
  title text not null,
  category text not null,
  date text not null, -- YYYY-MM-DD
  time text not null, -- HH:mm
  end_time text,      -- HH:mm
  duration_minutes integer not null default 60,
  priority text not null default 'media',
  notes text,
  source_type text not null default 'manual',
  confidence numeric,
  completed boolean not null default false,
  detected_snippet text,
  extracted_fields jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Asegurar que la columna user_id existe si la tabla ya había sido creada antes
alter table public.tasks add column if not exists user_id uuid references auth.users(id) on delete cascade default auth.uid();

-- Enable Row Level Security (RLS)
alter table public.tasks enable row level security;

-- Eliminar políticas públicas o anteriores para no tener conflictos
drop policy if exists "Permitir lectura publica de tareas" on public.tasks;
drop policy if exists "Permitir insercion publica de tareas" on public.tasks;
drop policy if exists "Permitir actualizacion publica de tareas" on public.tasks;
drop policy if exists "Permitir eliminacion publica de tareas" on public.tasks;
drop policy if exists "Los usuarios pueden ver solo sus propias tareas" on public.tasks;
drop policy if exists "Los usuarios pueden crear sus propias tareas" on public.tasks;
drop policy if exists "Los usuarios pueden actualizar sus propias tareas" on public.tasks;
drop policy if exists "Los usuarios pueden eliminar sus propias tareas" on public.tasks;

-- Políticas de privacidad estrictas por usuario autenticado
create policy "Los usuarios pueden ver solo sus propias tareas"
  on public.tasks for select
  using (auth.uid() = user_id or user_id is null);

create policy "Los usuarios pueden crear sus propias tareas"
  on public.tasks for insert
  with check (auth.uid() = user_id or user_id is null);

create policy "Los usuarios pueden actualizar sus propias tareas"
  on public.tasks for update
  using (auth.uid() = user_id or user_id is null);

create policy "Los usuarios pueden eliminar sus propias tareas"
  on public.tasks for delete
  using (auth.uid() = user_id or user_id is null);

-- Enable Realtime for tasks table if available
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.tasks;
  end if;
exception
  when others then null;
end $$;

-- Indexes for fast querying by user, date and category
create index if not exists idx_tasks_user_id on public.tasks (user_id);
create index if not exists idx_tasks_date on public.tasks (date);
create index if not exists idx_tasks_category on public.tasks (category);
create index if not exists idx_tasks_created_at on public.tasks (created_at desc);

-- =========================================================================
-- FASE 1: Sincronización de entregas de Moodle (ICS)
-- =========================================================================

-- 1. Tabla de Asignaturas
create table if not exists public.asignaturas (
  codigo text primary key,
  nombre text not null,
  cuatrimestre text,
  activa boolean not null default true
);

-- 2. Tabla de Entregas (Moodle y manuales)
create table if not exists public.entregas (
  uid text primary key,
  asignatura_codigo text references public.asignaturas(codigo) on update cascade on delete set null,
  titulo_raw text,
  titulo text not null,
  tipo text not null default 'entrega', -- entrega | cierre_cuestionario
  grupo text,                           -- T1|T2|F1|F2|null
  oculta_por_grupo boolean not null default false,
  deadline_utc timestamp with time zone not null,
  descripcion text,
  moodle_modificado_utc timestamp with time zone,
  borrada_en_moodle boolean not null default false,
  -- Campos propios (la sync nunca los toca):
  estado text not null default 'pendiente', -- pendiente | hecha | descartada
  dificultad integer,                       -- 1-5
  horas_est numeric,
  horas_reales numeric,
  min_viable_min integer,
  grupo_confirmado boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. Tabla de Cambios detectados en sincronización
create table if not exists public.cambios (
  id text primary key,
  uid text references public.entregas(uid) on delete cascade,
  campo text not null,                      -- 'deadline_utc' | 'titulo'
  antes text,
  despues text,
  fecha timestamp with time zone default timezone('utc'::text, now()) not null,
  visto boolean not null default false
);

-- 4. Registro de auditoría de sincronizaciones
create table if not exists public.sync_log (
  id text primary key,
  fecha timestamp with time zone default timezone('utc'::text, now()) not null,
  ok boolean not null,
  nuevos integer not null default 0,
  actualizados integer not null default 0,
  borrados integer not null default 0,
  error text
);

-- Habilitar RLS y políticas
alter table public.asignaturas enable row level security;
alter table public.entregas enable row level security;
alter table public.cambios enable row level security;
alter table public.sync_log enable row level security;

create policy "Permitir todo en asignaturas" on public.asignaturas for all using (true) with check (true);
create policy "Permitir todo en entregas" on public.entregas for all using (true) with check (true);
create policy "Permitir todo en cambios" on public.cambios for all using (true) with check (true);
create policy "Permitir todo en sync_log" on public.sync_log for all using (true) with check (true);

-- Índices de consulta rápida
create index if not exists idx_entregas_deadline on public.entregas (deadline_utc asc);
create index if not exists idx_entregas_asig on public.entregas (asignatura_codigo);
create index if not exists idx_entregas_estado on public.entregas (estado);
create index if not exists idx_cambios_fecha on public.cambios (fecha desc);

-- Datos iniciales de Asignaturas
insert into public.asignaturas (codigo, nombre, cuatrimestre, activa) values
  ('GIA304F', 'Métodos estadísticos', null, true),
  ('GIE301F', 'Redes de comunicaciones I', null, true),
  ('GIE302F', 'Azpiegiturak eta sistemak', null, true),
  ('GIE303F', 'Komunikazio sareak II', null, true),
  ('GIF301F', 'Programazio aurreratua', null, true),
  ('GIG302F', 'Industria informatika', null, true),
  ('GIG303F', 'Konputagailuen arkitektura I', null, true),
  ('GIH301F', 'Datu-baseak', null, true),
  ('GIH302F', 'Análisis y diseño del software', null, true),
  ('H82009-ABCDEFGH', 'Euskara II', 'S2', true),
  ('H82014-ABCDEFGH', 'Euskara I', 'S1', true),
  ('I3001-F.2', 'Web ingeniaritza I', null, true)
on conflict (codigo) do update set
  nombre = excluded.nombre,
  cuatrimestre = excluded.cuatrimestre;
