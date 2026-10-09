// PostgreSQL WASM local: solo cuentas, asignaturas y trabajos inventados.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { universityTask } from '../src/planner/university';
import { entregaSnapshot } from '../src/planner/snapshot';
import { generatePlan, previewSocial } from '../src/planner/engine';
import { addDays, madridLocal, weekStart } from '../src/planner/time';
import { subject, universityWork } from './fixtures/planificador/university';
import { input, evento } from './fixtures/planificador/inputs';
if (!process.env.PGLITE_MODULE_PATH) throw new Error('Indica PGLITE_MODULE_PATH');
const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE_PATH).href);
const db = new PGlite();
const owner = '11111111-1111-4111-8111-111111111111', other = '22222222-2222-4222-8222-222222222222';
let checks = 0;
async function check(name: string, run: () => Promise<void>) { await run(); checks++; console.log(`PASS ${name}`); }
await db.exec(`create role anon; create role authenticated; create schema auth;
create table auth.users(id uuid primary key); insert into auth.users values('${owner}'),('${other}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
grant usage on schema auth,public to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;
create table entregas(uid text primary key,titulo text,deadline_utc timestamptz,estado text default 'pendiente',
oculta_por_grupo boolean default false,borrada_en_moodle boolean default false,horas_est numeric,min_viable_min integer);
grant select, update on entregas to authenticated;`);
await db.exec(await readFile(new URL('../supabase/migration_fase2_planificador.sql', import.meta.url),'utf8'));
const sql = await readFile(new URL('../supabase/migration_universidad_planificador.sql', import.meta.url),'utf8');
await check('Migración compila y puede ejecutarse dos veces', async () => { await db.exec(sql); await db.exec(sql); });
await db.exec(`set role authenticated; set test.uid = '${owner}';`);
const monday = addDays(weekStart(madridLocal(new Date()).slice(0,10)), 7);
const exam = universityWork({ id: 'examen-privado-demo', dueDate: addDays(monday,10), estimatedHours: 6 }).datos;
const hw = universityWork({ id: 'deber-privado-demo', title: 'Deber inventado', type: 'practica', dueDate: monday, dueTime: '23:59', estimatedHours: 2 }).datos;
async function save(work: unknown) { return db.query('select guardar_trabajo_universidad($1::jsonb,$2::jsonb,false)', [JSON.stringify(work),JSON.stringify(subject)]); }
await check('Deber y examen privados se guardan sin insertar en Moodle', async () => {
  await save(exam); await save(hw);
  assert.equal((await db.query('select * from trabajos_universidad')).rows.length,2);
  assert.equal((await db.query('select * from entregas')).rows.length,0);
});
await check('RLS y RPC no dejan leer ni editar trabajos de otra cuenta', async () => {
  await db.exec(`set test.uid = '${other}';`);
  assert.equal((await db.query('select * from trabajos_universidad')).rows.length,0);
  await assert.rejects(save(exam), /row.level security/i);
  await db.exec(`set test.uid = '${owner}';`);
});
let tasks: ReturnType<typeof universityTask>[] = [];
await check('Snapshot SQL y cliente coinciden, con orden por UID y zona Madrid', async () => {
  tasks = (await db.query(`select *, to_char(deadline_local,'YYYY-MM-DD"T"HH24:MI') as deadline_local from trabajos_universidad`)).rows.map(universityTask);
  assert.deepEqual((await db.query('select planificador_entregas_snapshot() as s')).rows[0].s, entregaSnapshot(tasks));
});
let revision = (await db.query("select valor #>> '{}' as r from parametros where clave = '_revision'")).rows[0].r;
const i = input({ desde: monday, hasta: addDays(monday,6), ahora_local: `${monday}T09:00`, entregas: tasks });
const plan = generatePlan(i);
await check('Guardar el plan enlaza deberes y sesiones sin perder la FK de Moodle', async () => {
  const response = await db.query('select mutar_planificador($1,$2,$3::jsonb) as r', [revision,'plan',JSON.stringify({ desde_local: `${monday}T09:00`, hasta: i.hasta, bloques: plan.bloques, entregas_snapshot: entregaSnapshot(tasks) })]);
  revision = response.rows[0].r;
  const rows = (await db.query('select * from bloques_plan where activo')).rows;
  assert.ok(rows.length > 0);
  assert.ok(rows.every(b => b.trabajo_id && !b.task_uid));
});
await check('El diff social guarda deuda y conserva el histórico de un deber', async () => {
  const social = evento({ id: 'social-ficticio', fecha_inicio: monday, inicio_local:'17:00',fin_local:'21:00',tipo:'social',area:'social' });
  const diff = previewSocial(i,social,plan);
  assert.ok(diff.nueva_deuda.some(d => d.task_uid === `uni:${hw.id}`));
  const response = await db.query('select mutar_planificador($1,$2,$3::jsonb) as r',[revision,'social',JSON.stringify({ evento:social,desde_local:diff.desde_local,hasta:diff.hasta,bloques:diff.plan.bloques,plan_base:plan.bloques,nueva_deuda:diff.nueva_deuda,confirmar_deuda:true,entregas_snapshot:entregaSnapshot(tasks) })]);
  revision = response.rows[0].r;
  assert.ok((await db.query('select * from deuda')).rows.every(d => d.trabajo_id && !d.task_uid));
});
await check('Editar estudio invalida un snapshot antiguo; aplazar funciona para Universidad', async () => {
  await save({ ...exam,estimatedHours:8 });
  revision = (await db.query("select valor #>> '{}' as r from parametros where clave = '_revision'")).rows[0].r;
  await assert.rejects(db.query('select mutar_planificador($1,$2,$3::jsonb)',[revision,'plan',JSON.stringify({ entregas_snapshot:entregaSnapshot(tasks) })]), /han cambiado/);
  const response = await db.query('select mutar_planificador($1,$2,$3::jsonb) as r',[revision,'aplazar',JSON.stringify({uid:`uni:${exam.id}`})]);
  revision = response.rows[0].r;
  assert.equal((await db.query('select aplazamientos from trabajos_universidad where id=$1',[exam.id])).rows[0].aplazamientos,1);
});
await check('Archivar el deber conserva sus bloques y deuda; anónimo no puede leer', async () => {
  await db.query('select guardar_trabajo_universidad($1::jsonb,$2::jsonb,true)',[JSON.stringify(hw),JSON.stringify(subject)]);
  assert.equal((await db.query('select activo from trabajos_universidad where id=$1',[hw.id])).rows[0].activo,false);
  await db.exec('reset role; set role anon;');
  await assert.rejects(db.query('select * from trabajos_universidad'), /permission denied/i);
});
console.log(`${checks} comprobaciones de persistencia superadas`);
await db.close();
