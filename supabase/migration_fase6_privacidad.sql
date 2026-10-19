-- Fase 6: privacidad. Cada cuenta ve solo sus datos.
--  · tasks: fuera las filas sin dueño (user_id NULL) que veía cualquiera, incluido el modo invitado.
--    Las 163 que había eran importaciones del calendario universitario hechas en modo invitado
--    (ids "gcal-…" sin cuenta); la cuenta de Xavier ya tiene las suyas ("gcal-user:<id>:…") y la
--    sync las regenera, así que se borran. Cualquier otra fila sin dueño pasa a Xavier.
--  · entregas, asignaturas, cambios, sync_log (Moodle): pasan a tener user_id. Todo lo existente es
--    del feed de Moodle de Xavier. Solo su cuenta las lee; anon no ve nada.
--  · Las funciones que tocan entregas filtran por el usuario (las security definer saltan RLS).
-- Idempotente y en una transacción. Ejecutar después de migration_fase5_imprevisto.sql.
-- Requisitos: la cuenta de Xavier existe en auth.users. Sin datos personales en este archivo:
-- el dueño se busca por su correo.
begin;

do $$
declare
  v_owner uuid;
  v_tabla text;
  v_pol record;
  v_borradas integer;
  v_asignadas integer;
begin
  select id into v_owner from auth.users where lower(email) = 'xaviervarteniuc@gmail.com';
  if v_owner is null then raise exception 'No existe la cuenta del propietario de Moodle en auth.users'; end if;
  raise notice 'Propietario de Moodle y de las tareas sin dueño: %', v_owner;

  -- 1. tasks ------------------------------------------------------------------------------
  delete from public.tasks where user_id is null and id like 'gcal-%';
  get diagnostics v_borradas = row_count;
  update public.tasks set user_id = v_owner where user_id is null;
  get diagnostics v_asignadas = row_count;
  raise notice 'tasks sin dueño: % importaciones de calendario borradas, % asignadas al propietario', v_borradas, v_asignadas;

  -- 2. Moodle: columna user_id; lo existente es del propietario ----------------------------
  foreach v_tabla in array array['asignaturas', 'entregas', 'cambios', 'sync_log'] loop
    execute format('alter table public.%I add column if not exists user_id uuid references auth.users(id) on delete cascade', v_tabla);
    execute format('update public.%I set user_id = %L where user_id is null', v_tabla, v_owner);
    -- Por defecto, del propietario: la sync del servidor anterior a este cambio sigue funcionando
    -- mientras se despliega el código nuevo (que ya escribe user_id explícitamente).
    execute format('alter table public.%I alter column user_id set default %L::uuid', v_tabla, v_owner);
    execute format('alter table public.%I alter column user_id set not null', v_tabla);
    execute format('create index if not exists %I on public.%I (user_id)', 'idx_' || v_tabla || '_user', v_tabla);
  end loop;

  -- 3. Políticas: se borran todas las existentes (nombres distintos según el histórico) ------
  for v_pol in
    select policyname, tablename from pg_policies
    where schemaname = 'public' and tablename in ('tasks', 'asignaturas', 'entregas', 'cambios', 'sync_log')
  loop
    execute format('drop policy if exists %I on public.%I', v_pol.policyname, v_pol.tablename);
  end loop;
end $$;

alter table public.tasks alter column user_id set default auth.uid();
alter table public.tasks alter column user_id set not null;
create index if not exists idx_tasks_user on public.tasks (user_id);

alter table public.tasks enable row level security;
alter table public.asignaturas enable row level security;
alter table public.entregas enable row level security;
alter table public.cambios enable row level security;
alter table public.sync_log enable row level security;

create policy propietario on public.tasks for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy propietario on public.asignaturas for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy propietario on public.entregas for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy propietario on public.cambios for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy propietario on public.sync_log for select to authenticated
  using (user_id = auth.uid());

-- anon no ve ni escribe nada; la app con sesión solo lo que necesita. El servidor usa service_role.
revoke all on public.tasks, public.asignaturas, public.entregas, public.cambios, public.sync_log from anon, public;
grant select, insert, update, delete on public.tasks to authenticated;
grant select, update on public.asignaturas, public.entregas, public.cambios to authenticated;
grant select on public.sync_log to authenticated;

