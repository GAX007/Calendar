-- Fase 2: horarios privados, parámetros, planes auditables y deuda social.
-- Ejecutar después de fase 1. No inserta horarios personales ni modifica la sync.
begin;

alter table public.entregas add column if not exists horas_est numeric;
alter table public.entregas add column if not exists min_viable_min integer;
alter table public.entregas add column if not exists tipo_trabajo text not null default 'profundo' check (tipo_trabajo in ('profundo', 'ligero'));
alter table public.entregas add column if not exists aplazamientos integer not null default 0 check (aplazamientos >= 0);
alter table public.entregas add column if not exists factor_calibracion numeric not null default 1.0 check (factor_calibracion > 0);
-- Preferencias de planificación, conservadas por el spread de campos propios de Moodle.
alter table public.entregas add column if not exists plan_no_antes_de timestamp without time zone;
alter table public.entregas add column if not exists tamano_bloque_min integer check (tamano_bloque_min >= 20);
alter table public.entregas add column if not exists hueco_inicio_local timestamp without time zone;
alter table public.entregas add column if not exists hueco_fin_local timestamp without time zone;

create table if not exists public.eventos (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  titulo text not null,
  inicio_local time without time zone not null,
  fin_local time without time zone not null check (fin_local > inicio_local),
  dias_semana integer[] check (dias_semana is null or (cardinality(dias_semana) > 0 and dias_semana <@ array[1,2,3,4,5,6,7])),
  fecha_inicio date not null,
  fecha_fin date check (fecha_fin is null or fecha_fin >= fecha_inicio),
  tipo text not null check (tipo in ('fijo', 'flexible', 'social')),
  bloqueo boolean not null default true,
  area text not null check (area in ('clase', 'trabajo', 'clase_particular', 'karate', 'gym', 'social', 'otro'))
);
create table if not exists public.parametros (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  clave text not null,
  valor jsonb not null,
  primary key (user_id, clave)
);
create table if not exists public.bloques_plan (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  fecha date not null,
  inicio_local time without time zone not null,
  fin_local time without time zone not null check (fin_local > inicio_local),
  task_uid text references public.entregas(uid),
  evento_id text references public.eventos(id) on delete set null,
  version_minima boolean not null default false,
  creado_en timestamptz not null default now(),
  reemplaza_a text references public.bloques_plan(id),
  activo boolean not null default true,
  -- Copia explicativa para conservar el historial tras editar una entrega/evento.
  titulo text not null,
  tipo text not null check (tipo in ('profundo', 'ligero', 'fijo', 'flexible', 'social')),
  estimacion_por_defecto boolean not null default false
);
create table if not exists public.deuda (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  task_uid text not null references public.entregas(uid),
  horas_aplazadas numeric not null check (horas_aplazadas > 0),
  motivo text not null,
  fecha date not null
);
create index if not exists idx_eventos_owner on public.eventos(user_id, fecha_inicio);
create index if not exists idx_plan_owner on public.bloques_plan(user_id, fecha, activo);
create index if not exists idx_deuda_owner on public.deuda(user_id, fecha);

do $$ declare t text; begin
  foreach t in array array['eventos','parametros','bloques_plan','deuda'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists propietario_planificador on public.%I', t);
    execute format('create policy propietario_planificador on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- Orden y representación estables para detectar cambios de Moodle/estimaciones
-- entre la vista previa y la confirmación. No requiere tocar la sync.
create or replace function public.planificador_entregas_snapshot() returns jsonb
language sql stable security invoker set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'uid', uid, 'titulo', titulo, 'deadline_utc', to_char(deadline_utc at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'estado', estado, 'oculta_por_grupo', oculta_por_grupo, 'borrada_en_moodle', borrada_en_moodle,
    'horas_est', horas_est, 'min_viable_min', min_viable_min, 'tipo_trabajo', tipo_trabajo,
    'aplazamientos', aplazamientos, 'factor_calibracion', factor_calibracion,
    'plan_no_antes_de', to_char(plan_no_antes_de, 'YYYY-MM-DD"T"HH24:MI'),
    'tamano_bloque_min', tamano_bloque_min,
    'hueco_inicio_local', to_char(hueco_inicio_local, 'YYYY-MM-DD"T"HH24:MI'),
    'hueco_fin_local', to_char(hueco_fin_local, 'YYYY-MM-DD"T"HH24:MI')
  ) order by uid collate "C"), '[]'::jsonb) from public.entregas;
$$;

-- Un RPC para cada mutación: serializa por usuario, verifica revisión y devuelve
-- una revisión nueva. Guardar un social también archiva y enlaza los bloques.
create or replace function public.mutar_planificador(p_revision text, p_accion text, p_datos jsonb)
returns text language plpgsql security invoker set search_path = public as $$
declare
  owner_id uuid := auth.uid(); current_revision text; next_revision text := gen_random_uuid()::text;
  b jsonb; d jsonb; ev jsonb; item record; cut timestamp; until_date date;
  baseline jsonb; new_id text; old_id text; max_debt numeric; total_debt numeric;
