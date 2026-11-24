-- Fase 11: rutinas de gym en la nube, para editarlas desde Claude (conector MCP en /api/mcp).
-- Una fila por rutina con el mismo formato que src/types.ts GymRoutine (columna datos).
-- La app de iOS las lee con la sesión del usuario; el conector las escribe con la service role.

create table if not exists public.rutinas_gym (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  orden integer not null default 0,
  datos jsonb not null,
  actualizado_en timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists rutinas_gym_orden_idx on public.rutinas_gym (user_id, orden);

alter table public.rutinas_gym enable row level security;
revoke all on public.rutinas_gym from anon;
grant select, insert, update, delete on public.rutinas_gym to authenticated;

drop policy if exists rutinas_gym_propias on public.rutinas_gym;
create policy rutinas_gym_propias on public.rutinas_gym
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Tiempo real: la app se actualiza sola cuando Claude cambia una rutina
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.rutinas_gym;
  end if;
exception when duplicate_object then null;
end $$;
