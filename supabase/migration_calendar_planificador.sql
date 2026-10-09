-- Aplicar después de migration_fase2_planificador.sql. Sin datos personales.
begin;
alter table public.eventos add column if not exists activo boolean not null default true;

-- Solo lee el Calendar ya sincronizado del usuario autenticado. Los IDs son
-- compatibles con los fijos importados anteriormente; nunca modifica karate.
create or replace function public.sincronizar_fijos_calendar() returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  owner_id uuid := auth.uid();
  cut timestamp := date_trunc('minute', now() at time zone 'Europe/Madrid');
  margin_minutes integer; day_start time; day_end time;
  before_busy tsmultirange; after_busy tsmultirange;
  updated_count integer; cancelled_count integer;
  current_revision text; saved_revision text; next_revision text;
begin
  if owner_id is null then raise exception 'Inicia sesión para sincronizar los horarios privados'; end if;
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text, 0));
  perform id from public.tasks where user_id = owner_id order by id for share;
  if exists (
    select 1 from public.tasks where user_id = owner_id and category = 'Academics'
      and (extracted_fields->>'calendarSource' = 'google-calendar' or id like 'gcal-%')
      and (date is null or date !~ '^\d{4}-\d{2}-\d{2}$' or time is null or time !~ '^\d{2}:\d{2}$'
        or end_time is null or end_time !~ '^\d{2}:\d{2}$' or end_time <= time
        or title is null or length(trim(title)) = 0 or length(title) > 200)
  ) then raise exception 'Calendar contiene horarios inválidos; se conservan los fijos anteriores'; end if;
  select coalesce((max(valor #>> '{}') filter (where clave = 'margen_min'))::integer, 15),
    coalesce((max(valor #>> '{}') filter (where clave = 'hora_inicio_dia'))::time, '09:00'::time),
    coalesce((max(valor #>> '{}') filter (where clave = 'hora_fin_dia'))::time, '23:00'::time),
    max(valor #>> '{}') filter (where clave = '_revision'),
    max(valor #>> '{}') filter (where clave = '_plan_revision')
  into margin_minutes, day_start, day_end, current_revision, saved_revision
  from public.parametros where user_id = owner_id;
  with slots as (
    select greatest(fecha_inicio + inicio_local - make_interval(mins => margin_minutes), fecha_inicio + day_start, cut) as s,
      least(fecha_inicio + fin_local + make_interval(mins => margin_minutes), fecha_inicio + day_end) as e
    from public.eventos where user_id = owner_id and id like 'calendar-fijo:%' and activo
  ) select coalesce(range_agg(tsrange(s, e, '[)')), '{}'::tsmultirange) into before_busy from slots where e > s;

  insert into public.eventos (id, user_id, titulo, inicio_local, fin_local, dias_semana, fecha_inicio, fecha_fin, tipo, bloqueo, area, activo)
  select 'calendar-fijo:' || md5(user_id::text || ':' || id), user_id, title,
    time::time, end_time::time, null, date::date, null, 'fijo', true, 'clase', true
  from public.tasks where user_id = owner_id and category = 'Academics'
    and (extracted_fields->>'calendarSource' = 'google-calendar' or id like 'gcal-%')
  on conflict (id) do update set titulo = excluded.titulo, inicio_local = excluded.inicio_local,
    fin_local = excluded.fin_local, dias_semana = null, fecha_inicio = excluded.fecha_inicio,
    fecha_fin = null, tipo = 'fijo', bloqueo = true, area = 'clase', activo = true
  where eventos.user_id = owner_id and
    (eventos.titulo, eventos.inicio_local, eventos.fin_local, eventos.dias_semana, eventos.fecha_inicio,
     eventos.fecha_fin, eventos.tipo, eventos.bloqueo, eventos.area, eventos.activo)
    is distinct from (excluded.titulo, excluded.inicio_local, excluded.fin_local, excluded.dias_semana,
     excluded.fecha_inicio, excluded.fecha_fin, excluded.tipo, excluded.bloqueo, excluded.area, excluded.activo);
  get diagnostics updated_count = row_count;
  -- Desactivar conserva los enlaces de bloques históricos; no se borra ninguna fila.
  update public.eventos e set activo = false
  where e.user_id = owner_id and e.id like 'calendar-fijo:%' and e.activo
    and not exists (select 1 from public.tasks t where t.user_id = owner_id and t.category = 'Academics'
      and (t.extracted_fields->>'calendarSource' = 'google-calendar' or t.id like 'gcal-%')
      and e.id = 'calendar-fijo:' || md5(t.user_id::text || ':' || t.id));
  get diagnostics cancelled_count = row_count;
  with slots as (
    select greatest(fecha_inicio + inicio_local - make_interval(mins => margin_minutes), fecha_inicio + day_start, cut) as s,
      least(fecha_inicio + fin_local + make_interval(mins => margin_minutes), fecha_inicio + day_end) as e
    from public.eventos where user_id = owner_id and id like 'calendar-fijo:%' and activo
  ) select coalesce(range_agg(tsrange(s, e, '[)')), '{}'::tsmultirange) into after_busy from slots where e > s;

  if updated_count + cancelled_count > 0 then
    next_revision := gen_random_uuid()::text;
    insert into public.parametros(user_id, clave, valor) values(owner_id, '_revision', to_jsonb(next_revision))
      on conflict (user_id, clave) do update set valor = excluded.valor;
    -- Una sustitución con las mismas horas sigue teniendo un plan guardado válido.
    if before_busy = after_busy and saved_revision = current_revision then
      update public.parametros set valor = to_jsonb(next_revision) where user_id = owner_id and clave = '_plan_revision';
    end if;
  end if;
  return jsonb_build_object('actualizados', updated_count, 'desactivados', cancelled_count,
    'horarios_cambiados', before_busy <> after_busy);
end $$;
revoke all on function public.sincronizar_fijos_calendar() from public, anon;
grant execute on function public.sincronizar_fijos_calendar() to authenticated;
commit;
