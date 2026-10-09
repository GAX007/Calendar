// PostgreSQL WASM en memoria. Nunca conecta con Supabase.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { recordOwner as owner, recordOther as other, demoCheckin } from './fixtures/planificador/records';
if (!process.env.PGLITE_MODULE_PATH) throw new Error('Indica PGLITE_MODULE_PATH; ver docs/fase3_registros.md');
const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE_PATH).href);
const db = new PGlite();
let checks = 0;
async function check(name: string, action: () => Promise<void>) { await action(); checks++; console.log(`PASS ${name}`); }
await db.exec(`create role anon; create role authenticated; create schema auth;
  create table auth.users(id uuid primary key); insert into auth.users values('${owner}'),('${other}');
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
  grant usage on schema auth,public to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;
  create table public.entregas(uid text primary key,titulo text,deadline_utc timestamptz,estado text default 'pendiente',
    oculta_por_grupo boolean default false,borrada_en_moodle boolean default false,horas_est numeric,min_viable_min integer);
  grant select,update on public.entregas to authenticated;
  insert into public.entregas(uid,titulo,deadline_utc,horas_est) values
    ('log-demo-vacio','Deber inventado sin registro','2040-02-07T20:00Z',null),
    ('log-demo-uno','Deber inventado con registro','2040-02-07T20:00Z',2),
    ('log-demo-invalido','Deber inventado para rollback','2040-02-07T20:00Z',3);`);
for (const file of ['migration_fase2_planificador.sql','migration_universidad_planificador.sql']) {
  await db.exec(await readFile(new URL(`../supabase/${file}`,import.meta.url),'utf8'));
}
const sql = await readFile(new URL('../supabase/migration_fase3_registros.sql',import.meta.url),'utf8');
await check('Migración de registros se ejecuta dos veces sin error', async () => { await db.exec(sql); await db.exec(sql); });
await db.exec(`set role authenticated; set test.uid = '${owner}';`);
async function revision() { return (await db.query("select valor #>> '{}' as r from parametros where clave='_revision'")).rows[0]?.r || ''; }
async function complete(uid: string, hours?: number | null) {
  const params = [await revision(),'entrega',JSON.stringify({ uid,estado:'hecha' })];
  return hours === undefined ? db.query('select mutar_planificador($1,$2,$3::jsonb) as r',params)
    : db.query('select mutar_planificador($1,$2,$3::jsonb,$4::numeric) as r',[...params,hours]);
}
await check('Llamadas anteriores de tres argumentos siguen funcionando', async () => {
  await db.query('select mutar_planificador($1,$2,$3::jsonb)',['','parametros',JSON.stringify({max_deuda_horas:6})]);
  assert.equal(Number((await db.query("select valor from parametros where clave='max_deuda_horas'")).rows[0].valor),6);
});
// Plan y deuda inventados para verificar que completar no los altera.
await db.query(`insert into bloques_plan(id,user_id,fecha,inicio_local,fin_local,task_uid,version_minima,titulo,tipo)
  values('bloque-inventado',$1,'2040-02-06','09:00','10:00','log-demo-uno',false,'Trabajo inventado','profundo')`,[owner]);
await db.query(`insert into deuda(id,user_id,task_uid,horas_aplazadas,motivo,fecha)
  values('deuda-inventada',$1,'log-demo-uno',1,'plan_social','2040-02-06')`,[owner]);
await db.query(`insert into parametros(user_id,clave,valor) values
  ($1,'_plan_revision',to_jsonb($2::text)),($1,'_plan_entregas',planificador_entregas_snapshot())`,[owner,await revision()]);
