// Optional integration suite: PostgreSQL WASM is installed in a temporary folder,
// not in the application stack. See docs/planificador.md for the command.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { generatePlan, previewSocial, assessSavedPlan } from '../src/planner/engine';
import { addDays, madridLocal, weekStart } from '../src/planner/time';
import { entregaSnapshot } from '../src/planner/snapshot';
import { entrega, evento, input } from './fixtures/planificador/inputs';

const modulePath = process.env.PGLITE_MODULE_PATH;
if (!modulePath) throw new Error('Indica PGLITE_MODULE_PATH; ver docs/planificador.md');
const { PGlite } = await import(pathToFileURL(modulePath).href);
const db = new PGlite();
const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
let checks = 0;
async function check(name: string, action: () => Promise<void>) { await action(); checks++; console.log(`PASS ${name}`); }
await db.exec(`
  create role anon; create role authenticated;
  create schema auth;
  create table auth.users(id uuid primary key);
  insert into auth.users values('${owner}'), ('${other}');
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  grant usage on schema public, auth to authenticated, anon;
  grant execute on function auth.uid() to authenticated, anon;
  create table public.entregas(uid text primary key, titulo text, deadline_utc timestamptz, estado text default 'pendiente',
    oculta_por_grupo boolean default false, borrada_en_moodle boolean default false, horas_est numeric, min_viable_min integer);
  grant select, update on public.entregas to authenticated;
`);
const sql = await readFile(new URL('../supabase/migration_fase2_planificador.sql', import.meta.url), 'utf8');
await check('Migration compiles and is idempotent', async () => { await db.exec(sql); await db.exec(sql); });
await db.exec(`set role authenticated; set test.uid = '${owner}';`);
let revision = '';
async function rpc(action: string, datos: unknown, rev = revision) {
  const result = await db.query('select public.mutar_planificador($1, $2, $3::jsonb) as revision', [rev, action, JSON.stringify(datos)]);
  return result.rows[0].revision;
}
await check('Parameters and events saved privately', async () => {
  revision = await rpc('parametros', { max_deuda_horas: 1, factor_calibracion_default: 1 });
  revision = await rpc('evento', evento({ id: 'inventado', fecha_inicio: '2040-01-02' }));
  assert.equal((await db.query('select * from public.eventos')).rows.length, 1);
});
await check('RLS: another user cannot read events, parameters, blocks or debt', async () => {
  await db.exec(`set test.uid = '${other}';`);
  for (const table of ['eventos', 'parametros', 'bloques_plan', 'deuda']) assert.equal((await db.query(`select * from public.${table}`)).rows.length, 0);
  await assert.rejects(db.query(`insert into public.parametros(user_id, clave, valor) values($1, 'ataque', '0')`, [owner]), /row.level security/i);
  await db.exec(`set test.uid = '${owner}';`);
});
await check('Stale revision rejected without changes', async () => {
  await assert.rejects(rpc('eliminar_evento', { id: 'inventado' }, ''), /ha cambiado/);
  assert.equal((await db.query('select * from public.eventos')).rows.length, 1);
});
const monday = addDays(weekStart(madridLocal(new Date()).slice(0, 10)), 7);
const task = entrega('demo', { horas_est: 4, deadline_utc: `${monday}T21:00:00Z` });
const earlier = entrega('demo-earlier', { tipo_trabajo: 'ligero', deadline_utc: `${monday}T10:00:00Z` });
const taskSnapshot = entregaSnapshot([task, earlier]);
await db.exec('reset role');
await db.query(`insert into public.entregas(uid,titulo,deadline_utc,estado,oculta_por_grupo,borrada_en_moodle,horas_est,min_viable_min)
  values($1,$2,$3,$4,$5,$6,$7,$8)`, [task.uid, task.titulo, task.deadline_utc, task.estado, false, false, 4, null]);
await db.query(`insert into public.entregas(uid,titulo,deadline_utc,estado,oculta_por_grupo,borrada_en_moodle,horas_est,min_viable_min,tipo_trabajo)
  values($1,$2,$3,'pendiente',false,false,2,null,'ligero')`, [earlier.uid, earlier.titulo, earlier.deadline_utc]);