begin
  if owner_id is null then raise exception 'Inicia sesión para guardar horarios privados'; end if;
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text, 0));
  select valor #>> '{}' into current_revision from public.parametros where user_id = owner_id and clave = '_revision';
  if coalesce(current_revision, '') <> p_revision then raise exception 'El plan ha cambiado. Actualiza y vuelve a calcular la vista previa'; end if;

  if p_accion in ('plan', 'social') then
    -- Bloquea entregas durante la comprobación y escritura para evitar un cambio
    -- concurrente de la sync o del editor entre ambas operaciones.
    perform uid from public.entregas order by uid for share;
    if public.planificador_entregas_snapshot() <> p_datos->'entregas_snapshot' then
      raise exception 'Las entregas han cambiado. Actualiza y vuelve a calcular';
    end if;
    cut := (p_datos->>'desde_local')::timestamp;
    until_date := (p_datos->>'hasta')::date;
    if cut < date_trunc('minute', now() at time zone 'Europe/Madrid') then
      raise exception 'La vista previa ha caducado. Actualiza antes de guardar';
    end if;
    if until_date < cut::date then raise exception 'Rango del plan inválido'; end if;

    if p_accion = 'social' then
      ev := p_datos->'evento';
      if ev->>'tipo' <> 'social' or ev->'dias_semana' <> 'null'::jsonb then raise exception 'Se requiere un social puntual'; end if;
      if cut <> ((ev->>'fecha_inicio') || 'T' || (ev->>'inicio_local'))::timestamp then raise exception 'El corte debe coincidir con el social'; end if;
      select coalesce((valor #>> '{}')::numeric, 6) into max_debt from public.parametros where user_id = owner_id and clave = 'max_deuda_horas';
      max_debt := coalesce(max_debt, 6);
      select coalesce(sum(horas_aplazadas), 0) into total_debt from public.deuda where user_id = owner_id;
      total_debt := total_debt + coalesce((select sum((value->>'horas_aplazadas')::numeric) from jsonb_array_elements(p_datos->'nueva_deuda')), 0);
      if total_debt > max_debt and coalesce((p_datos->>'confirmar_deuda')::boolean, false) = false then
        raise exception 'La deuda supera el máximo. Confirma la advertencia antes de guardar';
      end if;
      insert into public.eventos(id, user_id, titulo, inicio_local, fin_local, dias_semana, fecha_inicio, fecha_fin, tipo, bloqueo, area)
      values(ev->>'id', owner_id, ev->>'titulo', (ev->>'inicio_local')::time, (ev->>'fin_local')::time, null,
        (ev->>'fecha_inicio')::date, null, 'social', true, 'social');
    end if;

    -- Persistir el plan base antes de archivarlo permite auditar también la primera
    -- replanificación, aunque el usuario aún no hubiese guardado ese plan semanal.
    baseline := coalesce(p_datos->'plan_base', '[]'::jsonb);
    for b in select value from jsonb_array_elements(baseline) loop
      if not exists(select 1 from public.bloques_plan where id = b->>'id' and user_id = owner_id) then
        new_id := owner_id::text || ':' || (b->>'id');
        if exists(select 1 from public.bloques_plan where id = new_id and user_id = owner_id) then continue; end if;
        insert into public.bloques_plan(id, user_id, fecha, inicio_local, fin_local, task_uid, evento_id, version_minima, titulo, tipo, estimacion_por_defecto)
        values(new_id, owner_id, (b->>'fecha')::date, (b->>'inicio_local')::time, (b->>'fin_local')::time,
          b->>'task_uid', b->>'evento_id', (b->>'version_minima')::boolean, b->>'titulo', b->>'tipo', coalesce((b->>'estimacion_por_defecto')::boolean, false));
      end if;
    end loop;
    update public.bloques_plan set activo = false
    where user_id = owner_id and activo and fecha + inicio_local >= cut and fecha <= until_date;
    for b in select value from jsonb_array_elements(p_datos->'bloques') loop
      if (b->>'fecha')::date + (b->>'inicio_local')::time < cut then continue; end if;
      if (b->>'fecha')::date > until_date then raise exception 'Bloque fuera de la semana'; end if;
      new_id := gen_random_uuid()::text;
      old_id := b->>'reemplaza_a';
      if old_id is null then
        select id into old_id from public.bloques_plan where user_id = owner_id and not activo
          and fecha + inicio_local >= cut and fecha <= until_date
          and ((task_uid is not null and task_uid = b->>'task_uid') or (evento_id is not null and evento_id = b->>'evento_id'))
          order by creado_en desc, fecha, inicio_local limit 1;
      end if;
      if old_id is not null and not exists(select 1 from public.bloques_plan where id = old_id and user_id = owner_id) then
        old_id := owner_id::text || ':' || old_id;
        if not exists(select 1 from public.bloques_plan where id = old_id and user_id = owner_id) then old_id := null; end if;
      end if;
      insert into public.bloques_plan(id, user_id, fecha, inicio_local, fin_local, task_uid, evento_id, version_minima, reemplaza_a, titulo, tipo, estimacion_por_defecto)
      values(new_id, owner_id, (b->>'fecha')::date, (b->>'inicio_local')::time, (b->>'fin_local')::time,
        b->>'task_uid', b->>'evento_id', (b->>'version_minima')::boolean, old_id, b->>'titulo', b->>'tipo', coalesce((b->>'estimacion_por_defecto')::boolean, false));
    end loop;
    if p_accion = 'social' then
      for d in select value from jsonb_array_elements(p_datos->'nueva_deuda') loop
        if d->>'motivo' <> 'plan_social' then raise exception 'Motivo de deuda inválido'; end if;
        insert into public.deuda(id, user_id, task_uid, horas_aplazadas, motivo, fecha)
        values(gen_random_uuid()::text, owner_id, d->>'task_uid', (d->>'horas_aplazadas')::numeric, 'plan_social', (d->>'fecha')::date);
      end loop;
    end if;
  elsif p_accion = 'evento' then
    ev := p_datos;
    if ev->>'tipo' = 'social' then raise exception 'Usa la vista previa para añadir un social'; end if;
    insert into public.eventos(id, user_id, titulo, inicio_local, fin_local, dias_semana, fecha_inicio, fecha_fin, tipo, bloqueo, area)
    values(ev->>'id', owner_id, ev->>'titulo', (ev->>'inicio_local')::time, (ev->>'fin_local')::time,
      case when ev->'dias_semana' = 'null'::jsonb then null else array(select value::integer from jsonb_array_elements_text(ev->'dias_semana')) end,
      (ev->>'fecha_inicio')::date, (ev->>'fecha_fin')::date, ev->>'tipo', (ev->>'bloqueo')::boolean, ev->>'area')
    on conflict(id) do update set titulo = excluded.titulo, inicio_local = excluded.inicio_local, fin_local = excluded.fin_local,
      dias_semana = excluded.dias_semana, fecha_inicio = excluded.fecha_inicio, fecha_fin = excluded.fecha_fin, tipo = excluded.tipo, bloqueo = excluded.bloqueo, area = excluded.area;
  elsif p_accion = 'eliminar_evento' then
    delete from public.eventos where user_id = owner_id and id = p_datos->>'id';
  elsif p_accion = 'parametros' then
    for item in select * from jsonb_each(p_datos) loop
      if item.key not in ('hora_inicio_dia','hora_fin_dia','margen_min','max_horas_profundas_dia','franja_profunda_inicio','franja_profunda_fin','max_deuda_horas','factor_calibracion_default') then raise exception 'Parámetro desconocido'; end if;
      insert into public.parametros(user_id, clave, valor) values(owner_id, item.key, item.value)
      on conflict(user_id, clave) do update set valor = excluded.valor;
    end loop;
  elsif p_accion in ('aplazar', 'no_completada') then
    update public.entregas set aplazamientos = aplazamientos + 1,
      plan_no_antes_de = ((now() at time zone 'Europe/Madrid')::date + 1)::timestamp,
      hueco_inicio_local = null, hueco_fin_local = null
    where uid = p_datos->>'uid' and estado = 'pendiente';
    if not found then raise exception 'La entrega ya no está pendiente'; end if;
  elsif p_accion = 'entrega' then
    if (p_datos->>'horas_est')::numeric <= 0 or (p_datos->>'min_viable_min')::integer < 20 then raise exception 'Estimaciones fuera de rango'; end if;
    if p_datos->>'tipo_trabajo' not in ('profundo', 'ligero') then raise exception 'Tipo de trabajo inválido'; end if;
    if p_datos->>'estado' not in ('pendiente', 'hecha', 'descartada') then raise exception 'Estado inválido'; end if;
    update public.entregas set horas_est = (p_datos->>'horas_est')::numeric, min_viable_min = (p_datos->>'min_viable_min')::integer,
      tipo_trabajo = p_datos->>'tipo_trabajo', estado = p_datos->>'estado', tamano_bloque_min = (p_datos->>'tamano_bloque_min')::integer,
      hueco_inicio_local = (p_datos->>'hueco_inicio_local')::timestamp, hueco_fin_local = (p_datos->>'hueco_fin_local')::timestamp
    where uid = p_datos->>'uid';
    if not found then raise exception 'Entrega no encontrada'; end if;
  else raise exception 'Acción desconocida'; end if;

  insert into public.parametros(user_id, clave, valor) values(owner_id, '_revision', to_jsonb(next_revision))
    on conflict(user_id, clave) do update set valor = excluded.valor;
  if p_accion in ('plan', 'social') then
    insert into public.parametros(user_id, clave, valor) values(owner_id, '_plan_revision', to_jsonb(next_revision))
      on conflict(user_id, clave) do update set valor = excluded.valor;
    insert into public.parametros(user_id, clave, valor) values(owner_id, '_plan_entregas', p_datos->'entregas_snapshot')
      on conflict(user_id, clave) do update set valor = excluded.valor;
  end if;
  return next_revision;
end $$;
revoke all on function public.planificador_entregas_snapshot() from public, anon;
revoke all on function public.mutar_planificador(text, text, jsonb) from public, anon;
grant execute on function public.planificador_entregas_snapshot() to authenticated;
grant execute on function public.mutar_planificador(text, text, jsonb) to authenticated;
commit;