const originalBlocks = (await db.query('select * from bloques_plan')).rows;
const originalDebt = (await db.query('select * from deuda')).rows;
await check('Completar sin horas reales no crea logs ni convierte la estimación null en 2 h', async () => {
  await complete('log-demo-vacio');
  assert.equal((await db.query('select * from task_logs')).rows.length,0);
  const row = (await db.query("select estado,horas_est from entregas where uid='log-demo-vacio'")).rows[0];
  assert.equal(row.estado,'hecha'); assert.equal(row.horas_est,null);
});
await check('Completar con 1,5 h crea exactamente una fila privada en fecha Madrid', async () => {
  await complete('log-demo-uno',1.5);
  const row = (await db.query("select *,fecha=(now() at time zone 'Europe/Madrid')::date as madrid from task_logs")).rows[0];
  assert.equal(Number(row.horas_reales),1.5); assert.equal(row.uid,'log-demo-uno'); assert.equal(row.user_id,owner); assert.equal(row.madrid,true);
  assert.equal((await db.query('select * from task_logs')).rows.length,1);
  assert.equal(Number((await db.query("select horas_est from entregas where uid='log-demo-uno'")).rows[0].horas_est),2);
  await assert.rejects(complete('log-demo-uno',1.5),/ya completada/);
  assert.equal((await db.query('select * from task_logs')).rows.length,1);
});
await check('Completar no cambia bloques, deuda ni la validez del plan guardado', async () => {
  assert.deepEqual((await db.query('select * from bloques_plan')).rows,originalBlocks);
  assert.deepEqual((await db.query('select * from deuda')).rows,originalDebt);
  assert.equal((await db.query("select valor #>> '{}' as r from parametros where clave='_plan_revision'")).rows[0].r,await revision());
  assert.deepEqual((await db.query("select valor from parametros where clave='_plan_entregas'")).rows[0].valor,
    (await db.query('select planificador_entregas_snapshot() as s')).rows[0].s);
});
await check('Horas inválidas revierten también la finalización; no hay estados parciales', async () => {
  for (const hours of [0,-1,24.25]) await assert.rejects(complete('log-demo-invalido',hours),/check constraint/i);
  assert.equal((await db.query("select estado from entregas where uid='log-demo-invalido'")).rows[0].estado,'pendiente');
  assert.equal((await db.query('select * from task_logs')).rows.length,1);
});
async function upsertCheckin(energia: number, sueno: number, fatiga: number, nota = 'Nota inventada') {
  return db.query(`insert into checkins(user_id,fecha,energia,sueno_h,fatiga,nota) values($1,$2,$3,$4,$5,$6)
    on conflict(user_id,fecha) do update set energia=excluded.energia,sueno_h=excluded.sueno_h,fatiga=excluded.fatiga,nota=excluded.nota`,
    [owner,demoCheckin.fecha,energia,sueno,fatiga,nota]);
}
await check('La base rechaza energía 0 y 6, fatiga inválida y sueño fuera de rango', async () => {
  for (const args of [[0,7.5,2],[6,7.5,2],[3,7.5,0],[3,7.5,6],[3,-0.5,2],[3,16.5,2]]) {
    await assert.rejects(upsertCheckin(args[0],args[1],args[2]),/check constraint/i);
  }
  assert.equal((await db.query('select * from checkins')).rows.length,0);
});
await check('Dos check-ins del mismo día dejan una sola fila con el último valor', async () => {
  await upsertCheckin(3,7.5,2); await upsertCheckin(4,8,1,'Última nota inventada');
  const rows = (await db.query('select * from checkins')).rows;
  assert.equal(rows.length,1); assert.equal(rows[0].energia,4); assert.equal(Number(rows[0].sueno_h),8);
  assert.equal(rows[0].fatiga,1); assert.equal(rows[0].nota,'Última nota inventada');
});
await check('Otro usuario no puede leer, insertar, editar, borrar ni hacer upsert de registros ajenos', async () => {
  await db.exec(`set test.uid = '${other}';`);
  for (const table of ['task_logs','checkins']) {
    assert.equal((await db.query(`select * from ${table}`)).rows.length,0);
    assert.equal((await db.query(`delete from ${table} where user_id=$1 returning *`,[owner])).rows.length,0);
  }
  await assert.rejects(db.query(`insert into task_logs(id,user_id,uid,fecha,horas_reales)
    values('ajeno',$1,'log-demo-uno','2040-02-06',1)`,[owner]),/row.level security/i);
  await assert.rejects(upsertCheckin(5,9,5),/row.level security/i);
  assert.equal((await db.query('update task_logs set horas_reales=9 where user_id=$1 returning *',[owner])).rows.length,0);
  assert.equal((await db.query('update checkins set energia=5 where user_id=$1 returning *',[owner])).rows.length,0);
  await db.exec(`set test.uid = '${owner}';`);
  await assert.rejects(db.query('update task_logs set user_id=$1',[other]),/row.level security/i);
  await assert.rejects(db.query('update checkins set user_id=$1',[other]),/row.level security/i);
  assert.equal((await db.query('select * from task_logs')).rows.length,1);
  assert.equal((await db.query('select * from checkins')).rows[0].energia,4);
});
await check('La FK exige una entrega existente y el anónimo no accede a registros ni al RPC', async () => {
  await assert.rejects(db.query(`insert into task_logs(id,uid,fecha,horas_reales)
    values('sin-entrega','no-existe','2040-02-06',1)`),/foreign key/i);
  await db.exec('reset role; set role anon;');
  for (const table of ['task_logs','checkins']) await assert.rejects(db.query(`select * from ${table}`),/permission denied/i);
  await assert.rejects(db.query("select mutar_planificador('','entrega','{}'::jsonb)"),/permission denied/i);
});
console.log(`${checks} comprobaciones de registros superadas`);
await db.close();
