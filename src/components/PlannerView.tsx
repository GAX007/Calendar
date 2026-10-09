import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { assessSavedPlan, generatePlan, previewSocial, validateEvento } from '../planner/engine';
import { addDays, madridLocal, validLocal, weekStart } from '../planner/time';
import { DEFAULT_PARAMETROS, type DiffSocial, type Evento, type Parametros, type Plan, type PlanInput } from '../planner/types';
import { confirmSocial, loadPlanner, mutatePlanner, saveEvento, saveParametros, savePlan, type PlannerData } from '../services/plannerService';
import type { EntregaItem } from '../services/moodleTypes';
import { CALENDAR_PLANNER_UPDATED, CALENDAR_PLANNER_STATUS, type CalendarPlannerChange } from '../services/calendarPlannerService';
import { calendarAllocationKey, refreshCalendarBlocks } from '../planner/calendar';
import { getEffectiveCalendarUrl, syncLiveGoogleCalendar } from '../services/googleCalendarService';
import { UNIVERSITY_PLANNER_UPDATED } from '../services/universityPlannerService';
import { DailyCheckin } from './DailyCheckin';
import { CompleteEntregaDialog } from './CompleteEntregaDialog';
import { completeEntrega } from '../services/plannerRecordsService';

const panel = 'rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 sm:p-5';
const control = 'w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm';
const button = 'rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50 hover:bg-indigo-700';
const secondary = 'rounded-xl border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50';
const hours = (n: number) => `${Number(n.toFixed(2)).toLocaleString('es-ES')} h`;
const dayLabel = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const dayNames = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
function Field({ label, children }: { label: string; children: React.ReactNode; key?: string }) {
  return <label className="flex flex-col gap-1 text-sm font-medium">{label}{children}</label>;
}
function emptyEvent(date: string, social = false): Evento {
  return { id: crypto.randomUUID(), titulo: '', inicio_local: '18:00', fin_local: '20:00', dias_semana: null,
    fecha_inicio: date, fecha_fin: null, tipo: social ? 'social' : 'fijo', bloqueo: true, area: social ? 'social' : 'otro' };
}
function EventFields({ value, onChange, social = false }: { value: Evento; onChange: (e: Evento) => void; social?: boolean }) {
  const set = (fields: Partial<Evento>) => onChange({ ...value, ...fields });
  return <div className="grid sm:grid-cols-2 gap-3">
    <Field label="Título"><input required maxLength={200} className={control} value={value.titulo} onChange={e => set({ titulo: e.target.value })} /></Field>
    <Field label={value.dias_semana ? 'Válido desde' : 'Fecha'}><input required type="date" className={control} value={value.fecha_inicio} onChange={e => set({ fecha_inicio: e.target.value })} /></Field>
    <Field label="Inicio · Madrid"><input required type="time" className={control} value={value.inicio_local.slice(0, 5)} onChange={e => set({ inicio_local: e.target.value })} /></Field>
    <Field label="Fin · Madrid"><input required type="time" className={control} value={value.fin_local.slice(0, 5)} onChange={e => set({ fin_local: e.target.value })} /></Field>
    {!social && <>
      <Field label="Tipo"><select className={control} value={value.tipo} onChange={e => set({ tipo: e.target.value as Evento['tipo'] })}><option value="fijo">Fijo</option><option value="flexible">Flexible</option></select></Field>
      <Field label="Área"><select className={control} value={value.area} onChange={e => set({ area: e.target.value as Evento['area'] })}>{['clase', 'trabajo', 'clase_particular', 'karate', 'gym', 'otro'].map(a => <option key={a} value={a}>{a.replace('_', ' ')}</option>)}</select></Field>
      <label className="flex gap-2 items-center text-sm"><input type="checkbox" checked={value.bloqueo} onChange={e => set({ bloqueo: e.target.checked })} />Bloquear este horario</label>
      <label className="flex gap-2 items-center text-sm"><input type="checkbox" checked={value.dias_semana !== null} onChange={e => set({ dias_semana: e.target.checked ? [1] : null, fecha_fin: null })} />Repetir cada semana</label>
      {value.dias_semana !== null && <>
        <div className="flex gap-2 flex-wrap">{dayNames.map((name, i) => <label className="flex gap-1 items-center text-sm" key={name}><input type="checkbox" checked={value.dias_semana!.includes(i + 1)} onChange={e => set({ dias_semana: e.target.checked ? [...value.dias_semana!, i + 1].sort() : value.dias_semana!.filter(d => d !== i + 1) })} />{name}</label>)}</div>
        <Field label="Válido hasta · opcional"><input type="date" className={control} value={value.fecha_fin || ''} onChange={e => set({ fecha_fin: e.target.value || null })} /></Field>
      </>}
    </>}
  </div>;
}
const parameterLabels: Record<keyof Parametros, string> = {
  hora_inicio_dia: 'Inicio del día', hora_fin_dia: 'Fin del día', margen_min: 'Margen antes y después · minutos',
  max_horas_profundas_dia: 'Máximo profundo diario · horas', franja_profunda_inicio: 'Franja profunda · inicio',
  franja_profunda_fin: 'Franja profunda · fin', max_deuda_horas: 'Máxima deuda · horas', factor_calibracion_default: 'Factor de calibración · fase 3',
};

