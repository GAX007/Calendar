import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Bell, BellOff, BarChart3, CalendarClock, Moon, Sparkles, Undo2, X } from 'lucide-react';
import type { RepasoSemanal, ResumenManana } from '../asistente/logica';
import { addMinutesLocal, avisosVisibles, cuandoVence } from '../asistente/logica';
import { addDays, madridLocal } from '../planner/time';
import {
  ASISTENTE_ACTUALIZADO, activarPush, actualizarBadge, cargarAvisos, cargarCierre, cargarRepasoReciente, cargarResumen,
  deshacerCierre, desactivarPush, ejecutarTarea, estadoPush, marcarAvisoLeido,
  type AvisoGuardado, type CierreGuardado, type EstadoPush,
} from '../services/asistenteService';
import { haptic } from '../utils/haptics';

const num = (n: number | null) => Number((n ?? 0).toFixed(2)).toLocaleString('es-ES');
const hours = (n: number) => `${num(n)} h`;
const entregas = (n: number) => `${n} ${n === 1 ? 'entrega' : 'entregas'}`;
const card = 'rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm';
const chip = 'min-h-11 inline-flex items-center gap-1.5 rounded-xl px-3 text-sm font-semibold';

interface Props {
  userId: string;
  onOpenPlanner: () => void;
  showToast: (message: string) => void;
}

