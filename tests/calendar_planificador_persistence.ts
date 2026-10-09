// PostgreSQL en memoria; exclusivamente usuarios, clases y horarios inventados.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { addDays, madridLocal } from '../src/planner/time';

if (!process.env.PGLITE_MODULE_PATH) throw new Error('Indica PGLITE_MODULE_PATH; ver docs/planificador.md');
const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE_PATH).href);
const db = new PGlite();
const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const day = addDays(madridLocal(new Date()).slice(0, 10), 7);
let checks = 0;
async function check(name: string, run: () => Promise<void>) { await run(); checks++; console.log(`PASS ${name}`); }
await db.exec(`create role anon; create role authenticated; create schema auth;
create table auth.users(id uuid primary key); insert into auth.users values('${owner}'),('${other}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
grant usage on schema auth,public to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;
create table entregas(uid text primary key,titulo text,deadline_utc timestamptz,estado text,oculta_por_grupo boolean,borrada_en_moodle boolean,horas_est numeric,min_viable_min integer);
grant select,update on entregas to authenticated;
create table tasks(id text primary key,user_id uuid,title text,category text,date text,time text,end_time text,extracted_fields jsonb);
alter table tasks enable row level security; create policy owner on tasks for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
grant select,insert,update,delete on tasks to authenticated;`);
await db.exec(await readFile(new URL('../supabase/migration_fase2_planificador.sql', import.meta.url), 'utf8'));
const migration = await readFile(new URL('../supabase/migration_calendar_planificador.sql', import.meta.url), 'utf8');
await check('La migración compila y se puede ejecutar dos veces', async () => { await db.exec(migration); await db.exec(migration); });
await db.exec(`set role authenticated; set test.uid='${owner}';`);
async function sync() { return (await db.query('select sincronizar_fijos_calendar() as result')).rows[0].result; }
async function revision() { return (await db.query("select valor from parametros where clave='_revision'")).rows[0]?.valor; }
async function source(id: string, title = 'Clase inventada', start = '13:30', end = '15:30') {
  await db.query("insert into tasks values($1,$2,$3,'Academics',$4,$5,$6,'{}')", [id, owner, title, day, start, end]);
}
await source('gcal-demo');
await db.query("insert into eventos(id,user_id,titulo,inicio_local,fin_local,dias_semana,fecha_inicio,tipo,bloqueo,area) values('karate-demo',$1,'Deporte inventado','19:30','21:00',array[1,2,3,4],$2,'fijo',true,'karate')", [owner, day]);
await check('Importa la clase como fijo bloqueante y conserva el deporte manual', async () => {
  assert.deepEqual(await sync(), { actualizados: 1, desactivados: 0, horarios_cambiados: true });
  const rows = (await db.query('select * from eventos order by id')).rows;
  assert.equal(rows.length, 2); assert.equal(rows[0].tipo, 'fijo'); assert.equal(rows[0].bloqueo, true);
  assert.equal(rows[0].id, (await db.query("select 'calendar-fijo:'||md5($1||':gcal-demo') as id", [owner])).rows[0].id);
});
await check('La sincronización idéntica no escribe ni cambia la revisión', async () => {
  const before = await revision(); assert.deepEqual(await sync(), { actualizados: 0, desactivados: 0, horarios_cambiados: false }); assert.equal(await revision(), before);
});
let historical: unknown[];
await db.exec(`insert into parametros(user_id,clave,valor) select user_id,'_plan_revision',valor from parametros where clave='_revision';
insert into bloques_plan(id,user_id,fecha,inicio_local,fin_local,evento_id,version_minima,titulo,tipo)
select 'historial-demo',user_id,'2020-01-01','13:30','15:30',id,false,'Nombre histórico','fijo' from eventos where id like 'calendar-fijo:%';`);
historical = (await db.query('select * from bloques_plan')).rows;
await check('Cambiar el nombre actualiza el fijo y mantiene válido el plan guardado', async () => {
  await db.exec("update tasks set title='Nombre nuevo inventado'");
  assert.equal((await sync()).horarios_cambiados, false);
  assert.equal((await db.query("select titulo from eventos where id like 'calendar-fijo:%'")).rows[0].titulo, 'Nombre nuevo inventado');
  assert.equal((await db.query("select valor from parametros where clave='_plan_revision'")).rows[0].valor, await revision());
  assert.deepEqual((await db.query('select * from bloques_plan')).rows, historical);
});
await check('Sustituir la clase por dos adyacentes mantiene la misma ocupación', async () => {
  await db.exec("delete from tasks where id='gcal-demo'");
  await source('gcal-a', 'Asignatura A inventada', '13:30', '14:30'); await source('gcal-b', 'Asignatura B inventada', '14:30', '15:30');
  assert.deepEqual(await sync(), { actualizados: 2, desactivados: 1, horarios_cambiados: false });
  assert.equal((await db.query("select valor from parametros where clave='_plan_revision'")).rows[0].valor, await revision());
});
await check('Mover una clase cambia la ocupación e invalida el plan futuro', async () => {
  await db.exec("update tasks set time='17:00',end_time='18:00' where id='gcal-b'");
  assert.equal((await sync()).horarios_cambiados, true);
  assert.notEqual((await db.query("select valor from parametros where clave='_plan_revision'")).rows[0].valor, await revision());
});
await check('Cancelar desactiva los fijos sin modificar bloques históricos ni karate', async () => {
  await db.exec('delete from tasks'); assert.equal((await sync()).horarios_cambiados, true);
  assert.equal((await db.query("select * from eventos where id like 'calendar-fijo:%' and activo")).rows.length, 0);
  assert.equal((await db.query("select * from eventos where id='karate-demo' and activo")).rows.length, 1);
  assert.deepEqual((await db.query('select * from bloques_plan')).rows, historical);
});
await check('Un calendario inválido falla de forma atómica y conserva los fijos', async () => {
  await source('gcal-error', '', '13:30', '15:30'); const before = await revision();
  await assert.rejects(sync(), /horarios inválidos/); assert.equal(await revision(), before);
  assert.equal((await db.query("select * from eventos where activo")).rows.length, 1);
});
await check('Otro usuario solo puede sincronizar sus propias clases', async () => {
  await db.exec(`set test.uid='${other}'`); assert.equal((await db.query('select * from eventos')).rows.length, 0);
  assert.deepEqual(await sync(), { actualizados: 0, desactivados: 0, horarios_cambiados: false });
  await db.exec(`set test.uid='${owner}'`); assert.equal((await db.query("select * from eventos where activo")).rows.length, 1);
});
await check('El invitado no puede ejecutar el RPC', async () => {
  await db.exec('reset role; set role anon'); await assert.rejects(sync(), /permission denied/);
});
await db.close(); console.log(`${checks}/${checks} PostgreSQL Calendar checks passed`);