export function PlannerView({ onOpenEntrega }: { onOpenEntrega: (uid: string) => void }) {
  const { user } = useAuth();
  const [data, setData] = useState<PlannerData | null>(null);
  const [now, setNow] = useState(() => madridLocal(new Date()));
  const [date, setDate] = useState(() => madridLocal(new Date()).slice(0, 10));
  const [tab, setTab] = useState<'hoy' | 'semana' | 'eventos' | 'parametros' | 'entregas'>('hoy');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [calendarError, setCalendarError] = useState('');
  const [notice, setNotice] = useState('');
  const [evento, setEvento] = useState(() => emptyEvent(date));
  const [params, setParams] = useState(DEFAULT_PARAMETROS);
  const [social, setSocial] = useState<Evento | null>(null);
  const [preview, setPreview] = useState<DiffSocial | null>(null);
  const [acceptDebt, setAcceptDebt] = useState(false);
  const [task, setTask] = useState<EntregaItem | null>(null);
  const [completingTask, setCompletingTask] = useState<EntregaItem | null>(null);
  const preservedCompletionPlan = useRef<{ desde: string; hasta: string; plan: Plan } | null>(null);
  const loadId = useRef(0);
  const lastData = useRef<PlannerData | null>(null);
  const planningTime = useRef(now);
  const reload = useCallback(async (keepPlanningTime = false, background = false) => {
    const request = ++loadId.current;
    try {
      const fresh = await loadPlanner();
      if (request !== loadId.current) return;
      // No conservar un corte antiguo si Moodle, parámetros o estudio guardado
      // también han cambiado mientras Calendar actualizaba únicamente etiquetas.
      const key = (candidate: PlannerData) => calendarAllocationKey({
        desde: planningTime.current.slice(0, 10), hasta: planningTime.current.slice(0, 10),
        ahora_local: planningTime.current, eventos: candidate.eventos, entregas: candidate.entregas,
        parametros: candidate.parametros, bloques_previos: candidate.bloques, deuda: candidate.deuda,
      }, Boolean(candidate.plan_revision && candidate.plan_revision === candidate.revision));
      const reuseTime = keepPlanningTime && lastData.current && key(lastData.current) === key(fresh);
      planningTime.current = reuseTime ? planningTime.current : madridLocal(new Date());
      lastData.current = fresh;
      preservedCompletionPlan.current = null;
      setData(fresh); if (!background) setParams(fresh.parametros);
      setNow(planningTime.current);
      setPreview(null); setAcceptDebt(false);
    } catch (err) { if (request === loadId.current) throw err; }
  }, []);
  const run = async (action: () => Promise<void>, message = '') => {
    setBusy(true); setError(''); setNotice('');
    try { await action(); if (message) setNotice(message); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  useEffect(() => { if (user) void run(reload); }, [user?.id, reload]);
  useEffect(() => {
    const onCalendarUpdated = (event: Event) => {
      const change = (event as CustomEvent<CalendarPlannerChange & { userId: string }>).detail;
      if (change.userId !== user?.id) return;
      void run(() => reload(!change.horarios_cambiados, true), change.horarios_cambiados
        ? 'Calendar ha cambiado las horas ocupadas. Revisa el plan actualizado.'
        : 'Nombres de Calendar actualizados; se conservan los bloques de estudio.');
    };
    const onCalendarStatus = (event: Event) => {
      const status = (event as CustomEvent<{ userId: string; error: string }>).detail;
      if (status.userId === user?.id) setCalendarError(status.error);
    };
    window.addEventListener(CALENDAR_PLANNER_UPDATED, onCalendarUpdated);
    window.addEventListener(CALENDAR_PLANNER_STATUS, onCalendarStatus);
    const onUniversityUpdated = () => { void run(reload); };
    window.addEventListener(UNIVERSITY_PLANNER_UPDATED, onUniversityUpdated);
    return () => {
      window.removeEventListener(CALENDAR_PLANNER_UPDATED, onCalendarUpdated);
      window.removeEventListener(CALENDAR_PLANNER_STATUS, onCalendarStatus);
      window.removeEventListener(UNIVERSITY_PLANNER_UPDATED, onUniversityUpdated);
    };
  }, [user?.id, reload]);
  const desde = weekStart(date), hasta = addDays(desde, 6);
  const input: PlanInput | null = data ? { desde, hasta, ahora_local: now, entregas: data.entregas,
    eventos: data.eventos, parametros: data.parametros, bloques_previos: data.bloques, deuda: data.deuda } : null;
  const saved = Boolean(data?.plan_revision && data.plan_revision === data.revision && data.bloques.some(b => b.fecha >= desde && b.fecha <= hasta));
  const allocationKey = calendarAllocationKey(input, saved);
  const calculation = useMemo(() => {
    const preserved = preservedCompletionPlan.current;
    if (preserved && preserved.desde === desde && preserved.hasta === hasta) return { plan: preserved.plan, error: '' };
    try { return { plan: input ? data!.plan_revision && data!.plan_revision === data!.revision && data!.bloques.some(b => b.fecha >= desde && b.fecha <= hasta) ? assessSavedPlan(input) : generatePlan(input) : null, error: '' }; }
    catch (e) { return { plan: null, error: e instanceof Error ? e.message : String(e) }; }
  }, [allocationKey]);
  const plan = calculation.plan && input ? refreshCalendarBlocks(calculation.plan, input) : calculation.plan;
  const activeTasks = data?.entregas.filter(t => t.estado === 'pendiente' && !t.oculta_por_grupo && !t.borrada_en_moodle) || [];
  const editTask = (t: EntregaItem, split = false) => {
    setTask({ ...t, horas_est: t.horas_est ?? 2, min_viable_min: t.min_viable_min ?? Math.max(20, Math.ceil((t.horas_est ?? 2) * 60 * 0.25)),
      tipo_trabajo: t.tipo_trabajo || 'profundo', tamano_bloque_min: split ? 30 : t.tamano_bloque_min });
    setTab('entregas');
  };
  const completeWithoutReplanning = async (t: EntregaItem, realHours: number | null) => {
    if (!data || !plan) throw new Error('Espera a que termine de cargar el plan');
    setBusy(true);
    try {
      const revision = await completeEntrega(t.uid, realHours, data.revision);
      // Conservar también una propuesta aún no guardada. No llamar a reload ni
      // al algoritmo al completar; una actualización explícita sigue disponible.
      preservedCompletionPlan.current = { desde, hasta, plan: { ...plan,
        en_riesgo: plan.en_riesgo.filter(r => r.task_uid !== t.uid),
        criticas: plan.criticas.filter(r => r.task_uid !== t.uid),
        avisos_aplazamiento: plan.avisos_aplazamiento.filter(r => r.task_uid !== t.uid) } };
      const updated = { ...data, revision, plan_revision: data.plan_revision === data.revision ? revision : data.plan_revision,
        entregas: data.entregas.map(e => e.uid === t.uid ? { ...e, estado: 'hecha' as const } : e) };
      lastData.current = updated; setData(updated); setPreview(null); setAcceptDebt(false);
      setNotice('Entrega completada; se conservan los bloques y la deuda'); setCompletingTask(null);
    } finally { setBusy(false); }
  };
  const taskAction = async (t: EntregaItem, action: 'aplazar' | 'no_completada' | 'hecha' | 'descartada') => {
    if (!data) return;
    if (action === 'hecha') {
      if (t.uid.startsWith('uni:')) await run(() => completeWithoutReplanning(t, null));
      else setCompletingTask(t);
      return;
    }
    await run(async () => {
      await mutatePlanner(data, ['aplazar', 'no_completada'].includes(action) ? action : 'entrega',
        ['aplazar', 'no_completada'].includes(action) ? { uid: t.uid } : { ...t, horas_est: t.horas_est ?? 2,
          min_viable_min: t.min_viable_min ?? Math.max(20, Math.ceil((t.horas_est ?? 2) * 15)), tipo_trabajo: t.tipo_trabajo || 'profundo', estado: action });
      await reload();
    }, action === 'aplazar' || action === 'no_completada' ? 'Entrega aplazada a mañana; contador incrementado' : 'Entrega actualizada');
  };
  if (!user) return <section className={`${panel} m-4`}><h1 className="text-xl font-bold">Planificador</h1><p className="mt-2">Inicia sesión para guardar tus horarios y parámetros privados en Supabase.</p></section>;
  return <section className="max-w-6xl mx-auto px-4 py-6 pb-28 text-slate-900 dark:text-slate-100 space-y-4">
    <header className="flex justify-between gap-3 flex-wrap items-start">
      <div><h1 className="text-2xl font-extrabold">Tu plan de estudio</h1><p className="text-sm text-slate-500 mt-1">Tus horarios y entregas de Moodle · hora de Madrid</p>{data && <p className="text-xs mt-1">{saved ? 'Plan guardado en tu cuenta' : 'Propuesta calculada; guarda el plan semanal para conservarla'}</p>}</div>
      <div className="flex gap-2 flex-wrap">
        <button className={secondary} disabled={busy} onClick={() => void run(async () => {
          if (getEffectiveCalendarUrl(user.id, user.email)) {
            const result = await syncLiveGoogleCalendar(user.id, user.email);
            if (!result.success || result.plannerError) throw new Error(result.plannerError || result.error || 'No se pudo sincronizar Calendar');
            await reload(!result.plannerChange?.horarios_cambiados);
          } else await reload();
        }, 'Calendar y planificador actualizados')}>Actualizar</button>
        <button className={button} disabled={busy || !plan} onClick={() => { setSocial(emptyEvent(date, true)); setPreview(null); setAcceptDebt(false); }}>Añadir plan imprevisto</button>
      </div>
    </header>
    {(error || calculation.error) && <p role="alert" className="rounded-xl bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-200 p-3">{error || calculation.error}</p>}
    {calendarError && <p role="alert" className="rounded-xl bg-amber-50 dark:bg-amber-950 p-3">{calendarError}</p>}
    {notice && <p role="status" className="rounded-xl bg-green-50 dark:bg-green-950 p-3">{notice}</p>}
    {busy && <p role="status">Guardando o cargando…</p>}
    <nav className="flex flex-wrap gap-2" aria-label="Vistas del planificador">{(['hoy', 'semana', 'eventos', 'parametros', 'entregas'] as const).map(t => <button className={tab === t ? button : secondary} key={t} onClick={() => setTab(t)}>{({ hoy: 'Hoy', semana: 'Semana', eventos: 'Eventos fijos', parametros: 'Parámetros', entregas: 'Estimaciones' })[t]}</button>)}</nav>
    {tab === 'hoy' && <DailyCheckin key={user.id} userId={user.id} />}
    {data && plan && <>
      {(tab === 'hoy' || tab === 'semana') && <>
        <div className={`${panel} flex gap-3 items-center flex-wrap`}>
          <button className={secondary} onClick={() => { setDate(madridLocal(new Date()).slice(0, 10)); setPreview(null); }}>Hoy</button>
          <button className={secondary} aria-label={tab === 'hoy' ? 'Día anterior' : 'Semana anterior'} title={tab === 'hoy' ? 'Día anterior' : 'Semana anterior'} onClick={() => { setDate(addDays(date, tab === 'hoy' ? -1 : -7)); setPreview(null); }}>←</button>
          <input aria-label="Día del plan" type="date" className={`${control} max-w-44`} value={date} onChange={e => { if (e.target.value) setDate(e.target.value); setPreview(null); }} />
          <button className={secondary} aria-label={tab === 'hoy' ? 'Día siguiente' : 'Semana siguiente'} title={tab === 'hoy' ? 'Día siguiente' : 'Semana siguiente'} onClick={() => { setDate(addDays(date, tab === 'hoy' ? 1 : 7)); setPreview(null); }}>→</button>
          <span className="text-sm">Deuda acumulada: <strong>{hours(plan.deuda_total_horas)}</strong></span>
          <button className={`${secondary} sm:ml-auto`} disabled={busy || hasta < now.slice(0, 10)} onClick={() => void run(async () => {
            if (now !== madridLocal(new Date())) { await reload(); throw new Error('El minuto ha cambiado. Plan actualizado; revisa y vuelve a guardar'); }
            await savePlan(data, plan, hasta, now); await reload();
          }, 'Plan semanal guardado')}>Guardar plan semanal</button>
        </div>
        {!data.eventos.length && <p className="text-sm rounded-xl bg-amber-50 dark:bg-amber-950 p-3">Todavía no has añadido horarios fijos. Este plan considera libres todas las horas de tus parámetros. Introduce clases, trabajo, entrenos y ocio en «Eventos fijos».</p>}
        {tab === 'hoy' ? <div className={panel}><h2 className="text-lg font-bold capitalize mb-3">{dayLabel(date)}</h2>
          {!plan.bloques.some(b => b.fecha === date) && <p>Sin bloques para este día.</p>}
          <ol className="space-y-3">{plan.bloques.filter(b => b.fecha === date).map(b => <li key={b.id} className={`rounded-xl border-l-4 p-3 ${b.tipo === 'social' ? 'border-pink-500 bg-pink-50 dark:bg-pink-950/30' : b.task_uid ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30' : 'border-slate-400 bg-slate-50 dark:bg-slate-800'}`}>
            <div className="flex gap-3 justify-between flex-wrap">{b.task_uid ? <button type="button" className="text-left font-bold text-indigo-700 dark:text-indigo-300 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500 rounded" aria-label={`${b.task_uid.startsWith('uni:') ? 'Ver deber o examen' : 'Ver entrega Moodle'}: ${b.titulo}`} onClick={() => onOpenEntrega(b.task_uid!)}>{b.inicio_local}–{b.fin_local} · {b.titulo}</button> : <strong>{b.inicio_local}–{b.fin_local} · {b.titulo}</strong>}<span className="text-sm">{data.entregas.find(t => t.uid === b.task_uid)?.es_examen && 'Estudio de examen · '}{b.tipo}{b.version_minima && ' · versión mínima'}</span></div>
            {b.estimacion_por_defecto && <p className="text-xs mt-1">Estimación provisional: 2 h. Puedes ajustarla en Estimaciones.</p>}
            {data.entregas.find(t => t.uid === b.task_uid)?.estado === 'hecha' && <p className="text-xs font-medium text-green-700 dark:text-green-300 mt-1">Completada</p>}
            {b.tipo === 'flexible' && !data.eventos.find(e => e.id === b.evento_id)?.bloqueo && <p className="text-xs mt-1">Preferencia flexible; permite bloques de estudio encima.</p>}
            {b.task_uid && date >= now.slice(0, 10) && data.entregas.find(t => t.uid === b.task_uid)?.estado === 'pendiente' && <div className="flex gap-2 flex-wrap mt-2">{(['hecha', 'aplazar', 'no_completada'] as const).map(a => <button key={a} className={secondary} disabled={busy} onClick={() => { const t = data.entregas.find(t => t.uid === b.task_uid); if (t) void taskAction(t, a); }}>{({ hecha: 'Completada', aplazar: 'Siguiente día', no_completada: 'No completada' })[a]}</button>)}</div>}
          </li>)}</ol>
        </div> : <div className={`${panel} overflow-x-auto`}><h2 className="text-lg font-bold mb-3">Semana del {dayLabel(desde)}</h2>
          <table className="w-full text-left text-sm"><thead><tr><th className="py-2">Día</th><th>Profundo</th><th>Ligero</th><th>Deuda acumulada</th></tr></thead><tbody>{plan.carga.map(c => <tr key={c.fecha} className="border-t border-slate-200 dark:border-slate-700"><td className="py-3"><button className="underline capitalize" onClick={() => { setDate(c.fecha); setTab('hoy'); }}>{dayLabel(c.fecha)}</button></td><td>{hours(c.profundas)}</td><td>{hours(c.ligeras)}</td><td>{hours(data.deuda.filter(d => d.fecha <= c.fecha).reduce((n, d) => n + Number(d.horas_aplazadas), 0))}</td></tr>)}</tbody></table>
        </div>}
        <div className="grid md:grid-cols-2 gap-4">
          <div className={panel}><h2 className="font-bold text-red-600 dark:text-red-300 mb-2">Entregas en riesgo ({plan.en_riesgo.length})</h2>{!plan.en_riesgo.length && <p className="text-sm">Todas las candidatas tienen hueco suficiente.</p>}<ul className="space-y-3">{plan.en_riesgo.map(r => <li key={r.task_uid}>
            <button type="button" className="text-left font-bold text-indigo-700 dark:text-indigo-300 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500 rounded" aria-label={`${r.task_uid.startsWith('uni:') ? 'Ver deber o examen en riesgo' : 'Ver entrega Moodle en riesgo'}: ${r.titulo}`} onClick={() => onOpenEntrega(r.task_uid)}>{r.titulo}</button>
            <p className="text-sm">{r.motivo}. Pendiente: {hours(r.horas_pendientes)}.</p>
          </li>)}</ul></div>
          <div className={panel}><h2 className="font-bold mb-2">Críticas ({plan.criticas.length})</h2><p className="text-xs text-slate-500 mb-2">Presión mayor que 60 % de las horas libres hasta el plazo.</p><ul className="space-y-2">{plan.criticas.map(c => <li key={c.task_uid} className="text-sm">{c.titulo} · {c.presion == null ? 'Sin horas disponibles' : `${Math.round(c.presion * 100)} %`}</li>)}</ul></div>
        </div>
        {activeTasks.some(t => t.es_examen) && <div className={panel}><h2 className="font-bold mb-2">Preparación de exámenes</h2><ul className="space-y-3">{activeTasks.filter(t => t.es_examen).map(t => {
          const sessions = (plan.proyeccion || plan.bloques).filter(b => b.task_uid === t.uid);
          return <li key={t.uid}><button className="text-sm font-semibold text-indigo-600 dark:text-indigo-300 hover:underline" onClick={() => onOpenEntrega(t.uid)}>{t.titulo}</button>
            <p className="text-xs text-slate-500 dark:text-slate-400">{t.horas_est} h estimadas · examen {madridLocal(t.deadline_utc).replace('T', ' a las ')} · {sessions.length} sesiones previstas</p>
            <p className="text-xs mt-1">{sessions.map(b => `${dayLabel(b.fecha)} ${b.inicio_local}–${b.fin_local}`).join(' · ') || 'Sin sesiones disponibles; revisa el riesgo.'}</p>
          </li>;
        })}</ul></div>}
        {plan.avisos_aplazamiento.map(a => { const t = data.entregas.find(t => t.uid === a.task_uid)!; return <div className={`${panel} border-amber-400`} key={a.task_uid}><strong>{a.titulo}: {a.aplazamientos} aplazamientos</strong><p className="text-sm mt-1">Elige cómo abordar esta entrega.</p><div className="flex gap-2 flex-wrap mt-3"><button className={secondary} onClick={() => editTask(t, true)}>Dividir la tarea</button><button className={secondary} disabled={busy} onClick={() => void taskAction(t, 'descartada')}>Descartarla</button><button className={secondary} onClick={() => editTask(t)}>Fijar un hueco concreto</button></div></div>; })}
      </>}
      {tab === 'eventos' && <>
        <div className={panel}><h2 className="font-bold mb-3">Horarios guardados en tu cuenta</h2><ul className="space-y-3">{data.eventos.map(e => <li key={e.id} className="flex gap-3 flex-wrap items-center justify-between"><div><strong>{e.titulo}</strong><p className="text-sm">{e.inicio_local.slice(0, 5)}–{e.fin_local.slice(0, 5)} · {e.tipo} · {e.dias_semana?.map(d => dayNames[d - 1]).join(', ') || e.fecha_inicio} · desde {e.fecha_inicio}{e.fecha_fin && ` hasta ${e.fecha_fin}`}</p></div><div className="flex gap-2">{e.tipo !== 'social' && <button className={secondary} onClick={() => setEvento({ ...e, inicio_local: e.inicio_local.slice(0, 5), fin_local: e.fin_local.slice(0, 5) })}>Editar</button>}<button className={secondary} disabled={busy} onClick={() => void run(async () => { await mutatePlanner(data, 'eliminar_evento', { id: e.id }); await reload(); }, 'Evento eliminado; recalcula y guarda el plan si quieres conservar el cambio')}>Eliminar</button></div></li>)}</ul></div>
        <form className={`${panel} space-y-4`} onSubmit={e => { e.preventDefault(); void run(async () => { await saveEvento(data, evento); setEvento(emptyEvent(date)); await reload(); }, 'Horario guardado'); }}><h2 className="font-bold">Crear o editar horario</h2><EventFields value={evento} onChange={setEvento} /><div className="flex gap-2"><button type="submit" className={button} disabled={busy}>Guardar horario</button><button type="button" className={secondary} onClick={() => setEvento(emptyEvent(date))}>Nuevo</button></div></form>
      </>}
      {tab === 'parametros' && <form className={`${panel} space-y-4`} onSubmit={e => { e.preventDefault(); void run(async () => { await saveParametros(data, params); await reload(); }, 'Parámetros guardados'); }}><h2 className="font-bold">Parámetros iniciales</h2><div className="grid sm:grid-cols-2 gap-4">{(Object.keys(parameterLabels) as (keyof Parametros)[]).map(key => <Field label={parameterLabels[key]} key={key}><input required className={control} type={typeof DEFAULT_PARAMETROS[key] === 'string' ? 'time' : 'number'} min="0" step={typeof DEFAULT_PARAMETROS[key] === 'string' ? 60 : key === 'margen_min' ? 1 : 0.25} disabled={key === 'factor_calibracion_default'} value={params[key]} onChange={e => setParams({ ...params, [key]: typeof DEFAULT_PARAMETROS[key] === 'string' ? e.target.value : Number(e.target.value) })} /></Field>)}</div><button type="submit" className={button} disabled={busy}>Guardar parámetros</button></form>}
      {tab === 'entregas' && <>
        <div className={panel}><h2 className="font-bold mb-3">Estimaciones de entregas pendientes</h2><p className="text-sm mb-3">Sin estimación se usan 2 h provisionales. Sin mínimo se usa el 25 %, con suelo de 20 min. El factor queda en 1,0.</p><ul className="space-y-3">{activeTasks.map(t => <li key={t.uid} className="flex justify-between gap-3 flex-wrap"><div><strong>{t.titulo}</strong><p className="text-sm">Plazo: {madridLocal(t.deadline_utc).replace('T', ' ')} · {t.horas_est == null ? '2 h provisionales' : hours(Number(t.horas_est))} · {t.tipo_trabajo || 'profundo'} · {t.aplazamientos || 0} aplazamientos</p></div><button className={secondary} onClick={() => editTask(t)}>Editar</button></li>)}</ul></div>
        {task && <form className={`${panel} space-y-4`} onSubmit={e => { e.preventDefault(); void run(async () => {
          if (!Number.isFinite(Number(task.horas_est)) || Number(task.horas_est) <= 0) throw new Error('La estimación debe ser mayor que cero');
          if (!!task.hueco_inicio_local !== !!task.hueco_fin_local) throw new Error('Indica inicio y fin del hueco');
          if (task.hueco_inicio_local && (!validLocal(task.hueco_inicio_local) || !validLocal(task.hueco_fin_local!) || task.hueco_inicio_local >= task.hueco_fin_local! || task.hueco_inicio_local.slice(0, 10) !== task.hueco_fin_local!.slice(0, 10) || task.hueco_inicio_local < madridLocal(new Date()))) throw new Error('El hueco debe ser futuro, válido y dentro del mismo día');
          await mutatePlanner(data, 'entrega', task); setTask(null); await reload();
        }, 'Estimación y preferencias guardadas'); }}><h2 className="font-bold">{task.titulo}</h2><div className="grid sm:grid-cols-2 gap-3">
          <Field label="Horas estimadas"><input required type="number" min="0.1" step="0.1" className={control} value={task.horas_est ?? 2} onChange={e => setTask({ ...task, horas_est: Number(e.target.value) })} /></Field>
          <Field label="Versión mínima · minutos"><input required type="number" min="20" step="1" className={control} value={task.min_viable_min ?? 30} onChange={e => setTask({ ...task, min_viable_min: Number(e.target.value) })} /></Field>
          <Field label="Tipo de trabajo"><select className={control} value={task.tipo_trabajo || 'profundo'} onChange={e => setTask({ ...task, tipo_trabajo: e.target.value as 'profundo' | 'ligero' })}><option value="profundo">Profundo</option><option value="ligero">Ligero</option></select></Field>
          <Field label="Dividir en bloques · minutos, opcional"><input type="number" min="20" step="1" className={control} value={task.tamano_bloque_min || ''} onChange={e => setTask({ ...task, tamano_bloque_min: e.target.value ? Number(e.target.value) : null })} /></Field>
          <Field label="Hueco fijado · inicio Madrid"><input type="datetime-local" className={control} value={task.hueco_inicio_local?.slice(0, 16) || ''} onChange={e => setTask({ ...task, hueco_inicio_local: e.target.value || null })} /></Field>
          <Field label="Hueco fijado · fin Madrid"><input type="datetime-local" className={control} value={task.hueco_fin_local?.slice(0, 16) || ''} onChange={e => setTask({ ...task, hueco_fin_local: e.target.value || null })} /></Field>
        </div><div className="flex gap-2"><button className={button} type="submit" disabled={busy}>Guardar entrega</button><button className={secondary} type="button" onClick={() => setTask(null)}>Cerrar</button></div></form>}
      </>}
    </>}
    {completingTask && <CompleteEntregaDialog title={completingTask.titulo} onCancel={() => setCompletingTask(null)} onComplete={hours => completeWithoutReplanning(completingTask, hours)} />}
    {social && input && plan && data && <div role="dialog" aria-modal="true" aria-label="Añadir plan imprevisto" className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-3 sm:p-6 overflow-y-auto">
      <div className={`${panel} w-full max-w-3xl space-y-4 my-4`}><div className="flex justify-between items-center"><h2 className="text-xl font-bold">Añadir plan imprevisto</h2><button className={secondary} disabled={busy} onClick={() => { setSocial(null); setPreview(null); }}>Cerrar</button></div>
        <p className="text-sm">Semana del {dayLabel(desde)}. Se conserva todo bloque anterior al inicio del evento. Revisa el impacto antes de guardar.</p>
        <form className="space-y-4" onSubmit={e => { e.preventDefault(); setError(''); try { validateEvento(social); setPreview(previewSocial(input, social, plan)); setAcceptDebt(false); } catch (err) { setError(err instanceof Error ? err.message : String(err)); } }}>
          <EventFields social value={social} onChange={e => { setSocial(e); setPreview(null); setAcceptDebt(false); }} />
          <button className={secondary} type="submit" disabled={busy}>Calcular vista previa</button>
        </form>
        {error && <p role="alert" className="text-red-600 dark:text-red-300">{error}</p>}
        {preview && <>
          <div className="space-y-3"><h3 className="font-bold">Bloques que cambian ({preview.movimientos.length})</h3>{!preview.movimientos.length && <p className="text-sm">No se mueve ningún bloque de estudio.</p>}{preview.movimientos.map(m => <div key={m.task_uid} className="text-sm border-t border-slate-200 dark:border-slate-700 pt-2"><strong>{m.titulo}</strong><p>Antes: {m.de.map(b => `${b.fecha} ${b.inicio_local}–${b.fin_local}`).join('; ') || 'sin bloques'}</p><p>Después: {m.a.map(b => `${b.fecha} ${b.inicio_local}–${b.fin_local}${b.version_minima ? ' (mínima)' : ''}`).join('; ') || 'sin hueco, en riesgo'}</p></div>)}</div>
          <p className="text-sm">Pasan a versión mínima: {preview.versiones_minimas.map(uid => data.entregas.find(t => t.uid === uid)?.titulo || uid).join(', ') || 'ninguna'}.</p>
          <div><h3 className="font-bold">En riesgo después del cambio</h3><ul className="text-sm space-y-1">{preview.en_riesgo.map(r => <li key={r.task_uid}>{r.titulo}: {r.motivo} · {hours(r.horas_pendientes)} pendientes.</li>)}</ul></div>
          <p>Deuda nueva: <strong>{hours(preview.horas_nuevas_deuda)}</strong> · acumulada: <strong>{hours(preview.plan.deuda_total_horas)}</strong></p>
          {preview.requiere_confirmacion && <label className="flex gap-2 bg-amber-50 dark:bg-amber-950 rounded-xl p-3 text-sm"><input type="checkbox" checked={acceptDebt} onChange={e => setAcceptDebt(e.target.checked)} /><span>La deuda supera tu máximo de {hours(data.parametros.max_deuda_horas)}. Confirmo que quiero guardar el evento con esta deuda.</span></label>}
          <button className={button} disabled={busy || (preview.requiere_confirmacion && !acceptDebt)} onClick={() => void run(async () => { await confirmSocial(data, social, preview, plan, acceptDebt); setSocial(null); await reload(); }, 'Evento social y plan guardados')}>Confirmar y guardar evento</button>
        </>}
      </div>
    </div>}
  </section>;
}
