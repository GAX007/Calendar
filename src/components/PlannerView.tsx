import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, MoreHorizontal, Plus, RefreshCw, X } from 'lucide-react';
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
import { newId } from '../utils/uuid';
import { checkinBajo, limiteDiaLigero, type EstadoBloque } from '../asistente/logica';
import { ASISTENTE_ACTUALIZADO, cargarEstadosBloques, guardarPlanLigero, marcarBloque, recalcularYGuardarSemana } from '../services/asistenteService';
import { loadTodayCheckin } from '../services/plannerRecordsService';
import type { DailyCheckin as Checkin } from '../planner/records';
import { blockEnd, blockStart, minutes } from '../planner/time';
import { avisosImprevisto } from '../planner/imprevisto';

const control = 'w-full h-11 rounded-xl border border-line-2 bg-white px-3 text-[15px] text-ink outline-none focus:border-ink disabled:opacity-50';
const button = 'h-11 rounded-full bg-ink px-5 text-[15px] font-semibold text-white disabled:opacity-40 active:scale-[0.99] transition';
const secondary = 'h-11 rounded-full border border-line-2 bg-white px-4 text-sm font-semibold text-ink disabled:opacity-40 hover:bg-surface transition';
const iconButton = 'w-11 h-11 rounded-full flex items-center justify-center hover:bg-black/5 disabled:opacity-40';
const rowLine = 'border-b border-hairline';
const hours = (n: number) => `${Number(n.toFixed(2)).toLocaleString('es-ES')} h`;
const dayLabel = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const dayLong = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const dayShort = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', timeZone: 'UTC' });
const dayNames = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const capital = (s: string) => s.replace(/^./, (c) => c.toUpperCase());

type Tab = 'hoy' | 'semana' | 'ajustes' | 'eventos' | 'parametros' | 'entregas';