-- 4. Funciones: entregas filtradas por usuario ----------------------------------------------
-- Instantánea del planificador: solo las entregas del usuario (antes, todas).
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
    where user_id = auth.uid()
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
revoke all on function public.planificador_entregas_snapshot() from public, anon;
grant execute on function public.planificador_entregas_snapshot() to authenticated;

-- Igual que migration_fase5_imprevisto.sql, con user_id = owner_id en cada acceso a entregas.
-- Hace falta aunque la función sea security invoker: asistente_como_usuario (security definer)
-- la ejecuta saltándose RLS.
create or replace function public.mutar_planificador(p_revision text, p_accion text, p_datos jsonb, p_horas_reales numeric default null)
returns text language plpgsql security invoker set search_path = public as $$
declare
  owner_id uuid := auth.uid(); current_revision text; next_revision text := gen_random_uuid()::text;
  b jsonb; d jsonb; ev jsonb; item record; cut timestamp; until_date date;
  baseline jsonb; new_id text; old_id text; max_debt numeric; total_debt numeric; r jsonb; social_start timestamp;
begin
  if owner_id is null then raise exception 'Inicia sesión para guardar horarios privados'; end if;
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text, 0));
  select valor #>> '{}' into current_revision from public.parametros where user_id = owner_id and clave = '_revision';
  if coalesce(current_revision, '') <> p_revision then raise exception 'El plan ha cambiado. Actualiza y vuelve a calcular la vista previa'; end if;

  -- Completar registra únicamente el estado y, opcionalmente, las horas.
  -- No cambia estimaciones, bloques, deuda ni asignaciones.
  if p_accion = 'entrega' and p_datos->>'estado' = 'hecha' then
    if p_datos->>'uid' like 'uni:%' then
      if p_horas_reales is not null then raise exception 'Las horas reales requieren una entrega de Moodle'; end if;
      update public.trabajos_universidad set estado = 'hecha'
        where id = substr(p_datos->>'uid',5) and user_id = owner_id and estado <> 'hecha';
    else
      update public.entregas set estado = 'hecha'
        where uid = p_datos->>'uid' and user_id = owner_id and estado <> 'hecha';
    end if;
    if not found then raise exception 'Entrega no encontrada o ya completada'; end if;
    if p_horas_reales is not null then
      insert into public.task_logs(id,user_id,uid,fecha,horas_reales)
        values(gen_random_uuid()::text,owner_id,p_datos->>'uid',
          (now() at time zone 'Europe/Madrid')::date,p_horas_reales);
    end if;
    insert into public.parametros(user_id,clave,valor) values(owner_id,'_revision',to_jsonb(next_revision))
      on conflict(user_id,clave) do update set valor = excluded.valor;
    -- Mantener válido el plan guardado evita mover sus bloques al recargar.
    -- La revisión avanza para rechazar vistas previas anteriores a la acción.
    update public.parametros set valor = to_jsonb(next_revision)
      where user_id = owner_id and clave = '_plan_revision' and valor #>> '{}' = current_revision;
    update public.parametros set valor = (
      select coalesce(jsonb_agg(case when value->>'uid' = p_datos->>'uid'
        then jsonb_set(value,'{estado}','"hecha"'::jsonb) else value end order by value->>'uid' collate "C"),'[]'::jsonb)
      from jsonb_array_elements(valor)
    ) where user_id = owner_id and clave = '_plan_entregas';
    return next_revision;
  end if;
  if p_horas_reales is not null then raise exception 'Solo se registran horas al completar una entrega'; end if;

  if p_accion in ('plan', 'social') then
    -- Bloquea entregas durante la comprobación y escritura para evitar un cambio
    -- concurrente de la sync o del editor entre ambas operaciones.
    perform uid from public.entregas where user_id = owner_id order by uid for share;
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
      -- The cut may move back to study blocks that collide with the event (they are planned again);
      -- it can never be after the event nor in the past (checked above).
      social_start := ((ev->>'fecha_inicio') || 'T' || (ev->>'inicio_local'))::timestamp;
      if cut > social_start then raise exception 'El corte no puede ser posterior al imprevisto'; end if;
      if cut::date <> social_start::date then raise exception 'El corte debe ser el mismo día del imprevisto'; end if;
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
    -- A block already in progress that the event overlaps is cut short in place (same row, earlier end).
    if p_accion = 'social' then
      for r in select value from jsonb_array_elements(coalesce(p_datos->'recortes', '[]'::jsonb)) loop
        update public.bloques_plan set fin_local = (r->>'fin_local')::time
        where user_id = owner_id and activo
          and (id = r->>'id' or id = owner_id::text || ':' || (r->>'id'))
          and fecha = (r->>'fecha')::date and inicio_local = (r->>'inicio_local')::time
          and fecha = cut::date and fecha + inicio_local < cut
          and (r->>'fin_local')::time > inicio_local and (r->>'fin_local')::time < fin_local;
      end loop;
    end if;
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
    where uid = p_datos->>'uid' and user_id = owner_id and estado = 'pendiente';
    if not found then raise exception 'La entrega ya no está pendiente'; end if;
  elsif p_accion = 'entrega' then
    if (p_datos->>'horas_est')::numeric <= 0 or (p_datos->>'min_viable_min')::integer < 20 then raise exception 'Estimaciones fuera de rango'; end if;
    if p_datos->>'tipo_trabajo' not in ('profundo', 'ligero') then raise exception 'Tipo de trabajo inválido'; end if;
    if p_datos->>'estado' not in ('pendiente', 'hecha', 'descartada') then raise exception 'Estado inválido'; end if;
    update public.entregas set horas_est = (p_datos->>'horas_est')::numeric, min_viable_min = (p_datos->>'min_viable_min')::integer,
      tipo_trabajo = p_datos->>'tipo_trabajo', estado = p_datos->>'estado', tamano_bloque_min = (p_datos->>'tamano_bloque_min')::integer,
      hueco_inicio_local = (p_datos->>'hueco_inicio_local')::timestamp, hueco_fin_local = (p_datos->>'hueco_fin_local')::timestamp
    where uid = p_datos->>'uid' and user_id = owner_id;
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
revoke all on function public.mutar_planificador(text,text,jsonb,numeric) from public, anon;
grant execute on function public.mutar_planificador(text,text,jsonb,numeric) to authenticated;