await db.exec('set role authenticated');
await check('Snapshot matches JavaScript, dates and numeric defaults', async () => {
  assert.deepEqual((await db.query('select public.planificador_entregas_snapshot() as s')).rows[0].s, taskSnapshot);
});
const i = input({ desde: monday, hasta: addDays(monday, 6), ahora_local: madridLocal(new Date()), entregas: [task, earlier] });
const base = generatePlan(i);
const social = evento({ id: 'social-demo', tipo: 'social', area: 'social', fecha_inicio: monday, inicio_local: '17:00', fin_local: '19:00' });
const diff = previewSocial(i, social, base);
const payload = { desde_local: diff.desde_local, hasta: i.hasta, evento: social, plan_base: base.bloques,
  bloques: diff.plan.bloques, nueva_deuda: diff.nueva_deuda, entregas_snapshot: taskSnapshot, confirmar_deuda: false };
await check('Over debt limit needs explicit confirmation; failure is atomic', async () => {
  assert.equal(diff.horas_nuevas_deuda, 3);
  await assert.rejects(rpc('social', payload), /Confirma/);
  assert.equal((await db.query("select * from public.eventos where tipo = 'social'")).rows.length, 0);
  assert.equal((await db.query('select * from public.bloques_plan')).rows.length, 0);
  assert.equal((await db.query('select * from public.deuda')).rows.length, 0);
});
await check('Confirm persists event, minimum, debt and predecessor in one transaction', async () => {
  revision = await rpc('social', { ...payload, confirmar_deuda: true });
  const blocks = (await db.query("select * from public.bloques_plan where activo and task_uid = 'demo'")).rows;
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].version_minima, true);
  assert.ok(blocks[0].reemplaza_a);
  const debt = (await db.query('select * from public.deuda')).rows;
  assert.equal(Number(debt[0].horas_aplazadas), 3);
  assert.equal(debt[0].motivo, 'plan_social');
  assert.equal((await db.query("select valor from public.parametros where clave = '_plan_revision'")).rows[0].valor, revision);
});
await check('Repeated confirmation cannot create duplicate event or debt', async () => {
  await assert.rejects(rpc('social', { ...payload, confirmar_deuda: true }, ''), /ha cambiado/);
  assert.equal((await db.query('select * from public.deuda')).rows.length, 1);
});
await check('Social keeps every earlier block active and unchanged', async () => {
  const b = (await db.query("select * from public.bloques_plan where task_uid = 'demo-earlier'")).rows;
  assert.equal(b.length, 1);
  assert.equal(b[0].activo, true);
  assert.equal(b[0].inicio_local, base.bloques.find(b => b.task_uid === earlier.uid)!.inicio_local + ':00');
  assert.equal(b[0].fin_local, base.bloques.find(b => b.task_uid === earlier.uid)!.fin_local + ':00');
});
await check('Refreshing saved plan keeps precisely the persisted blocks', async () => {
  const blocks = (await db.query('select * from public.bloques_plan where activo order by fecha,inicio_local')).rows.map(b => ({ ...b,
    fecha: b.fecha.toISOString().slice(0, 10), inicio_local: b.inicio_local.slice(0, 5), fin_local: b.fin_local.slice(0, 5) }));
  const p = assessSavedPlan({ ...i, eventos: [social], bloques_previos: blocks });
  assert.deepEqual(p.bloques, blocks);
  assert.equal(p.en_riesgo.find(r => r.task_uid === task.uid)!.horas_pendientes, 3);
});
await check('Moodle change between preview and confirmation rejects the save', async () => {
  await db.query("update public.entregas set horas_est = 5 where uid = 'demo'");
  await assert.rejects(rpc('plan', { desde_local: `${monday}T09:00`, hasta: i.hasta, bloques: base.bloques, entregas_snapshot: taskSnapshot }), /entregas han cambiado/);
});
await check('Saving a later week preserves the existing earlier week', async () => {
  const before = (await db.query('select id from public.bloques_plan where activo order by id')).rows;
  const nextMonday = addDays(monday, 7);
  revision = await rpc('plan', { desde_local: `${nextMonday}T00:00`, hasta: addDays(nextMonday, 6), bloques: [],
    entregas_snapshot: (await db.query('select public.planificador_entregas_snapshot() as s')).rows[0].s });
  assert.deepEqual((await db.query('select id from public.bloques_plan where activo order by id')).rows, before);
});
await check('Atomic defer and not-completed actions increment without losing updates', async () => {
  revision = await rpc('aplazar', { uid: 'demo' });
  revision = await rpc('no_completada', { uid: 'demo' });
  assert.equal((await db.query("select aplazamientos from public.entregas where uid = 'demo'")).rows[0].aplazamientos, 2);
});
await check('An unauthenticated guest cannot execute the persistence RPC', async () => {
  await db.exec('reset role; set role anon;');
  await assert.rejects(rpc('parametros', {}), /permission denied/);
});
await db.close();
console.log(`${checks}/${checks} PostgreSQL checks passed`);
