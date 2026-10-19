-- Fase 8: atajo de iPhone (botón de la pantalla de bloqueo) para hablar con el asistente sin abrir la app.
--  · asistente_tokens: tokens personales del atajo. Solo se guarda su SHA-256 (el token se enseña una vez),
--    con su dueño; se pueden revocar. Solo el servidor (service_role) los lee y escribe.
--  · asistente_conversaciones: los últimos turnos de cada conversación del atajo, la acción pendiente de un
--    «sí» y lo último que se puede deshacer. Caducan a los 15 minutos (lo decide el servidor).
--  · asistente_guardar_trabajo: el servidor guarda deberes de Universidad como el usuario, con las mismas
--    comprobaciones de guardar_trabajo_universidad (igual que asistente_como_usuario con mutar_planificador).
-- Idempotente y en una transacción. Ejecutar después de migration_fase7_moodle_filtros.sql. Sin datos personales.
begin;

create table if not exists public.asistente_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  hash text not null unique check (length(hash) = 64),
  nombre text not null default 'Atajo de iPhone',
  creado_en timestamptz not null default now(),
  ultimo_uso timestamptz,
  revocado_en timestamptz
);
create index if not exists idx_asistente_tokens_user on public.asistente_tokens(user_id);

create table if not exists public.asistente_conversaciones (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  historial jsonb not null default '[]'::jsonb,
  pendiente jsonb,
  deshacer jsonb,
  actualizado_en timestamptz not null default now()
);
create index if not exists idx_asistente_conversaciones_user on public.asistente_conversaciones(user_id, actualizado_en desc);

-- Sin políticas: con RLS activa, anon y authenticated no ven nada; el servidor usa service_role.
alter table public.asistente_tokens enable row level security;
alter table public.asistente_conversaciones enable row level security;
revoke all on public.asistente_tokens, public.asistente_conversaciones from public, anon, authenticated;
grant all on public.asistente_tokens, public.asistente_conversaciones to service_role;

create or replace function public.asistente_guardar_trabajo(p_user uuid, p_trabajo jsonb, p_asignatura jsonb, p_eliminar boolean default false)
returns text language plpgsql security definer set search_path = public as $$
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  return public.guardar_trabajo_universidad(p_trabajo, p_asignatura, p_eliminar);
end $$;
revoke all on function public.asistente_guardar_trabajo(uuid, jsonb, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.asistente_guardar_trabajo(uuid, jsonb, jsonb, boolean) to service_role;

notify pgrst, 'reload schema';
commit;
