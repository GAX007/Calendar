-- Deberes y exámenes privados enlazados al plan, sin modificar la sync de Moodle.
-- Aplicar después de migration_fase2_planificador.sql.
begin;
create table if not exists public.trabajos_universidad (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  datos jsonb not null,
  asignatura jsonb not null,
  deadline_local timestamp without time zone not null,
  horas_est numeric not null check (horas_est > 0 and horas_est <= 500),
  estado text not null default 'pendiente' check (estado in ('pendiente','hecha','descartada')),
  activo boolean not null default true,
  aplazamientos integer not null default 0 check (aplazamientos >= 0),
  plan_no_antes_de timestamp without time zone,
  min_viable_min integer check (min_viable_min >= 20),
  tamano_bloque_min integer check (tamano_bloque_min >= 20),
  hueco_inicio_local timestamp without time zone,
  hueco_fin_local timestamp without time zone
);
alter table public.trabajos_universidad enable row level security;
drop policy if exists propietario_universidad on public.trabajos_universidad;
create policy propietario_universidad on public.trabajos_universidad for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.trabajos_universidad from public, anon;
grant select, insert, update on public.trabajos_universidad to authenticated;
create index if not exists idx_trabajos_universidad_owner on public.trabajos_universidad(user_id, deadline_local);
alter table public.bloques_plan add column if not exists trabajo_id text references public.trabajos_universidad(id);
alter table public.deuda add column if not exists trabajo_id text references public.trabajos_universidad(id);
alter table public.deuda alter column task_uid drop not null;
do $$ begin
  if not exists(select 1 from pg_constraint where conrelid = 'public.bloques_plan'::regclass and conname = 'plan_un_solo_origen') then
    alter table public.bloques_plan add constraint plan_un_solo_origen check (num_nonnulls(task_uid, trabajo_id, evento_id) <= 1);
  end if;
  if not exists(select 1 from pg_constraint where conrelid = 'public.deuda'::regclass and conname = 'deuda_un_solo_origen') then
    alter table public.deuda add constraint deuda_un_solo_origen check (num_nonnulls(task_uid, trabajo_id) = 1);
  end if;
end $$;

create or replace function public.guardar_trabajo_universidad(p_trabajo jsonb, p_asignatura jsonb, p_eliminar boolean default false)
returns text language plpgsql security invoker set search_path = public as $$
declare owner_id uuid := auth.uid(); next_revision text := gen_random_uuid()::text; work_id text := p_trabajo->>'id';
begin
  if owner_id is null then raise exception 'Inicia sesión para guardar deberes y exámenes'; end if;
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text, 0));
  if p_eliminar then
    update public.trabajos_universidad set activo = false where id = work_id and user_id = owner_id;
    if not found then raise exception 'Trabajo no encontrado'; end if;
  else
    if coalesce(length(trim(p_trabajo->>'title')),0) = 0 or length(p_trabajo->>'title') > 500
      or coalesce(p_trabajo->>'type','') not in ('practica','ejercicios','proyecto','examen','lectura','otro')
      or coalesce(p_trabajo->>'status','') not in ('pendiente','en_progreso','entregado')
      or coalesce(p_asignatura->>'id','') = '' or p_trabajo->>'subjectId' is distinct from p_asignatura->>'id'
      or coalesce(work_id,'') = '' then raise exception 'Datos del trabajo inválidos'; end if;
    insert into public.trabajos_universidad(id,user_id,datos,asignatura,deadline_local,horas_est,estado)
    values(work_id,owner_id,p_trabajo,p_asignatura,
      ((p_trabajo->>'dueDate') || 'T' || coalesce(nullif(p_trabajo->>'dueTime',''),'23:59'))::timestamp,
      coalesce((p_trabajo->>'estimatedHours')::numeric,2),
      case when p_trabajo->>'status' = 'entregado' then 'hecha' else 'pendiente' end)
    on conflict(id) do update set datos = excluded.datos, asignatura = excluded.asignatura,
      deadline_local = excluded.deadline_local, horas_est = excluded.horas_est, estado = excluded.estado;
  end if;
  insert into public.parametros(user_id,clave,valor) values(owner_id,'_revision',to_jsonb(next_revision))
    on conflict(user_id,clave) do update set valor = excluded.valor;
  return next_revision;
