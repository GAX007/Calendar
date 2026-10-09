-- Fase 3 limitada: registros opcionales y check-in; sin calibración.
-- Ejecutar después de migration_universidad_planificador.sql.
begin;

create table if not exists public.task_logs (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  uid text not null references public.entregas(uid),
  fecha date not null,
  horas_reales numeric not null check (horas_reales > 0 and horas_reales <= 24),
  creado_en timestamptz not null default now()
);
create index if not exists idx_task_logs_user_uid on public.task_logs(user_id, uid);

create table if not exists public.checkins (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  fecha date not null,
  energia integer not null check (energia between 1 and 5),
  sueno_h numeric not null check (sueno_h between 0 and 16),
  fatiga integer not null check (fatiga between 1 and 5),
  nota text,
  primary key (user_id, fecha)
);

alter table public.task_logs enable row level security;
drop policy if exists propietario_task_logs on public.task_logs;
create policy propietario_task_logs on public.task_logs for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
alter table public.checkins enable row level security;
drop policy if exists propietario_checkins on public.checkins;
create policy propietario_checkins on public.checkins for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.task_logs, public.checkins from public, anon;
grant select, insert, update, delete on public.task_logs, public.checkins to authenticated;

-- El cuarto parámetro tiene default null: las llamadas actuales de tres
-- argumentos siguen resolviéndose sin una sobrecarga ambigua en PostgREST.
-- No se usa CASCADE: si hay dependencias externas se detiene la migración.
drop function if exists public.mutar_planificador(text,text,jsonb);

create or replace function public.mutar_planificador(p_revision text, p_accion text, p_datos jsonb, p_horas_reales numeric default null)
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

  -- Completar registra únicamente el estado y, opcionalmente, las horas.
  -- No cambia estimaciones, bloques, deuda ni asignaciones.
  if p_accion = 'entrega' and p_datos->>'estado' = 'hecha' then
    if p_datos->>'uid' like 'uni:%' then
      if p_horas_reales is not null then raise exception 'Las horas reales requieren una entrega de Moodle'; end if;
      update public.trabajos_universidad set estado = 'hecha'
        where id = substr(p_datos->>'uid',5) and user_id = owner_id and estado <> 'hecha';
    else
      update public.entregas set estado = 'hecha'
        where uid = p_datos->>'uid' and estado <> 'hecha';
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
revoke all on function public.mutar_planificador(text,text,jsonb,numeric) from public, anon;
grant execute on function public.mutar_planificador(text,text,jsonb,numeric) to authenticated;
notify pgrst, 'reload schema';
commit;
