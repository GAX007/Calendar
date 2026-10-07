-- =========================================================================
-- MIGRACIÓN FASE 1: Seguridad RLS y Diagnóstico de Entregas Moodle
-- Ejecutar en: Supabase Dashboard -> SQL Editor -> New query -> Run
-- Idempotente: Se puede ejecutar múltiples veces sin romper nada
-- =========================================================================

-- 1. Asegurar tablas requeridas
create table if not exists public.asignaturas (
  codigo text primary key,
  nombre text not null,
  cuatrimestre text,
  activa boolean not null default true
);

create table if not exists public.entregas (
  uid text primary key,
  asignatura_codigo text references public.asignaturas(codigo) on update cascade on delete set null,
  titulo_raw text,
  titulo text not null,
  tipo text not null default 'entrega',
  grupo text,
  oculta_por_grupo boolean not null default false,
  deadline_utc timestamp with time zone not null,
  descripcion text,
  moodle_modificado_utc timestamp with time zone,
  borrada_en_moodle boolean not null default false,
  estado text not null default 'pendiente',
  dificultad integer,
  horas_est numeric,
  horas_reales numeric,
  min_viable_min integer,
  grupo_confirmado boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists public.cambios (
  id text primary key,
  uid text references public.entregas(uid) on delete cascade,
  campo text not null,
  antes text,
  despues text,
  fecha timestamp with time zone default timezone('utc'::text, now()) not null,
  visto boolean not null default false
);

create table if not exists public.sync_log (
  id text primary key,
  fecha timestamp with time zone default timezone('utc'::text, now()) not null,
  ok boolean not null,
  nuevos integer not null default 0,
  actualizados integer not null default 0,
  borrados integer not null default 0,
  error text
);

-- 2. Asegurar columnas de diagnóstico y seguridad
alter table public.sync_log add column if not exists detalles jsonb;
alter table public.entregas add column if not exists grupo_confirmado boolean default false;
alter table public.entregas add column if not exists borrada_en_moodle boolean not null default false;

-- 3. Habilitar RLS (Row Level Security)
alter table public.asignaturas enable row level security;
alter table public.entregas enable row level security;
alter table public.cambios enable row level security;
alter table public.sync_log enable row level security;

-- 4. Limpiar políticas previas para evitar duplicados
drop policy if exists "Permitir lectura publica de asignaturas" on public.asignaturas;
drop policy if exists "Permitir modificacion de asignaturas" on public.asignaturas;
drop policy if exists "Permitir todo en asignaturas" on public.asignaturas;

drop policy if exists "Permitir lectura publica de entregas" on public.entregas;
drop policy if exists "Permitir modificacion de entregas" on public.entregas;
drop policy if exists "Permitir todo en entregas" on public.entregas;

drop policy if exists "Permitir lectura publica de cambios" on public.cambios;
drop policy if exists "Permitir marcar cambios como vistos" on public.cambios;
drop policy if exists "Permitir todo en cambios" on public.cambios;

drop policy if exists "Permitir lectura publica de sync_log" on public.sync_log;
drop policy if exists "Permitir todo en sync_log" on public.sync_log;

-- 5. Crear políticas RLS seguras y funcionales
-- Lectura pública para el frontend (anon y authenticated)
create policy "Permitir lectura publica de asignaturas"
  on public.asignaturas for select
  using (true);

create policy "Permitir edicion de asignaturas"
  on public.asignaturas for all
  using (true)
  with check (true);

create policy "Permitir lectura publica de entregas"
  on public.entregas for select
  using (true);

create policy "Permitir escritura de entregas"
  on public.entregas for all
  using (true)
  with check (true);

create policy "Permitir lectura publica de cambios"
  on public.cambios for select
  using (true);

create policy "Permitir marcar cambios como vistos"
  on public.cambios for all
  using (true)
  with check (true);

create policy "Permitir lectura publica de sync_log"
  on public.sync_log for select
  using (true);

create policy "Permitir insercion en sync_log"
  on public.sync_log for insert
  with check (true);

-- 6. Índices para rendimiento óptimo
create index if not exists idx_entregas_deadline on public.entregas (deadline_utc asc);
create index if not exists idx_entregas_asig on public.entregas (asignatura_codigo);
create index if not exists idx_entregas_estado on public.entregas (estado);
create index if not exists idx_cambios_fecha on public.cambios (fecha desc);
create index if not exists idx_sync_log_fecha on public.sync_log (fecha desc);

-- 7. Carga inicial de asignaturas oficiales
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
