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
