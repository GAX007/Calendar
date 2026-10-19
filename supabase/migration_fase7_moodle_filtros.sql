-- Fase 7: filtros de Moodle y entregas editadas por el usuario.
--  · titulo_editado / deadline_editado: el usuario (o el asistente) cambió el título o el plazo;
--    la sync conserva el suyo en vez de pisarlo con el de Moodle.
--  · Las aperturas de cuestionario ("…(r)en hasiera-data") no son plazos: el plazo real es el
--    evento "…itxiera-data". Las que ya están pendientes pasan a 'descartada' (se pueden restaurar).
--  · Los filtros del usuario se guardan en parametros (clave 'moodle_filtros'), que ya tiene RLS
--    por usuario: no hace falta tabla nueva.
-- Idempotente y en una transacción. Ejecutar después de migration_fase6_privacidad.sql.
begin;

alter table public.entregas add column if not exists titulo_editado boolean not null default false;
alter table public.entregas add column if not exists deadline_editado boolean not null default false;

update public.entregas set estado = 'descartada'
where estado = 'pendiente'
  and (coalesce(titulo_raw, '') ~* '\(r\)en\s+hasiera-data' or titulo ~* '\(r\)en\s+hasiera-data');

notify pgrst, 'reload schema';
commit;