function Field({ label, children }: { label: string; children: React.ReactNode; key?: string }) {
  return <label className="flex flex-col gap-1 text-[13px] text-ink-2">{label}{children}</label>;
}
function emptyEvent(date: string, social = false): Evento {
  return { id: newId(), titulo: '', inicio_local: '18:00', fin_local: '20:00', dias_semana: null,
    fecha_inicio: date, fecha_fin: null, tipo: social ? 'social' : 'fijo', bloqueo: true, area: social ? 'social' : 'otro' };
}
function Check({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="min-h-11 flex gap-3 items-center text-[15px] text-ink cursor-pointer">
      <input type="checkbox" className="w-5 h-5 accent-[#141517]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {children}
    </label>
  );
}
function EventFields({ value, onChange, social = false }: { value: Evento; onChange: (e: Evento) => void; social?: boolean }) {
  const set = (fields: Partial<Evento>) => onChange({ ...value, ...fields });
  return <div className="grid sm:grid-cols-2 gap-3">
    <Field label="Título"><input required maxLength={200} className={control} value={value.titulo} onChange={e => set({ titulo: e.target.value })} /></Field>
    <Field label={value.dias_semana ? 'Válido desde' : 'Fecha'}><input required type="date" className={control} value={value.fecha_inicio} onChange={e => set({ fecha_inicio: e.target.value })} /></Field>
    <Field label="Inicio"><input required type="time" className={control} value={value.inicio_local.slice(0, 5)} onChange={e => set({ inicio_local: e.target.value })} /></Field>
    <Field label="Fin"><input required type="time" className={control} value={value.fin_local.slice(0, 5)} onChange={e => set({ fin_local: e.target.value })} /></Field>
    {!social && <>
      <Field label="Tipo"><select className={control} value={value.tipo} onChange={e => set({ tipo: e.target.value as Evento['tipo'] })}><option value="fijo">Fijo</option><option value="flexible">Flexible</option></select></Field>
      <Field label="Área"><select className={control} value={value.area} onChange={e => set({ area: e.target.value as Evento['area'] })}>{['clase', 'trabajo', 'clase_particular', 'karate', 'gym', 'otro'].map(a => <option key={a} value={a}>{capital(a.replace('_', ' '))}</option>)}</select></Field>
      <Check checked={value.bloqueo} onChange={v => set({ bloqueo: v })}>Bloquear este horario</Check>
      <Check checked={value.dias_semana !== null} onChange={v => set({ dias_semana: v ? [1] : null, fecha_fin: null })}>Repetir cada semana</Check>
      {value.dias_semana !== null && <>
        <div className="sm:col-span-2 flex gap-1.5 flex-wrap" role="group" aria-label="Días">
          {dayNames.map((name, i) => {
            const on = value.dias_semana!.includes(i + 1);
            return <button key={name} type="button" aria-pressed={on}
              onClick={() => set({ dias_semana: on ? value.dias_semana!.filter(d => d !== i + 1) : [...value.dias_semana!, i + 1].sort() })}
              className={`h-11 min-w-11 px-3 rounded-full text-sm font-semibold border ${on ? 'bg-ink text-white border-ink' : 'bg-white border-line-2'}`}>{name}</button>;
          })}
        </div>
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

function Header({ title, subtitle, children }: { title: string; subtitle: string; children?: React.ReactNode }) {
  return (
    <header className="flex items-start justify-between gap-4">
      <div className="flex flex-col gap-1 min-w-0">
        <span className="text-sm font-medium text-ink-2">{subtitle}</span>
        <h1 className="text-[34px] leading-[1.05] font-semibold tracking-[-0.025em]">{title}</h1>
      </div>
      {children}
    </header>
  );
}

export function PlannerView({ onOpenEntrega }: { onOpenEntrega: (uid: string) => void }) {
  const { user } = useAuth();
  const [data, setData] = useState<PlannerData | null>(null);
  const [now, setNow] = useState(() => madridLocal(new Date()));
  const [date, setDate] = useState(() => madridLocal(new Date()).slice(0, 10));
  const [tab, setTab] = useState<Tab>('hoy');
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
  const [estados, setEstados] = useState<Map<string, EstadoBloque>>(() => new Map());
  const [checkinHoy, setCheckinHoy] = useState<Checkin | null>(null);
  const [abierto, setAbierto] = useState<string | null>(null);
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
    window.addEventListener(ASISTENTE_ACTUALIZADO, onUniversityUpdated);
    return () => {
      window.removeEventListener(CALENDAR_PLANNER_UPDATED, onCalendarUpdated);
      window.removeEventListener(CALENDAR_PLANNER_STATUS, onCalendarStatus);
      window.removeEventListener(UNIVERSITY_PLANNER_UPDATED, onUniversityUpdated);
      window.removeEventListener(ASISTENTE_ACTUALIZADO, onUniversityUpdated);
    };
  }, [user?.id, reload]);
  const today = now.slice(0, 10);
  // "Hecho" / "No lo hice" of the blocks of the visible day
  useEffect(() => {
    if (!user) return;
    let active = true;
    cargarEstadosBloques(user.id, date, date).then(m => { if (active) setEstados(m); }).catch(() => undefined);
    return () => { active = false; };
  }, [user?.id, date]);
  // Today's check-in decides whether today is a lighter day (D3)
  useEffect(() => {
    if (!user) return;
    let active = true;
    loadTodayCheckin(user.id, today).then(c => { if (active) setCheckinHoy(c); }).catch(() => undefined);
    return () => { active = false; };
  }, [user?.id, today]);
  const setBlockState = (b: { id: string; fecha: string }, estado: EstadoBloque) => {
    if (!user) return;
    const next = estados.get(b.id) === estado ? null : estado;
    setEstados(prev => { const m = new Map(prev); if (next) m.set(b.id, next); else m.delete(b.id); return m; });
    void marcarBloque(user.id, b.id, b.fecha, next).catch(e => setError(e instanceof Error ? e.message : String(e)));
  };
  const lightLimit = data ? limiteDiaLigero(data.parametros.max_horas_profundas_dia) : 2;
  const setLightDay = (value: boolean) => user && checkinHoy && void run(async () => {
    await guardarPlanLigero(user.id, today, value);
    setCheckinHoy({ ...checkinHoy, plan_ligero: value });
    await recalcularYGuardarSemana(value ? { [today]: lightLimit } : undefined);
  }, value ? `Hoy, como mucho ${hours(lightLimit)} de trabajo profundo; el resto pasa a otros días` : 'Plan de hoy sin cambios');
  const desde = weekStart(date), hasta = addDays(desde, 6);
  const input: PlanInput | null = data ? { desde, hasta, ahora_local: now, entregas: data.entregas,
    eventos: data.eventos, parametros: data.parametros, bloques_previos: data.bloques, deuda: data.deuda,
    max_profundas_por_dia: checkinHoy?.plan_ligero ? { [checkinHoy.fecha]: limiteDiaLigero(data.parametros.max_horas_profundas_dia) } : undefined } : null;
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
  const syncCalendar = () => user && void run(async () => {
    if (getEffectiveCalendarUrl(user.id, user.email)) {
      const result = await syncLiveGoogleCalendar(user.id, user.email);
      if (!result.success || result.plannerError) throw new Error(result.plannerError || result.error || 'No se pudo sincronizar Calendar');
      await reload(!result.plannerChange?.horarios_cambiados);
    } else await reload();
  }, 'Calendar y planificador actualizados');
  const saveWeek = () => data && plan && void run(async () => {
    if (now !== madridLocal(new Date())) { await reload(); throw new Error('El minuto ha cambiado. Plan actualizado; revisa y vuelve a guardar'); }
    await savePlan(data, plan, hasta, now); await reload();
  }, 'Plan semanal guardado');

  if (!user) {
    return (
      <section className="max-w-2xl mx-auto px-5 flex flex-col gap-4">
        <Header title="Plan de estudio" subtitle="Tus horarios y entregas" />
        <p className="text-[15px] leading-[1.45] text-ink-2">Inicia sesión para guardar tus horarios y parámetros privados en Supabase.</p>
      </section>
    );
  }

  const segment = tab === 'hoy' ? 'hoy' : tab === 'semana' ? 'semana' : 'ajustes';
  const dayBlocks = plan ? plan.bloques.filter(b => b.fecha === date) : [];
  const studyToday = dayBlocks.filter(b => b.task_uid).reduce((n, b) => n + Math.max(0, minutes(b.fin_local.slice(0, 5)) - minutes(b.inicio_local.slice(0, 5))) / 60, 0);
  const maxCarga = plan ? Math.max(4, ...plan.carga.map(c => c.profundas + c.ligeras)) : 4;
  const backToAjustes = (
    <button type="button" onClick={() => setTab('ajustes')} className="self-start h-11 -ml-3 px-3 rounded-full flex items-center gap-1.5 text-sm font-semibold hover:bg-black/5">
      <ArrowLeft className="w-[18px] h-[18px]" strokeWidth={1.75} /> Ajustes
    </button>
  );

  return <section className="max-w-2xl mx-auto px-5 text-ink flex flex-col gap-[22px]">
    <Header title="Plan de estudio" subtitle={`Semana del ${dayShort(desde)} al ${dayShort(hasta)}`}>
      <button type="button" aria-label="Añadir un plan imprevisto" disabled={busy || !plan}
        onClick={() => { setSocial(emptyEvent(date, true)); setPreview(null); setAcceptDebt(false); }}
        className="flex-none w-11 h-11 rounded-full bg-surface-2 flex items-center justify-center active:scale-95 transition disabled:opacity-40">
        <Plus className="w-5 h-5" strokeWidth={1.75} />
      </button>
    </Header>

    {(error || calculation.error) && <p role="alert" className="rounded-2xl bg-red-50 text-red-800 px-4 py-3 text-[14.5px]">{error || calculation.error}</p>}
    {calendarError && <p role="alert" className="rounded-2xl bg-amber-50 text-amber-900 px-4 py-3 text-[14.5px]">{calendarError}</p>}
    {notice && <p role="status" className="rounded-2xl bg-surface px-4 py-3 text-[14.5px]">{notice}</p>}
    {busy && <p role="status" className="text-sm text-ink-2 -mt-2">Guardando o cargando…</p>}

    <nav aria-label="Vistas del plan" className="grid grid-cols-3 gap-0.5 p-[3px] rounded-[15px] bg-surface-2">
      {(['hoy', 'semana', 'ajustes'] as const).map(t => (
        <button key={t} type="button" aria-pressed={segment === t} onClick={() => setTab(t)}
          className={`h-11 rounded-xl text-[14.5px] transition ${segment === t ? 'bg-white font-semibold shadow-[0_1px_2px_rgba(20,21,23,0.08)]' : 'text-ink-2 font-medium'}`}>
          {({ hoy: 'Hoy', semana: 'Semana', ajustes: 'Ajustes' })[t]}
        </button>
      ))}
    </nav>

    {tab === 'hoy' && <DailyCheckin key={user.id} userId={user.id} onSaved={setCheckinHoy} />}
    {tab === 'hoy' && checkinHoy?.fecha === today && checkinBajo(checkinHoy) && checkinHoy.plan_ligero == null && <div role="status" className="rounded-2xl bg-surface px-4 py-4 flex flex-col gap-3">
      <p className="text-base font-semibold">¿Aligero el plan de hoy?</p>
      <p className="text-[14.5px] leading-[1.45] text-slate-700">Tu check-in marca {[Number(checkinHoy.sueno_h) < 6 && `${Number(checkinHoy.sueno_h).toLocaleString('es-ES')} h de sueño`, checkinHoy.energia <= 2 && `energía ${checkinHoy.energia}/5`, checkinHoy.fatiga >= 4 && `fatiga ${checkinHoy.fatiga}/5`].filter(Boolean).join(', ')}. Si quieres, hoy hago como mucho {hours(lightLimit)} de trabajo profundo y paso el resto a otros días.</p>
      <div className="flex gap-2 flex-wrap"><button type="button" className={button} disabled={busy} onClick={() => setLightDay(true)}>Sí, aligera hoy</button><button type="button" className={secondary} disabled={busy} onClick={() => setLightDay(false)}>No, mantén el plan</button></div>
    </div>}
    {tab === 'hoy' && checkinHoy?.fecha === today && checkinHoy.plan_ligero === true && <p className="text-[14.5px] rounded-2xl bg-surface px-4 py-2 flex items-center justify-between gap-2 flex-wrap">Día ligero: hoy como mucho {hours(lightLimit)} de trabajo profundo.<button type="button" className="min-h-11 font-semibold underline underline-offset-4" disabled={busy} onClick={() => setLightDay(false)}>Volver al plan normal</button></p>}

    {data && plan && <>
      {tab === 'hoy' && <>
        <div className="grid grid-cols-3">
          <div className="flex flex-col gap-1">
            <span className="text-[26px] font-semibold tracking-[-0.02em]">{hours(studyToday)}</span>
            <span className="text-[13px] text-ink-2">de estudio {date === today ? 'hoy' : 'ese día'}</span>
          </div>
          <div className="flex flex-col gap-1 pl-4 border-l border-line">
            <span className="text-[26px] font-semibold tracking-[-0.02em]">{hours(plan.deuda_total_horas)}</span>
            <span className="text-[13px] text-ink-2">de deuda</span>
          </div>
          <div className="flex flex-col gap-1 pl-4 border-l border-line">
            <span className="text-[26px] font-semibold tracking-[-0.02em]">{plan.en_riesgo.length}</span>
            <span className="text-[13px] text-ink-2">en riesgo</span>
          </div>
        </div>

        {!saved && <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface pl-4 pr-2 py-2">
          <span className="text-[14.5px] text-slate-700">Propuesta sin guardar</span>
          <button type="button" className={secondary} disabled={busy || hasta < today} onClick={saveWeek}>Guardar semana</button>
        </div>}
        {!data.eventos.length && <p className="text-[14.5px] rounded-2xl bg-amber-50 text-amber-900 px-4 py-3">Todavía no has añadido horarios fijos. Este plan considera libres todas las horas de tus parámetros. Añade clases, trabajo, entrenos y ocio en Ajustes › Horarios fijos.</p>}

        <section aria-labelledby="h-bloques" className="flex flex-col">
          <div className="flex items-center justify-between gap-2 mb-1">
            <h2 id="h-bloques" className="text-[17px] font-semibold">{date === today ? 'Bloques de hoy' : capital(dayLong(date))}</h2>
            <div className="flex items-center -mr-2">
              {date !== today && <button type="button" className="h-11 px-3 rounded-full text-sm font-semibold hover:bg-black/5" onClick={() => { setDate(today); setPreview(null); }}>Hoy</button>}
              <button type="button" className={iconButton} aria-label="Día anterior" onClick={() => { setDate(addDays(date, -1)); setPreview(null); }}><ChevronLeft className="w-5 h-5" strokeWidth={1.75} /></button>
              <button type="button" className={iconButton} aria-label="Día siguiente" onClick={() => { setDate(addDays(date, 1)); setPreview(null); }}><ChevronRight className="w-5 h-5" strokeWidth={1.75} /></button>
            </div>
          </div>
          {!dayBlocks.length && <p className="py-8 text-center text-[15px] text-ink-2">Sin bloques para este día.</p>}
          {dayBlocks.map(b => {
            const t = data.entregas.find(t => t.uid === b.task_uid);
            const started = Boolean(b.task_uid) && blockStart(b) <= now && t?.estado === 'pendiente';
            const canAct = Boolean(b.task_uid) && date >= today && t?.estado === 'pendiente';
            const estado = estados.get(b.id);
            const dot = b.tipo === 'social' ? 'bg-[#E5489D]' : b.task_uid ? 'bg-ink' : 'bg-line-3';
            const meta = [t?.es_examen && 'Estudio de examen', b.tipo, b.version_minima && 'versión mínima'].filter(Boolean).join(' · ');
            return <div key={b.id} className={`py-3.5 flex flex-col gap-2.5 ${rowLine}`}>
              <div className="grid grid-cols-[50px_minmax(0,1fr)_44px] gap-3 items-start">
                <div className="flex flex-col gap-0.5 pt-px font-mono text-[13px] font-medium leading-[1.3]">
                  <span>{b.inicio_local}</span>
                  <span className="text-ink-3">{b.fin_local}</span>
                </div>
                <div className="min-w-0 flex flex-col gap-[3px]">
                  {b.task_uid
                    ? <button type="button" className="text-left text-base leading-[1.3] font-medium hover:underline underline-offset-4" aria-label={`${b.task_uid.startsWith('uni:') ? 'Ver deber o examen' : 'Ver entrega Moodle'}: ${b.titulo}`} onClick={() => onOpenEntrega(b.task_uid!)}>{b.titulo}</button>
                    : <span className="text-base leading-[1.3] font-medium">{b.titulo}</span>}
                  <span className="flex items-center gap-[7px] text-[13.5px] text-ink-2"><span className={`w-2 h-2 rounded-full flex-none ${dot}`} />{capital(meta)}</span>
                  {t?.estado === 'hecha' && <span className="text-[13px] font-medium text-emerald-700">Completada</span>}
                  {b.estimacion_por_defecto && <span className="text-[13px] text-ink-2">Estimación provisional de 2 h; ajústala en Estimaciones.</span>}
                  {t?.horas_ia != null && Number(t.horas_ia) === Number(t.horas_est) && <span className="text-[13px] text-ink-2">Estimación de la IA: {hours(Number(t.horas_ia))}{t.estimacion_ia_nota ? `. ${t.estimacion_ia_nota}` : ''}</span>}
                  {b.tipo === 'flexible' && !data.eventos.find(e => e.id === b.evento_id)?.bloqueo && <span className="text-[13px] text-ink-2">Preferencia flexible; permite estudio encima.</span>}
                </div>
                {canAct
                  ? <button type="button" className={iconButton} aria-expanded={abierto === b.id} aria-label={`Opciones de ${b.titulo}`} onClick={() => setAbierto(abierto === b.id ? null : b.id)}><MoreHorizontal className="w-5 h-5" strokeWidth={1.75} /></button>
                  : <span />}
              </div>
              {started && <div className="pl-[62px] flex flex-col gap-2">
                <div className="flex gap-2">
                  {(['hecho', 'no_hecho'] as const).map(e => <button key={e} type="button" aria-pressed={estado === e} onClick={() => setBlockState(b, e)}
                    className={`h-10 px-3.5 rounded-full text-sm font-semibold border-[1.5px] transition ${estado === e ? 'bg-ink border-ink text-white' : 'bg-white border-line-3 text-ink'}`}>
                    {e === 'hecho' ? 'Hecho' : 'No lo hice'}</button>)}
                </div>
                <span className="text-[13px] text-ink-2">{estado === 'hecho' ? 'Cuenta como trabajo hecho.' : estado === 'no_hecho' ? 'Esta noche lo vuelvo a planificar.' : blockEnd(b) <= now ? 'Si no lo marcas como hecho, esta noche lo replanifico.' : 'En curso.'}</span>
              </div>}
              {canAct && abierto === b.id && t && <div className="pl-[62px] flex gap-2 flex-wrap">
                {(['hecha', 'aplazar', 'no_completada'] as const).map(a => <button key={a} type="button" className={secondary} disabled={busy} onClick={() => { setAbierto(null); void taskAction(t, a); }}>{({ hecha: 'Entrega completada', aplazar: 'Pasar al día siguiente', no_completada: 'No completada' })[a]}</button>)}
              </div>}
            </div>;
          })}
        </section>

        <section aria-labelledby="h-riesgo" className="flex flex-col gap-2">
          <h2 id="h-riesgo" className="text-[17px] font-semibold flex items-center gap-2">{plan.en_riesgo.length > 0 && <span className="w-2 h-2 rounded-full bg-alerta" />}En riesgo</h2>
          {!plan.en_riesgo.length && <p className="text-[14.5px] text-ink-2">Todas las entregas tienen hueco suficiente.</p>}
          {plan.en_riesgo.map(r => {
            const t = data.entregas.find(t => t.uid === r.task_uid);
            return <div key={r.task_uid} className="flex items-center justify-between gap-3 rounded-2xl border border-line pl-4 pr-2 py-3">
              <div className="min-w-0 flex flex-col gap-[3px]">
                <button type="button" className="text-left text-[15.5px] font-medium hover:underline underline-offset-4" aria-label={`${r.task_uid.startsWith('uni:') ? 'Ver deber o examen en riesgo' : 'Ver entrega Moodle en riesgo'}: ${r.titulo}`} onClick={() => onOpenEntrega(r.task_uid)}>{r.titulo}</button>
                <span className="text-[13.5px] text-ink-2">{r.motivo} · faltan {hours(r.horas_pendientes)}</span>
              </div>
              {t && <button type="button" className="flex-none h-11 rounded-full bg-ink px-4 text-sm font-semibold text-white active:scale-[0.99] transition" onClick={() => editTask(t)}>Ajustar</button>}
            </div>;
          })}
          {plan.criticas.length > 0 && <p className="text-[13.5px] text-ink-2">Con poca holgura (más del 60 % de tus horas libres hasta el plazo): {plan.criticas.map(c => `${c.titulo} (${c.presion == null ? 'sin horas' : `${Math.round(c.presion * 100)} %`})`).join(', ')}.</p>}
        </section>

        {activeTasks.some(t => t.es_examen) && <section className="flex flex-col gap-2">
          <h2 className="text-[17px] font-semibold">Exámenes</h2>
          {activeTasks.filter(t => t.es_examen).map(t => {
            const sessions = (plan.proyeccion || plan.bloques).filter(b => b.task_uid === t.uid);
            return <div key={t.uid} className={`py-2.5 flex flex-col gap-[3px] ${rowLine}`}>
              <button type="button" className="text-left text-[15.5px] font-medium hover:underline underline-offset-4" onClick={() => onOpenEntrega(t.uid)}>{t.titulo}</button>
              <span className="text-[13.5px] text-ink-2">{t.horas_est} h estimadas · examen {madridLocal(t.deadline_utc).replace('T', ' a las ')} · {sessions.length} sesiones</span>
              <span className="text-[13px] text-ink-2">{sessions.map(b => `${dayLabel(b.fecha)} ${b.inicio_local}–${b.fin_local}`).join(' · ') || 'Sin sesiones disponibles; revisa el riesgo.'}</span>
            </div>;
          })}
        </section>}

        {plan.avisos_aplazamiento.map(a => { const t = data.entregas.find(t => t.uid === a.task_uid)!; return <div className="rounded-2xl bg-surface px-4 py-4 flex flex-col gap-3" key={a.task_uid}>
          <p className="text-base font-semibold">{a.titulo}: {a.aplazamientos} aplazamientos</p>
          <p className="text-[14.5px] text-slate-700 -mt-1">Elige cómo abordar esta entrega.</p>
          <div className="flex gap-2 flex-wrap"><button type="button" className={secondary} onClick={() => editTask(t, true)}>Dividirla</button><button type="button" className={secondary} disabled={busy} onClick={() => void taskAction(t, 'descartada')}>Descartarla</button><button type="button" className={secondary} onClick={() => editTask(t)}>Fijar un hueco</button></div>
        </div>; })}
      </>}

      {tab === 'semana' && <div className="flex flex-col gap-[18px]">
        <div className="flex items-center justify-between gap-2 -mt-1">
          <span className="text-[15px] font-medium">Semana del {dayShort(desde)}</span>
          <div className="flex items-center -mr-2">
            <button type="button" className={iconButton} aria-label="Semana anterior" onClick={() => { setDate(addDays(date, -7)); setPreview(null); }}><ChevronLeft className="w-5 h-5" strokeWidth={1.75} /></button>
            <button type="button" className={iconButton} aria-label="Semana siguiente" onClick={() => { setDate(addDays(date, 7)); setPreview(null); }}><ChevronRight className="w-5 h-5" strokeWidth={1.75} /></button>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 text-[13px] text-ink-2">
          <span className="flex items-center gap-3.5">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[3px] bg-ink" />Profundo</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[3px] bg-check-2" />Ligero</span>
          </span>
          <span className="font-mono">deuda {hours(plan.deuda_total_horas)}</span>
        </div>
        <div className="flex flex-col">
          {plan.carga.map(c => {
            const total = c.profundas + c.ligeras;
            const esHoy = c.fecha === today;
            return <button key={c.fecha} type="button" onClick={() => { setDate(c.fecha); setTab('hoy'); }}
              className={`grid grid-cols-[72px_minmax(0,1fr)_56px] gap-3 items-center min-h-[52px] text-left ${rowLine}`}>
              <span className={`flex items-center gap-1.5 text-[15px] capitalize ${esHoy ? 'font-semibold' : ''}`}><span className={`w-1.5 h-1.5 rounded-full ${esHoy ? 'bg-accent' : 'bg-transparent'}`} />{dayLabel(c.fecha).replace(',', '').split(' ').slice(0, 2).join(' ')}</span>
              <span aria-hidden="true" className="flex gap-0.5 h-2.5">
                <span className="rounded-[3px] bg-ink" style={{ width: `${(c.profundas / maxCarga) * 100}%` }} />
                <span className="rounded-[3px] bg-check-2" style={{ width: `${(c.ligeras / maxCarga) * 100}%` }} />
              </span>
              <span className="text-right font-mono text-[13px] text-slate-700">{total ? hours(total) : 'libre'}</span>
            </button>;
          })}
        </div>
        <button type="button" className={`${button} h-[52px]`} disabled={busy || hasta < today} onClick={saveWeek}>{saved ? 'Plan guardado · guardar de nuevo' : 'Guardar plan semanal'}</button>
      </div>}

      {tab === 'ajustes' && <div className="flex flex-col gap-[22px]">
        <div className="flex flex-col border-t border-hairline">
          {([
            ['eventos', 'Horarios fijos', `${data.eventos.length} ${data.eventos.length === 1 ? 'horario' : 'horarios'}: clases, trabajo, entrenos`],
            ['parametros', 'Parámetros', `Día de ${data.parametros.hora_inicio_dia.slice(0, 5)} a ${data.parametros.hora_fin_dia.slice(0, 5)} · máx. ${data.parametros.max_horas_profundas_dia} h profundas`],
            ['entregas', 'Estimaciones', `${activeTasks.length} ${activeTasks.length === 1 ? 'entrega pendiente' : 'entregas pendientes'}`],
          ] as const).map(([id, title, sub]) => (
            <button key={id} type="button" onClick={() => setTab(id)} className={`min-h-[68px] py-3 flex items-center justify-between gap-3 text-left ${rowLine}`}>
              <span className="flex flex-col gap-[3px] min-w-0"><span className="text-base font-medium">{title}</span><span className="text-[13.5px] text-ink-2">{sub}</span></span>
              <ChevronRight className="w-[18px] h-[18px] text-ink-3 flex-none" strokeWidth={1.75} />
            </button>
          ))}
        </div>
        <button type="button" className={`${secondary} h-12 flex items-center justify-center gap-2 text-[15px]`} disabled={busy} onClick={syncCalendar}>
          <RefreshCw className="w-[18px] h-[18px]" strokeWidth={1.75} /> Actualizar desde Google Calendar
        </button>
      </div>}

      {tab === 'eventos' && <div className="flex flex-col gap-[22px]">
        {backToAjustes}
        <section className="flex flex-col">
          <h2 className="text-[17px] font-semibold mb-1">Horarios fijos</h2>
          {!data.eventos.length && <p className="py-4 text-[14.5px] text-ink-2">Aún no hay horarios.</p>}
          {data.eventos.map(e => <div key={e.id} className={`py-3 flex gap-3 items-center justify-between ${rowLine}`}>
            <div className="min-w-0 flex flex-col gap-[3px]"><span className="text-base font-medium">{e.titulo}</span><span className="text-[13.5px] text-ink-2">{e.inicio_local.slice(0, 5)}–{e.fin_local.slice(0, 5)} · {e.tipo} · {e.dias_semana?.map(d => dayNames[d - 1]).join(', ') || e.fecha_inicio}{e.fecha_fin && ` · hasta ${e.fecha_fin}`}</span></div>
            <div className="flex gap-1 flex-none">
              {e.tipo !== 'social' && <button type="button" className={secondary} onClick={() => setEvento({ ...e, inicio_local: e.inicio_local.slice(0, 5), fin_local: e.fin_local.slice(0, 5) })}>Editar</button>}
              <button type="button" className={iconButton} aria-label={`Eliminar ${e.titulo}`} disabled={busy} onClick={() => void run(async () => { await mutatePlanner(data, 'eliminar_evento', { id: e.id }); await reload(); }, 'Evento eliminado; recalcula y guarda el plan si quieres conservar el cambio')}><X className="w-[18px] h-[18px]" strokeWidth={1.75} /></button>
            </div>
          </div>)}
        </section>
        <form className="rounded-3xl bg-surface p-4 flex flex-col gap-4" onSubmit={e => { e.preventDefault(); void run(async () => { await saveEvento(data, evento); setEvento(emptyEvent(date)); await reload(); }, 'Horario guardado'); }}>
          <h2 className="text-[17px] font-semibold">{data.eventos.some(e => e.id === evento.id) ? 'Editar horario' : 'Nuevo horario'}</h2>
          <EventFields value={evento} onChange={setEvento} />
          <div className="flex gap-2"><button type="submit" className={button} disabled={busy}>Guardar horario</button><button type="button" className={secondary} onClick={() => setEvento(emptyEvent(date))}>Vaciar</button></div>
        </form>
      </div>}

      {tab === 'parametros' && <div className="flex flex-col gap-[22px]">
        {backToAjustes}
        <form className="flex flex-col gap-4" onSubmit={e => { e.preventDefault(); void run(async () => { await saveParametros(data, params); await reload(); }, 'Parámetros guardados'); }}>
          <h2 className="text-[17px] font-semibold">Parámetros</h2>
          <div className="grid sm:grid-cols-2 gap-4">{(Object.keys(parameterLabels) as (keyof Parametros)[]).map(key => <Field label={parameterLabels[key]} key={key}><input required className={control} type={typeof DEFAULT_PARAMETROS[key] === 'string' ? 'time' : 'number'} min="0" step={typeof DEFAULT_PARAMETROS[key] === 'string' ? 60 : key === 'margen_min' ? 1 : 0.25} disabled={key === 'factor_calibracion_default'} value={params[key]} onChange={e => setParams({ ...params, [key]: typeof DEFAULT_PARAMETROS[key] === 'string' ? e.target.value : Number(e.target.value) })} /></Field>)}</div>
          <button type="submit" className={`${button} self-start`} disabled={busy}>Guardar parámetros</button>
        </form>
      </div>}

      {tab === 'entregas' && <div className="flex flex-col gap-[22px]">
        {backToAjustes}
        <section className="flex flex-col">
          <h2 className="text-[17px] font-semibold">Estimaciones</h2>
          <p className="text-[13.5px] text-ink-2 mt-1 mb-2">Sin estimación se usan 2 h provisionales. Sin mínimo se usa el 25 %, con suelo de 20 min.</p>
          {activeTasks.map(t => <div key={t.uid} className={`py-3 flex justify-between items-center gap-3 ${rowLine}`}>
            <div className="min-w-0 flex flex-col gap-[3px]"><span className="text-base font-medium">{t.titulo}</span><span className="text-[13.5px] text-ink-2">{madridLocal(t.deadline_utc).replace('T', ' ')} · {t.horas_est == null ? '2 h provisionales' : hours(Number(t.horas_est))}{t.horas_ia != null && Number(t.horas_ia) === Number(t.horas_est) ? ' (IA)' : ''} · {t.tipo_trabajo || 'profundo'} · {t.aplazamientos || 0} aplazamientos</span></div>
            <button type="button" className={`${secondary} flex-none`} onClick={() => editTask(t)}>Editar</button>
          </div>)}
        </section>
        {task && <form className="rounded-3xl bg-surface p-4 flex flex-col gap-4" onSubmit={e => { e.preventDefault(); void run(async () => {
          if (!Number.isFinite(Number(task.horas_est)) || Number(task.horas_est) <= 0) throw new Error('La estimación debe ser mayor que cero');
          if (!!task.hueco_inicio_local !== !!task.hueco_fin_local) throw new Error('Indica inicio y fin del hueco');
          if (task.hueco_inicio_local && (!validLocal(task.hueco_inicio_local) || !validLocal(task.hueco_fin_local!) || task.hueco_inicio_local >= task.hueco_fin_local! || task.hueco_inicio_local.slice(0, 10) !== task.hueco_fin_local!.slice(0, 10) || task.hueco_inicio_local < madridLocal(new Date()))) throw new Error('El hueco debe ser futuro, válido y dentro del mismo día');
          await mutatePlanner(data, 'entrega', task); setTask(null); await reload();
        }, 'Estimación y preferencias guardadas'); }}>
          <h2 className="text-[17px] font-semibold">{task.titulo}</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Horas estimadas"><input required type="number" min="0.1" step="0.1" className={control} value={task.horas_est ?? 2} onChange={e => setTask({ ...task, horas_est: Number(e.target.value) })} /></Field>
            <Field label="Versión mínima · minutos"><input required type="number" min="20" step="1" className={control} value={task.min_viable_min ?? 30} onChange={e => setTask({ ...task, min_viable_min: Number(e.target.value) })} /></Field>
            <Field label="Tipo de trabajo"><select className={control} value={task.tipo_trabajo || 'profundo'} onChange={e => setTask({ ...task, tipo_trabajo: e.target.value as 'profundo' | 'ligero' })}><option value="profundo">Profundo</option><option value="ligero">Ligero</option></select></Field>
            <Field label="Dividir en bloques · minutos, opcional"><input type="number" min="20" step="1" className={control} value={task.tamano_bloque_min || ''} onChange={e => setTask({ ...task, tamano_bloque_min: e.target.value ? Number(e.target.value) : null })} /></Field>
            <Field label="Hueco fijado · inicio"><input type="datetime-local" className={control} value={task.hueco_inicio_local?.slice(0, 16) || ''} onChange={e => setTask({ ...task, hueco_inicio_local: e.target.value || null })} /></Field>
            <Field label="Hueco fijado · fin"><input type="datetime-local" className={control} value={task.hueco_fin_local?.slice(0, 16) || ''} onChange={e => setTask({ ...task, hueco_fin_local: e.target.value || null })} /></Field>
          </div>
          <div className="flex gap-2"><button className={button} type="submit" disabled={busy}>Guardar</button><button className={secondary} type="button" onClick={() => setTask(null)}>Cerrar</button></div>
        </form>}
      </div>}
    </>}

    {completingTask && <CompleteEntregaDialog title={completingTask.titulo} onCancel={() => setCompletingTask(null)} onComplete={hours => completeWithoutReplanning(completingTask, hours)} />}
    {social && input && plan && data && <div role="dialog" aria-modal="true" aria-label="Añadir plan imprevisto" className="fixed inset-0 bg-ink/40 z-[95] flex items-end sm:items-center justify-center sm:p-6" onClick={() => { if (!busy) { setSocial(null); setPreview(null); } }}>
      <div className="w-full sm:max-w-2xl max-h-[92dvh] overflow-y-auto rounded-t-[28px] sm:rounded-3xl bg-white px-5 pt-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] flex flex-col gap-4 animate-subir" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-start gap-3">
          <div>
            <h2 className="text-2xl font-semibold tracking-[-0.02em]">Plan imprevisto</h2>
            <p className="text-[14px] text-ink-2 mt-1">Semana del {dayShort(desde)}. Revisa el impacto antes de guardar.</p>
          </div>
          <button type="button" aria-label="Cerrar" className={`${iconButton} -mr-2 flex-none`} disabled={busy} onClick={() => { setSocial(null); setPreview(null); }}><X className="w-5 h-5" strokeWidth={1.75} /></button>
        </div>
        <form className="flex flex-col gap-4" onSubmit={e => { e.preventDefault(); setError(''); try { validateEvento(social); setPreview(previewSocial(input, social, plan)); setAcceptDebt(false); } catch (err) { setError(err instanceof Error ? err.message : String(err)); } }}>
          <EventFields social value={social} onChange={e => { setSocial(e); setPreview(null); setAcceptDebt(false); }} />
          <button className={`${secondary} self-start`} type="submit" disabled={busy}>Ver cómo cambia el plan</button>
        </form>
        {error && <p role="alert" className="rounded-2xl bg-red-50 text-red-800 px-4 py-3 text-[14.5px]">{error}</p>}
        {preview && <>
          {avisosImprevisto(preview, plan, data.entregas, now).map(a => (
            <p key={a.task_uid} role="alert" className="rounded-2xl bg-red-50 text-red-800 px-4 py-3 text-[14.5px] font-medium">{a.texto}</p>
          ))}
          {preview.recortes.map(r => (
            <p key={r.id} className="text-[14px] text-ink-2">El bloque en curso que empezó a las {r.inicio_local} se acorta y termina a las {r.fin_local}.</p>
          ))}
          <div className="flex flex-col">
            <h3 className="text-[15px] font-semibold mb-1">Bloques que cambian ({preview.movimientos.length})</h3>
            {!preview.movimientos.length && <p className="text-[14.5px] text-ink-2">No se mueve ningún bloque de estudio.</p>}
            {preview.movimientos.map(m => <div key={m.task_uid} className={`py-2.5 text-[14px] flex flex-col gap-0.5 ${rowLine}`}><span className="font-medium">{m.titulo}</span><span className="text-ink-2">Antes: {m.de.map(b => `${b.fecha} ${b.inicio_local}–${b.fin_local}`).join('; ') || 'sin bloques'}</span><span className="text-ink-2">Después: {m.a.map(b => `${b.fecha} ${b.inicio_local}–${b.fin_local}${b.version_minima ? ' (mínima)' : ''}`).join('; ') || 'sin hueco, en riesgo'}</span></div>)}
          </div>
          <p className="text-[14px] text-slate-700">Pasan a versión mínima: {preview.versiones_minimas.map(uid => data.entregas.find(t => t.uid === uid)?.titulo || uid).join(', ') || 'ninguna'}.</p>
          {preview.en_riesgo.length > 0 && <div><h3 className="text-[15px] font-semibold">En riesgo después del cambio</h3><ul className="text-[14px] text-slate-700 space-y-1 mt-1">{preview.en_riesgo.map(r => <li key={r.task_uid}>{r.titulo}: {r.motivo} · {hours(r.horas_pendientes)} pendientes</li>)}</ul></div>}
          <p className="text-[15px]">Deuda nueva: <strong>{hours(preview.horas_nuevas_deuda)}</strong> · acumulada: <strong>{hours(preview.plan.deuda_total_horas)}</strong></p>
          {preview.requiere_confirmacion && <label className="flex gap-3 items-start rounded-2xl bg-amber-50 text-amber-900 p-4 text-[14px]"><input type="checkbox" className="w-5 h-5 mt-0.5 accent-[#141517]" checked={acceptDebt} onChange={e => setAcceptDebt(e.target.checked)} /><span>La deuda supera tu máximo de {hours(data.parametros.max_deuda_horas)}. Confirmo que quiero guardar el evento con esta deuda.</span></label>}
          <button type="button" className={`${button} h-[52px]`} disabled={busy || (preview.requiere_confirmacion && !acceptDebt)} onClick={() => void run(async () => { await confirmSocial(data, social, preview, plan, acceptDebt); setSocial(null); await reload(); }, 'Evento social y plan guardados')}>Guardar el plan imprevisto</button>
        </>}
      </div>
    </div>}
  </section>;
}