export function AsistentePanel({ userId, onOpenPlanner, showToast }: Props) {
  const [resumen, setResumen] = useState<ResumenManana | null>(null);
  const [cierre, setCierre] = useState<CierreGuardado | null>(null);
  const [avisos, setAvisos] = useState<AvisoGuardado[]>([]);
  const [repaso, setRepaso] = useState<RepasoSemanal | null>(null);
  const [push, setPush] = useState<EstadoPush>('no_soportado');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [todosAvisos, setTodosAvisos] = useState(false);
  const [verRepaso, setVerRepaso] = useState(() => new URLSearchParams(window.location.search).has('repaso'));

  const cargar = useCallback(async () => {
    const ahora = madridLocal(new Date()), hoy = ahora.slice(0, 10);
    try {
      const [r, c, a, s] = await Promise.all([
        cargarResumen(userId, hoy, 'manana'), cargarCierre(userId, addDays(hoy, -1)), cargarAvisos(userId),
        cargarRepasoReciente(userId, addDays(hoy, -3)),
      ]);
      setResumen(r); setCierre(c); setAvisos(avisosVisibles(a, Date.now())); setRepaso(s); setError('');
      if (r) actualizarBadge(r.entregas.filter(e => e.vence_local > ahora && e.vence_local <= addMinutesLocal(ahora, 48 * 60)).length);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    estadoPush().then(setPush).catch(() => setPush('no_soportado'));
  }, [userId]);

  useEffect(() => {
    void cargar();
    const onVisible = () => { if (document.visibilityState === 'visible') void cargar(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener(ASISTENTE_ACTUALIZADO, cargar);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener(ASISTENTE_ACTUALIZADO, cargar);
    };
  }, [cargar]);

  const accion = async (nombre: string, fn: () => Promise<void>, ok?: string) => {
    setBusy(nombre); setError('');
    try { await fn(); if (ok) showToast(ok); haptic(10); await cargar(); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(''); }
  };

  const descartar = (clave: string) => {
    setAvisos(prev => prev.filter(a => a.clave !== clave));
    void marcarAvisoLeido(userId, clave).catch(() => undefined);
  };

  const hoy = madridLocal(new Date()).slice(0, 10);
  const cierreAplicado = cierre?.estado === 'aplicado' && cierre.items.length > 0 ? cierre : null;

  return (
    <section aria-label="Asistente" className={`${card} flex flex-col gap-3`}>
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-300 flex items-center justify-center shrink-0">
            <Sparkles className="w-4.5 h-4.5" />
          </span>
          <div className="min-w-0">
            <h2 className="font-bold text-slate-900 dark:text-white leading-tight">Tu día</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
              {resumen ? `Parte preparado a las ${resumen.generado_local.slice(11, 16)}` : 'Asistente nocturno'}
            </p>
          </div>
        </div>
        <PushBoton estado={push} busy={busy === 'push'} onActivar={() => accion('push', activarPush, 'Avisos activados en este dispositivo')}
          onDesactivar={() => accion('push', desactivarPush, 'Avisos desactivados')} />
      </header>

      {error && <p role="alert" className="text-sm rounded-xl bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-200 px-3 py-2">{error}</p>}

      {avisos.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label="Avisos">
          {avisos.slice(0, todosAvisos ? avisos.length : 3).map(a => (
            <li key={a.clave} className={`flex items-start gap-2 rounded-xl px-3 py-2 ${a.tipo === 'sin_hacer' || a.tipo === 'entrega_24h' ? 'bg-amber-50 dark:bg-amber-950/40' : 'bg-slate-50 dark:bg-slate-800/60'}`}>
              {a.tipo === 'bloque' ? <CalendarClock className="w-4 h-4 mt-0.5 shrink-0 text-indigo-500" /> : <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />}
              <button type="button" className="flex-1 text-left min-w-0" onClick={() => { descartar(a.clave); onOpenPlanner(); }}>
                <span className="block text-sm font-semibold text-slate-900 dark:text-white">{a.titulo}</span>
                <span className="block text-xs text-slate-600 dark:text-slate-300 mt-0.5">{a.cuerpo}</span>
              </button>
              <button type="button" aria-label="Descartar aviso" onClick={() => descartar(a.clave)} className="-mr-1 -mt-1 w-9 h-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
                <X className="w-4 h-4" />
              </button>
            </li>
          ))}
          {!todosAvisos && avisos.length > 3 && <li><button type="button" onClick={() => setTodosAvisos(true)} className="min-h-11 px-1 text-sm font-semibold text-indigo-600 dark:text-indigo-300">
            {avisos.length === 4 ? 'Ver 1 aviso más' : `Ver ${avisos.length - 3} avisos más`}</button></li>}
        </ul>
      )}

      {cierreAplicado && (
        <div className="rounded-xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50/70 dark:bg-indigo-950/40 px-3 py-2.5">
          <p className="text-sm text-slate-800 dark:text-slate-100 flex items-start gap-2">
            <Moon className="w-4 h-4 mt-0.5 shrink-0 text-indigo-500" />
            <span>Anoche moví {cierreAplicado.items.length === 1 ? 'un bloque que no marcaste como hecho' : `${cierreAplicado.items.length} bloques que no marcaste como hechos`} y rehíce el plan:{' '}
              {cierreAplicado.items.map(i => `${i.titulo} (${i.inicio_local}–${i.fin_local})`).join(', ')}.</span>
          </p>
          <button type="button" disabled={Boolean(busy)} onClick={() => accion('deshacer', () => deshacerCierre(cierreAplicado.fecha), 'Cierre deshecho: esos bloques cuentan como hechos')}
            className={`${chip} mt-2 border border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-200 disabled:opacity-50`}>
            <Undo2 className="w-4 h-4" /> {busy === 'deshacer' ? 'Deshaciendo…' : 'Sí los hice, deshacer'}
          </button>
        </div>
      )}

      {resumen ? (
        <>
          <p className="text-sm text-slate-700 dark:text-slate-200">{resumen.texto}</p>
          {resumen.dia_ligero && <p className="text-xs text-emerald-700 dark:text-emerald-300">Hoy es un día ligero: menos trabajo profundo.</p>}
          <details className="group">
            <summary className="cursor-pointer text-sm font-semibold text-indigo-600 dark:text-indigo-300 min-h-11 flex items-center">Ver el detalle</summary>
            <div className="grid sm:grid-cols-2 gap-3 pt-1 text-sm">
              <Lista titulo="Clases y horarios" vacio="Nada fijo hoy." items={resumen.clases.map(c => `${c.inicio}–${c.fin} · ${c.titulo}`)} />
              <Lista titulo="Estudio" vacio="Sin bloques de estudio." items={resumen.bloques.map(b => `${b.inicio}–${b.fin} · ${b.titulo}`)} />
              <Lista titulo="Entregas en 72 h" vacio="Ninguna." items={resumen.entregas.map(e => `${e.titulo} · ${cuandoVence(e.vence_local, hoy)} · ${hours(e.horas_planificadas)} planificadas`)} />
              <Lista titulo="En riesgo" vacio="Nada en riesgo." items={resumen.en_riesgo.map(r => `${r.titulo} · faltan ${hours(r.horas_pendientes)}`)} />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">Deuda acumulada: {hours(resumen.deuda_horas)}</p>
          </details>
        </>
      ) : (
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-sm text-slate-600 dark:text-slate-300">El parte se prepara cada mañana a las 07:00.</p>
          <button type="button" disabled={Boolean(busy)} onClick={() => accion('parte', async () => { await ejecutarTarea('parte'); }, 'Parte de hoy preparado')}
            className={`${chip} border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 disabled:opacity-50`}>
            {busy === 'parte' ? 'Preparando…' : 'Prepararlo ahora'}
          </button>
        </div>
      )}

      {repaso && (
        <button type="button" onClick={() => setVerRepaso(true)} className={`${chip} self-start bg-slate-900 dark:bg-white text-white dark:text-slate-900`}>
          <BarChart3 className="w-4 h-4" /> Ver tu repaso semanal
        </button>
      )}
      {repaso && verRepaso && <RepasoSheet repaso={repaso} onClose={() => {
        setVerRepaso(false);
        if (window.location.search.includes('repaso')) window.history.replaceState(null, '', window.location.pathname);
      }} />}
    </section>
  );
}

function Lista({ titulo, items, vacio }: { titulo: string; items: string[]; vacio: string }) {
  return (
    <div>
      <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">{titulo}</h3>
      {items.length ? <ul className="space-y-1">{items.map(i => <li key={i} className="text-slate-700 dark:text-slate-200">{i}</li>)}</ul>
        : <p className="text-slate-500 dark:text-slate-400">{vacio}</p>}
    </div>
  );
}

function PushBoton({ estado, busy, onActivar, onDesactivar }: { estado: EstadoPush; busy: boolean; onActivar: () => void; onDesactivar: () => void }) {
  if (estado === 'no_soportado') return null;
  if (estado === 'requiere_instalar') return <span className="text-[11px] text-slate-500 dark:text-slate-400 text-right max-w-[9rem]">Instala la app en la pantalla de inicio para recibir avisos</span>;
  if (estado === 'denegado') return <span className="text-[11px] text-slate-500 dark:text-slate-400 text-right max-w-[9rem]">Notificaciones bloqueadas en los ajustes</span>;
  const activo = estado === 'activo';
  return (
    <button type="button" disabled={busy} onClick={activo ? onDesactivar : onActivar}
      className={`${chip} shrink-0 disabled:opacity-50 ${activo ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300' : 'bg-indigo-600 text-white'}`}>
      {activo ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
      {busy ? '…' : activo ? 'Avisos activos' : 'Activar avisos'}
    </button>
  );
}

function Dato({ etiqueta, valor, detalle }: { etiqueta: string; valor: string; detalle?: string }) {
  return (
    <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3">
      <p className="text-xs text-slate-500 dark:text-slate-400">{etiqueta}</p>
      <p className="text-lg font-bold text-slate-900 dark:text-white">{valor}</p>
      {detalle && <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">{detalle}</p>}
    </div>
  );
}

function RepasoSheet({ repaso, onClose }: { repaso: RepasoSemanal; onClose: () => void }) {
  const fecha = (d: string) => d.split('-').reverse().slice(0, 2).join('/');
  const c = repaso.checkins;
  return (
    <div role="dialog" aria-modal="true" aria-label="Repaso semanal" className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/50" onClick={onClose}>
      <div className="w-full sm:max-w-lg max-h-[88vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-900 p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]" onClick={e => e.stopPropagation()}>
        <div className="sm:hidden flex justify-center -mt-2 pb-3" aria-hidden="true"><span className="w-10 h-1.5 rounded-full bg-slate-300 dark:bg-slate-600" /></div>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Tu semana</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Del {fecha(repaso.desde)} al {fecha(repaso.hasta)}</p>
          </div>
          <button type="button" aria-label="Cerrar" onClick={onClose} className="w-11 h-11 -mr-2 flex items-center justify-center rounded-xl text-slate-500"><X className="w-5 h-5" /></button>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-4">
          <Dato etiqueta="Estudio confirmado" valor={hours(repaso.horas_hechas)} detalle={`de ${hours(repaso.horas_planificadas)} planificadas`} />
          <Dato etiqueta="Sin hacer" valor={hours(repaso.horas_no_hechas)} detalle={repaso.horas_sin_confirmar ? `${hours(repaso.horas_sin_confirmar)} sin confirmar` : undefined} />
          <Dato etiqueta="Horas reales registradas" valor={hours(repaso.horas_reales_registradas)} detalle={entregas(repaso.entregas_con_horas)} />
          <Dato etiqueta="Deuda acumulada" valor={hours(repaso.deuda_horas)} />
          <Dato etiqueta="Check-in medio" valor={c.dias ? `${num(c.energia)}/5 energía` : 'Sin check-ins'}
            detalle={c.dias ? `${num(c.sueno_h)} h de sueño · fatiga ${num(c.fatiga)}/5 · ${c.dias} ${c.dias === 1 ? 'día' : 'días'}` : undefined} />
          <Dato etiqueta="Próxima semana" valor={hours(repaso.proxima.horas_profundas + repaso.proxima.horas_ligeras)}
            detalle={`${hours(repaso.proxima.horas_profundas)} profundas · ${entregas(repaso.proxima.entregas.length)}${repaso.proxima.en_riesgo ? ` · ${repaso.proxima.en_riesgo} en riesgo` : ''}`} />
        </div>
        {repaso.calibracion.length > 0 && (
          <div className="mt-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Lo que tardas de verdad</h3>
            <ul className="mt-1 space-y-1 text-sm text-slate-700 dark:text-slate-200">
              {repaso.calibracion.map(k => <li key={k.asignatura}>{k.asignatura}: tus estimaciones se multiplican por {k.factor.toLocaleString('es-ES')} ({k.muestras} entregas medidas)</li>)}
            </ul>
          </div>
        )}
        {repaso.aplazadas.length > 0 && (
          <div className="mt-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Se te acumulan</h3>
            <ul className="mt-1 space-y-1 text-sm text-slate-700 dark:text-slate-200">
              {repaso.aplazadas.map(a => <li key={a.titulo}>{a.titulo}: aplazada {a.aplazamientos} veces</li>)}
            </ul>
          </div>
        )}
        {repaso.proxima.entregas.length > 0 && (
          <div className="mt-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Entregas de la próxima semana</h3>
            <ul className="mt-1 space-y-1 text-sm text-slate-700 dark:text-slate-200">
              {repaso.proxima.entregas.map(e => <li key={e.titulo + e.vence_local}>{e.titulo} · {fecha(e.vence_local.slice(0, 10))} a las {e.vence_local.slice(11, 16)}</li>)}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
