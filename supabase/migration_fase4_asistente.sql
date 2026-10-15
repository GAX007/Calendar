-- Fase 4: asistente nocturno (cierre del día, parte de la mañana, repaso semanal,
-- avisos push, estimación con IA y día ligero tras el check-in).
-- Ejecutar después de migration_fase3_registros.sql.
begin;

-- Estimación propuesta por Gemini. horas_est sigue siendo la que usa el plan;
-- horas_ia permite saber si la estimación actual sigue siendo la de la IA.
alter table public.entregas add column if not exists horas_ia numeric;
alter table public.entregas add column if not exists estimacion_ia_nota text;
alter table public.entregas add column if not exists estimado_ia_en timestamptz;

-- null: aún no se ha preguntado; true: aceptó aligerar el día; false: lo rechazó.
alter table public.checkins add column if not exists plan_ligero boolean;

-- "Hecho" / "No lo hice" por bloque de estudio.
create table if not exists public.asistente_bloques_estado (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  bloque_id text not null,
  fecha date not null,
  estado text not null check (estado in ('hecho', 'no_hecho')),
  actualizado_en timestamptz not null default now(),
  primary key (user_id, bloque_id)
);
create index if not exists idx_asistente_bloques_estado_fecha on public.asistente_bloques_estado(user_id, fecha);

-- Bloques que el cierre nocturno ha quitado del historial y estado previo de
-- cada entrega, para poder deshacerlo por la mañana.
create table if not exists public.asistente_cierres (
  user_id uuid not null references auth.users(id) on delete cascade,
  fecha date not null,
  items jsonb not null default '[]'::jsonb,
  previos jsonb not null default '[]'::jsonb,
  estado text not null default 'aplicado' check (estado in ('aplicado', 'deshecho')),
  creado_en timestamptz not null default now(),
  primary key (user_id, fecha)
);

-- Parte de la mañana y repaso semanal ya calculados.
create table if not exists public.asistente_resumenes (
  user_id uuid not null references auth.users(id) on delete cascade,
  fecha date not null,
  tipo text not null check (tipo in ('manana', 'semanal')),
  datos jsonb not null,
  creado_en timestamptz not null default now(),
  primary key (user_id, fecha, tipo)
);

-- Avisos generados: la clave única evita repetir el mismo aviso.
create table if not exists public.asistente_avisos (
  user_id uuid not null references auth.users(id) on delete cascade,
  clave text not null,
  tipo text not null,
  titulo text not null,
  cuerpo text not null,
  url text not null default '/',
  leido boolean not null default false,
  creado_en timestamptz not null default now(),
  primary key (user_id, clave)
);
create index if not exists idx_asistente_avisos_pendientes on public.asistente_avisos(user_id, leido, creado_en desc);

create table if not exists public.push_suscripciones (
  endpoint text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  creado_en timestamptz not null default now()
);

alter table public.asistente_bloques_estado enable row level security;
alter table public.asistente_cierres enable row level security;
alter table public.asistente_resumenes enable row level security;
alter table public.asistente_avisos enable row level security;
alter table public.push_suscripciones enable row level security;
drop policy if exists propietario on public.asistente_bloques_estado;
create policy propietario on public.asistente_bloques_estado for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists propietario_lectura on public.asistente_cierres;
create policy propietario_lectura on public.asistente_cierres for select to authenticated using (user_id = auth.uid());
drop policy if exists propietario_lectura on public.asistente_resumenes;
create policy propietario_lectura on public.asistente_resumenes for select to authenticated using (user_id = auth.uid());
drop policy if exists propietario on public.asistente_avisos;
create policy propietario on public.asistente_avisos for select to authenticated using (user_id = auth.uid());
drop policy if exists propietario_marcar on public.asistente_avisos;
create policy propietario_marcar on public.asistente_avisos for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists propietario on public.push_suscripciones;
create policy propietario on public.push_suscripciones for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.asistente_bloques_estado, public.asistente_cierres, public.asistente_resumenes,
  public.asistente_avisos, public.push_suscripciones from public, anon, authenticated;
grant select, insert, update, delete on public.asistente_bloques_estado, public.push_suscripciones to authenticated;
grant select on public.asistente_cierres, public.asistente_resumenes to authenticated;
grant select, update (leido) on public.asistente_avisos to authenticated;

-- El servidor (clave service_role) actúa como el usuario reutilizando
-- mutar_planificador y todas sus comprobaciones de revisión y snapshot.
create or replace function public.asistente_como_usuario(p_user uuid, p_revision text, p_accion text, p_datos jsonb)
returns text language plpgsql security definer set search_path = public as $$
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  return public.mutar_planificador(p_revision, p_accion, p_datos);
end $$;