end $$;
revoke all on function public.guardar_trabajo_universidad(jsonb,jsonb,boolean) from public,anon;
grant execute on function public.guardar_trabajo_universidad(jsonb,jsonb,boolean) to authenticated;

-- Una instantánea ordenada incluye ambos orígenes y detecta cambios concurrentes.
create or replace function public.planificador_entregas_snapshot() returns jsonb
language sql stable security invoker set search_path = public as $$
  select coalesce(jsonb_agg(entry order by uid collate "C"),'[]'::jsonb) from (
    select uid, jsonb_build_object(
      'uid',uid,'titulo',titulo,'deadline_utc',to_char(deadline_utc at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'estado',estado,'oculta_por_grupo',oculta_por_grupo,'borrada_en_moodle',borrada_en_moodle,
      'horas_est',horas_est,'min_viable_min',min_viable_min,'tipo_trabajo',tipo_trabajo,
      'aplazamientos',aplazamientos,'factor_calibracion',factor_calibracion,
      'plan_no_antes_de',to_char(plan_no_antes_de,'YYYY-MM-DD"T"HH24:MI'),
      'tamano_bloque_min',tamano_bloque_min,'hueco_inicio_local',to_char(hueco_inicio_local,'YYYY-MM-DD"T"HH24:MI'),
      'hueco_fin_local',to_char(hueco_fin_local,'YYYY-MM-DD"T"HH24:MI')) as entry from public.entregas
    union all
    select 'uni:' || id, jsonb_build_object(
      'uid','uni:' || id,'titulo','[' || (asignatura->>'code') || '] ' || (datos->>'title'),
      'deadline_utc',to_char((deadline_local at time zone 'Europe/Madrid') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'estado',estado,'oculta_por_grupo',false,'borrada_en_moodle',not activo,
      'horas_est',horas_est,'min_viable_min',min_viable_min,
      'tipo_trabajo',case when datos->>'type' = 'lectura' then 'ligero' else 'profundo' end,
      'aplazamientos',aplazamientos,'factor_calibracion',1,
      'plan_no_antes_de',to_char(plan_no_antes_de,'YYYY-MM-DD"T"HH24:MI'),
      'tamano_bloque_min',tamano_bloque_min,'hueco_inicio_local',to_char(hueco_inicio_local,'YYYY-MM-DD"T"HH24:MI'),
      'hueco_fin_local',to_char(hueco_fin_local,'YYYY-MM-DD"T"HH24:MI'))
      || case when datos->>'type' = 'examen' then '{"es_examen":true}'::jsonb else '{}'::jsonb end
    from public.trabajos_universidad where user_id = auth.uid()
  ) snapshots;
$$;
-- RPC del planificador extendido debajo: conserva revisión, historial y deuda.

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
    perform id from public.trabajos_universidad where user_id = owner_id order by id for share;
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
      if b->>'task_uid' like 'uni:%' and not exists(select 1 from public.trabajos_universidad where id = substr(b->>'task_uid',5) and user_id = owner_id) then raise exception 'Trabajo privado no encontrado'; end if;
      if not exists(select 1 from public.bloques_plan where id = b->>'id' and user_id = owner_id) then
        new_id := owner_id::text || ':' || (b->>'id');
        if exists(select 1 from public.bloques_plan where id = new_id and user_id = owner_id) then continue; end if;
        insert into public.bloques_plan(id, user_id, fecha, inicio_local, fin_local, task_uid, trabajo_id, evento_id, version_minima, titulo, tipo, estimacion_por_defecto)
        values(new_id, owner_id, (b->>'fecha')::date, (b->>'inicio_local')::time, (b->>'fin_local')::time,
          case when b->>'task_uid' like 'uni:%' then null else b->>'task_uid' end,
          case when b->>'task_uid' like 'uni:%' then substr(b->>'task_uid',5) else null end, b->>'evento_id', (b->>'version_minima')::boolean, b->>'titulo', b->>'tipo', coalesce((b->>'estimacion_por_defecto')::boolean, false));
      end if;
    end loop;
    update public.bloques_plan set activo = false
    where user_id = owner_id and activo and fecha + inicio_local >= cut and fecha <= until_date;
    for b in select value from jsonb_array_elements(p_datos->'bloques') loop
      if b->>'task_uid' like 'uni:%' and not exists(select 1 from public.trabajos_universidad where id = substr(b->>'task_uid',5) and user_id = owner_id) then raise exception 'Trabajo privado no encontrado'; end if;
      if (b->>'fecha')::date + (b->>'inicio_local')::time < cut then continue; end if;
      if (b->>'fecha')::date > until_date then raise exception 'Bloque fuera de la semana'; end if;
      new_id := gen_random_uuid()::text;
      old_id := b->>'reemplaza_a';
      if old_id is null then
        select id into old_id from public.bloques_plan where user_id = owner_id and not activo
          and fecha + inicio_local >= cut and fecha <= until_date
          and (((task_uid is not null or trabajo_id is not null) and coalesce(task_uid,'uni:' || trabajo_id) = b->>'task_uid') or (evento_id is not null and evento_id = b->>'evento_id'))
          order by creado_en desc, fecha, inicio_local limit 1;
      end if;
      if old_id is not null and not exists(select 1 from public.bloques_plan where id = old_id and user_id = owner_id) then
        old_id := owner_id::text || ':' || old_id;
        if not exists(select 1 from public.bloques_plan where id = old_id and user_id = owner_id) then old_id := null; end if;
      end if;
      insert into public.bloques_plan(id, user_id, fecha, inicio_local, fin_local, task_uid, trabajo_id, evento_id, version_minima, reemplaza_a, titulo, tipo, estimacion_por_defecto)
      values(new_id, owner_id, (b->>'fecha')::date, (b->>'inicio_local')::time, (b->>'fin_local')::time,
        case when b->>'task_uid' like 'uni:%' then null else b->>'task_uid' end,
          case when b->>'task_uid' like 'uni:%' then substr(b->>'task_uid',5) else null end, b->>'evento_id', (b->>'version_minima')::boolean, old_id, b->>'titulo', b->>'tipo', coalesce((b->>'estimacion_por_defecto')::boolean, false));
    end loop;
    if p_accion = 'social' then
      for d in select value from jsonb_array_elements(p_datos->'nueva_deuda') loop
        if d->>'task_uid' like 'uni:%' and not exists(select 1 from public.trabajos_universidad where id = substr(d->>'task_uid',5) and user_id = owner_id) then raise exception 'Trabajo privado no encontrado'; end if;
        if d->>'motivo' <> 'plan_social' then raise exception 'Motivo de deuda inválido'; end if;
        insert into public.deuda(id, user_id, task_uid, trabajo_id, horas_aplazadas, motivo, fecha)
        values(gen_random_uuid()::text, owner_id, case when d->>'task_uid' like 'uni:%' then null else d->>'task_uid' end,
          case when d->>'task_uid' like 'uni:%' then substr(d->>'task_uid',5) else null end, (d->>'horas_aplazadas')::numeric, 'plan_social', (d->>'fecha')::date);
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
  elsif p_accion in ('entrega','aplazar','no_completada') and p_datos->>'uid' like 'uni:%' then
    if p_accion in ('aplazar','no_completada') then
      update public.trabajos_universidad set aplazamientos = aplazamientos + 1,
        plan_no_antes_de = ((now() at time zone 'Europe/Madrid')::date + 1)::timestamp,
        hueco_inicio_local = null, hueco_fin_local = null
      where id = substr(p_datos->>'uid',5) and user_id = owner_id and estado = 'pendiente';
    else
      if (p_datos->>'horas_est')::numeric <= 0 or (p_datos->>'min_viable_min')::integer < 20
        or coalesce(p_datos->>'estado','') not in ('pendiente','hecha','descartada') then raise exception 'Preferencias inválidas'; end if;
      update public.trabajos_universidad set horas_est = (p_datos->>'horas_est')::numeric,
        min_viable_min = (p_datos->>'min_viable_min')::integer, estado = p_datos->>'estado',
        tamano_bloque_min = (p_datos->>'tamano_bloque_min')::integer,
        hueco_inicio_local = (p_datos->>'hueco_inicio_local')::timestamp,
        hueco_fin_local = (p_datos->>'hueco_fin_local')::timestamp
      where id = substr(p_datos->>'uid',5) and user_id = owner_id;
    end if;
    if not found then raise exception 'Trabajo privado no encontrado o completado'; end if;
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