-- Igual que migration_fase4_asistente.sql, con el filtro de usuario en entregas.
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
    from public.entregas where uid = any(v_uids) and user_id = p_user and estado = 'pendiente'
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
    where uid = any(v_uids) and user_id = p_user and estado = 'pendiente';
  update public.trabajos_universidad set aplazamientos = aplazamientos + 1, plan_no_antes_de = (p_fecha + 1)::timestamp,
    hueco_inicio_local = null, hueco_fin_local = null
    where user_id = p_user and 'uni:' || id = any(v_uids) and estado = 'pendiente';
  insert into public.parametros(user_id, clave, valor) values (p_user, '_revision', to_jsonb(next_revision))
    on conflict (user_id, clave) do update set valor = excluded.valor;
  return next_revision;
end $$;

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
        where uid = p->>'uid' and user_id = owner_id and estado = 'pendiente';
    end if;
  end loop;
  update public.asistente_cierres set estado = 'deshecho' where user_id = owner_id and fecha = p_fecha;
  insert into public.parametros(user_id, clave, valor) values (owner_id, '_revision', to_jsonb(next_revision))
    on conflict (user_id, clave) do update set valor = excluded.valor;
  return next_revision;
end $$;

revoke all on function public.asistente_aplicar_cierre(uuid, date, text[], text) from public, anon, authenticated;
grant execute on function public.asistente_aplicar_cierre(uuid, date, text[], text) to service_role;
revoke all on function public.asistente_deshacer_cierre(date) from public, anon;
grant execute on function public.asistente_deshacer_cierre(date) to authenticated;

notify pgrst, 'reload schema';
commit;

-- Comprobación (opcional, después del commit):
--   select count(*) from public.tasks where user_id is null;              -- 0
--   select tablename, policyname, roles, cmd from pg_policies
--     where tablename in ('tasks','asignaturas','entregas','cambios','sync_log');