-- Cierre del día: quita del historial los bloques no hechos (para que el plan
-- vuelva a contar esas horas como pendientes) y aplaza sus entregas a mañana.
create or replace function public.asistente_aplicar_cierre(p_user uuid, p_fecha date, p_bloques text[], p_revision text)
returns text language plpgsql security definer set search_path = public as $$
declare
  current_revision text; next_revision text := gen_random_uuid()::text;
  v_items jsonb; v_previos jsonb; v_uids text[];
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 0));
  if exists(select 1 from public.asistente_cierres where user_id = p_user and fecha = p_fecha) then
    raise exception 'El cierre de este día ya está hecho';
  end if;
  select valor #>> '{}' into current_revision from public.parametros where user_id = p_user and clave = '_revision';
  if coalesce(current_revision, '') <> coalesce(p_revision, '') then raise exception 'El plan ha cambiado durante el cierre'; end if;

  select coalesce(jsonb_agg(jsonb_build_object('bloque_id', id, 'task_uid', coalesce(task_uid, 'uni:' || trabajo_id),
      'titulo', titulo, 'inicio_local', to_char(inicio_local, 'HH24:MI'), 'fin_local', to_char(fin_local, 'HH24:MI')) order by inicio_local), '[]'::jsonb),
    coalesce(array_agg(distinct coalesce(task_uid, 'uni:' || trabajo_id)), '{}')
  into v_items, v_uids
  from public.bloques_plan
  where user_id = p_user and activo and fecha = p_fecha and id = any(p_bloques)
    and (task_uid is not null or trabajo_id is not null);

  select coalesce(jsonb_agg(p), '[]'::jsonb) into v_previos from (
    select jsonb_build_object('uid', uid, 'aplazamientos', aplazamientos, 'plan_no_antes_de', plan_no_antes_de,
      'hueco_inicio_local', hueco_inicio_local, 'hueco_fin_local', hueco_fin_local) as p
    from public.entregas where uid = any(v_uids) and estado = 'pendiente'
    union all
    select jsonb_build_object('uid', 'uni:' || id, 'aplazamientos', aplazamientos, 'plan_no_antes_de', plan_no_antes_de,
      'hueco_inicio_local', hueco_inicio_local, 'hueco_fin_local', hueco_fin_local)
    from public.trabajos_universidad where user_id = p_user and 'uni:' || id = any(v_uids) and estado = 'pendiente'
  ) previos;

  insert into public.asistente_cierres(user_id, fecha, items, previos) values (p_user, p_fecha, v_items, v_previos);
  if jsonb_array_length(v_items) = 0 then return current_revision; end if;

  update public.bloques_plan set activo = false
    where user_id = p_user and activo and fecha = p_fecha and id = any(p_bloques);
  update public.entregas set aplazamientos = aplazamientos + 1, plan_no_antes_de = (p_fecha + 1)::timestamp,
    hueco_inicio_local = null, hueco_fin_local = null
    where uid = any(v_uids) and estado = 'pendiente';
  update public.trabajos_universidad set aplazamientos = aplazamientos + 1, plan_no_antes_de = (p_fecha + 1)::timestamp,
    hueco_inicio_local = null, hueco_fin_local = null
    where user_id = p_user and 'uni:' || id = any(v_uids) and estado = 'pendiente';
  insert into public.parametros(user_id, clave, valor) values (p_user, '_revision', to_jsonb(next_revision))
    on conflict (user_id, clave) do update set valor = excluded.valor;
  return next_revision;
end $$;

-- Deshacer el cierre desde la app: reactiva los bloques y restaura las entregas.
create or replace function public.asistente_deshacer_cierre(p_fecha date)
returns text language plpgsql security definer set search_path = public as $$
declare
  owner_id uuid := auth.uid(); next_revision text := gen_random_uuid()::text; c record; p jsonb;
begin
  if owner_id is null then raise exception 'Inicia sesión para deshacer el cierre'; end if;
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text, 0));
  select * into c from public.asistente_cierres where user_id = owner_id and fecha = p_fecha for update;
  if not found or c.estado <> 'aplicado' then raise exception 'No hay ningún cierre que deshacer'; end if;
  update public.bloques_plan set activo = true
    where user_id = owner_id and id in (select value->>'bloque_id' from jsonb_array_elements(c.items));
  for p in select value from jsonb_array_elements(c.previos) loop
    if p->>'uid' like 'uni:%' then
      update public.trabajos_universidad set aplazamientos = (p->>'aplazamientos')::integer,
        plan_no_antes_de = (p->>'plan_no_antes_de')::timestamp,
        hueco_inicio_local = (p->>'hueco_inicio_local')::timestamp, hueco_fin_local = (p->>'hueco_fin_local')::timestamp
        where user_id = owner_id and id = substr(p->>'uid', 5) and estado = 'pendiente';
    else
      update public.entregas set aplazamientos = (p->>'aplazamientos')::integer,
        plan_no_antes_de = (p->>'plan_no_antes_de')::timestamp,
        hueco_inicio_local = (p->>'hueco_inicio_local')::timestamp, hueco_fin_local = (p->>'hueco_fin_local')::timestamp
        where uid = p->>'uid' and estado = 'pendiente';
    end if;
  end loop;
  update public.asistente_cierres set estado = 'deshecho' where user_id = owner_id and fecha = p_fecha;
  insert into public.parametros(user_id, clave, valor) values (owner_id, '_revision', to_jsonb(next_revision))
    on conflict (user_id, clave) do update set valor = excluded.valor;
  return next_revision;
end $$;

revoke all on function public.asistente_como_usuario(uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.asistente_aplicar_cierre(uuid, date, text[], text) from public, anon, authenticated;
grant execute on function public.asistente_como_usuario(uuid, text, text, jsonb) to service_role;
grant execute on function public.asistente_aplicar_cierre(uuid, date, text[], text) to service_role;
revoke all on function public.asistente_deshacer_cierre(date) from public, anon;
grant execute on function public.asistente_deshacer_cierre(date) to authenticated;
notify pgrst, 'reload schema';
commit;
