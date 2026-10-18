import React, { useMemo, useRef, useState } from 'react';
import { Check, Dumbbell, Minus, Plus, Volume2, Droplets, CalendarDays, List } from 'lucide-react';
import type { TaskItem } from '../../types';
import type { RealTimeClockState } from '../../hooks/useRealTimeClock';
import type { ParteDelDia } from '../../hooks/useParteDelDia';
import { getCategoryMeta } from '../../data/categories';
import { useHydrationTracker } from '../../hooks/useHydrationTracker';
import { rutinaDeTarea } from '../../utils/rutinaDeTarea';
import { AvisosDelDia } from './AvisosDelDia';
import { ParteManana } from './ParteManana';

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const LETRAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const LS_VISTA = 'hoy-vista';

const aFecha = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const aTexto = (d: Date) => d.toISOString().slice(0, 10);
const sumarDias = (s: string, n: number) => { const d = aFecha(s); d.setUTCDate(d.getUTCDate() + n); return aTexto(d); };
const lunesDe = (s: string) => { const d = aFecha(s); return sumarDias(s, -((d.getUTCDay() + 6) % 7)); };
const minutos = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return (h || 0) * 60 + (m || 0); };
const fin = (t: TaskItem) => t.endTime || (() => {
  const total = minutos(t.time) + (Number(t.durationMinutes) || 60);
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
})();
const duracion = (min: number) => {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
};
const litros = (n: number) => (Math.round(n * 100) / 100).toLocaleString('es-ES', { maximumFractionDigits: 2 });

function resumenLocal(items: TaskItem[], esHoy: boolean, ahora: string): string {
  if (!items.length) return esHoy ? 'Nada en la agenda de hoy.' : 'Día libre.';
  const pendientes = items.filter((t) => !t.completed);
  if (!pendientes.length) return esHoy ? 'Todo hecho por hoy.' : 'Todo hecho ese día.';
  const quedan = esHoy ? pendientes.filter((t) => fin(t) > ahora) : pendientes;
  if (!quedan.length) return 'No te queda nada más en la agenda de hoy.';
  const primero = quedan[0];
  if (esHoy) {
    const cuenta = quedan.length === 1 ? 'Te queda 1 cosa' : `Te quedan ${quedan.length} cosas`;
    return primero.time <= ahora ? `${cuenta}. Ahora: ${primero.title}.` : `${cuenta}. Lo siguiente: ${primero.title} a las ${primero.time}.`;
  }
  const cuenta = quedan.length === 1 ? '1 cosa en la agenda' : `${quedan.length} cosas en la agenda`;
  return `${cuenta}. Empieza a las ${primero.time} con ${primero.title}.`;
}

interface Props {
  tasks: TaskItem[];
  clock: RealTimeClockState;
  iniciales: string;
  parte: ParteDelDia;
  conCuenta?: boolean;
  puedeLeerDia: boolean;
  leyendoDia: boolean;
  onLeerDia: () => void;
  onOpenCuenta: () => void;
  onOpenPlanner: () => void;
  onToggleTaskComplete: (taskId: string) => void;
  onEditTask: (task: TaskItem) => void;
  onAddTask: (date: string) => void;
  onOpenGymRoutine: (routineId: string) => void;
  showToast: (message: string) => void;
  vistaSemana: React.ReactNode;
}

export const HoyView: React.FC<Props> = ({
  tasks, clock, iniciales, parte, conCuenta = false, puedeLeerDia, leyendoDia, onLeerDia, onOpenCuenta, onOpenPlanner,
  onToggleTaskComplete, onEditTask, onAddTask, onOpenGymRoutine, showToast, vistaSemana,
}) => {
  const hoy = clock.dateStr;
  const [elegido, setElegido] = useState<string | null>(null);
  const dia = elegido || hoy;
  const esHoy = dia === hoy;
  const [vista, setVista] = useState<'dia' | 'semana'>(() => {
    try { return localStorage.getItem(LS_VISTA) === 'semana' ? 'semana' : 'dia'; } catch { return 'dia'; }
  });
  const cambiarVista = (v: 'dia' | 'semana') => {
    setVista(v);
    try { localStorage.setItem(LS_VISTA, v); } catch { /* private mode */ }
  };

  const ahora = clock.timeStr;
  const fecha = aFecha(dia);
  const lunes = lunesDe(dia);

  const delDia = useMemo(
    () => tasks.filter((t) => t.date === dia).sort((a, b) => a.time.localeCompare(b.time) || a.title.localeCompare(b.title)),
    [tasks, dia]
  );
  const conTareas = useMemo(() => new Set(tasks.filter((t) => !t.completed).map((t) => t.date)), [tasks]);

  // Ongoing task, or the next one today
  const foco = useMemo(() => {
    if (!esHoy) return null;
    const enCurso = delDia.find((t) => !t.completed && t.time <= ahora && fin(t) > ahora);
    if (enCurso) {
      const total = Math.max(1, minutos(fin(enCurso)) - minutos(enCurso.time));
      const pasados = minutos(ahora) - minutos(enCurso.time);
      return { id: enCurso.id, enCurso: true, etiqueta: `Ahora · quedan ${duracion(Math.max(1, minutos(fin(enCurso)) - minutos(ahora)))}`, progreso: Math.min(100, Math.max(0, (pasados / total) * 100)) };
    }
    const siguiente = delDia.find((t) => !t.completed && t.time > ahora);
    if (siguiente) return { id: siguiente.id, enCurso: false, etiqueta: `Siguiente · en ${duracion(minutos(siguiente.time) - minutos(ahora))}`, progreso: 0 };
    return null;
  }, [delDia, esHoy, ahora]);

  const resumenServidor = esHoy && parte.resumen?.texto && parte.resumen.texto.length <= 220 ? parte.resumen.texto : '';
  const resumen = resumenServidor || resumenLocal(delDia, esHoy, ahora);

  // Swipe the week strip to change week
  const toque = useRef<number | null>(null);
  const onTouchStart = (e: React.TouchEvent) => { toque.current = e.touches[0].clientX; };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (toque.current === null) return;
    const dx = e.changedTouches[0].clientX - toque.current;
    toque.current = null;
    if (Math.abs(dx) > 50) setElegido(sumarDias(dia, dx < 0 ? 7 : -7));
  };

  const agua = useHydrationTracker(hoy);
  const [aguaAbierta, setAguaAbierta] = useState(false);
  const segmentos = Math.min(16, Math.max(4, Math.round(agua.goalLiters / 0.25)));
  const llenos = Math.min(segmentos, Math.round(agua.intakeLiters / 0.25));

  return (
    <div className="max-w-2xl mx-auto px-5 pt-[calc(env(safe-area-inset-top,0px)+2.5rem)] md:pt-8 flex flex-col gap-[22px]">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1 min-w-0">
          <span className="text-sm font-medium text-ink-2">{esHoy ? DIAS[fecha.getUTCDay()] : `${DIAS[fecha.getUTCDay()]}${dia < hoy ? ' pasado' : ''}`}</span>
          <h1 className="text-[34px] leading-[1.05] font-semibold tracking-[-0.025em]">{fecha.getUTCDate()} de {MESES[fecha.getUTCMonth()]}</h1>
          <p className="mt-2 text-[15px] leading-[1.45] text-ink-2 text-pretty">{resumen}</p>
          {puedeLeerDia && esHoy && (
            <button
              type="button"
              onClick={onLeerDia}
              aria-pressed={leyendoDia}
              className="self-start mt-3 h-11 pl-3 pr-4 rounded-full border border-line-2 bg-white flex items-center gap-2 text-sm font-semibold active:scale-95 transition cursor-pointer"
            >
              <Volume2 className="w-[19px] h-[19px]" strokeWidth={1.75} />
              {leyendoDia ? 'Leyendo tu día' : 'Escuchar mi día'}
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={onOpenCuenta}
          aria-label="Cuenta y ajustes"
          className="flex-none w-11 h-11 rounded-full bg-surface-2 text-sm font-semibold flex items-center justify-center active:scale-95 transition cursor-pointer md:hidden"
        >
          {iniciales}
        </button>
      </header>

      {esHoy && conCuenta && <ParteManana parte={parte} hoy={hoy} showToast={showToast} />}

      {esHoy && <AvisosDelDia parte={parte} onOpenPlanner={onOpenPlanner} showToast={showToast} />}

      <div
        role="group"
        aria-label="Semana"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        className="grid grid-cols-7 gap-1"
      >
        {Array.from({ length: 7 }, (_, i) => {
          const d = sumarDias(lunes, i);
          const n = aFecha(d).getUTCDate();
          const activo = d === dia;
          const esHoyDia = d === hoy;
          return (
            <button
              key={d}
              type="button"
              onClick={() => setElegido(d === hoy ? null : d)}
              aria-pressed={activo}
              aria-label={`${DIAS[(i + 1) % 7]} ${n}${esHoyDia ? ', hoy' : ''}`}
              className={`h-[62px] rounded-2xl flex flex-col items-center justify-center gap-[3px] transition cursor-pointer ${activo ? 'bg-ink text-white' : 'text-ink hover:bg-surface'}`}
            >
              <span className={`text-xs font-medium ${activo ? 'text-white/75' : 'text-ink-2'}`}>{LETRAS[i]}</span>
              <span className={`text-[17px] leading-none ${esHoyDia || activo ? 'font-bold' : 'font-semibold'}`}>{n}</span>
              <span className={`w-1 h-1 rounded-full ${conTareas.has(d) ? (activo ? 'bg-accent' : 'bg-line-3') : 'bg-transparent'}`} />
            </button>
          );
        })}
      </div>

      <section aria-label="Agenda" className="flex flex-col">
        <div className="flex items-center justify-between gap-2 mb-1">
          <h2 className="text-[17px] font-semibold">{vista === 'semana' ? 'Semana' : esHoy ? 'Agenda' : 'Agenda del día'}</h2>
          <div className="flex items-center gap-1 -mr-2">
            {!esHoy && vista === 'dia' && (
              <button type="button" onClick={() => setElegido(null)} className="h-11 px-3 rounded-full text-sm font-semibold hover:bg-black/5">
                Hoy
              </button>
            )}
            <button
              type="button"
              onClick={() => cambiarVista(vista === 'dia' ? 'semana' : 'dia')}
              className="h-11 px-3 rounded-full text-sm font-semibold flex items-center gap-1.5 hover:bg-black/5"
            >
              {vista === 'dia' ? <CalendarDays className="w-[18px] h-[18px]" strokeWidth={1.75} /> : <List className="w-[18px] h-[18px]" strokeWidth={1.75} />}
              {vista === 'dia' ? 'Semana' : 'Día'}
            </button>
            <button
              type="button"
              onClick={() => onAddTask(dia)}
              aria-label="Añadir a la agenda"
              className="w-11 h-11 rounded-full flex items-center justify-center hover:bg-black/5"
            >
              <Plus className="w-5 h-5" strokeWidth={1.75} />
            </button>
          </div>
        </div>

        {vista === 'semana' ? (
          <div className="-mx-2">{vistaSemana}</div>
        ) : delDia.length === 0 ? (
          <div className="py-12 flex flex-col items-center gap-2.5 text-ink-2">
            <CalendarDays className="w-7 h-7" strokeWidth={1.5} />
            <span className="text-[15px]">Nada en la agenda</span>
          </div>
        ) : (
          delDia.map((t) => {
            const meta = getCategoryMeta(t.category);
            const hecha = Boolean(t.completed);
            const rutina = rutinaDeTarea(t);
            if (foco && foco.id === t.id) {
              return (
                <div key={t.id} className="my-1.5 rounded-[20px] bg-surface px-4 pt-4 pb-[18px] flex flex-col gap-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="px-2.5 py-[5px] rounded-full bg-accent text-ink text-[13px] font-semibold">{foco.etiqueta}</span>
                    <span className="font-mono text-[13px] font-medium text-ink-2">{t.time}–{fin(t)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <button type="button" onClick={() => onEditTask(t)} className="min-w-0 flex flex-col gap-[5px] text-left cursor-pointer">
                      <span className="text-[21px] leading-[1.2] font-semibold tracking-[-0.015em]">{t.title}</span>
                      <span className="flex items-center gap-[7px] text-sm text-ink-2">
                        <span className="w-2 h-2 rounded-full flex-none" style={{ background: meta.dotColor }} />
                        {meta.label}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onToggleTaskComplete(t.id)}
                      aria-label={`Marcar como hecha: ${t.title}`}
                      className="flex-none w-12 h-12 rounded-full bg-ink text-white flex items-center justify-center active:scale-95 transition cursor-pointer"
                    >
                      <Check className="w-5 h-5" strokeWidth={1.75} />
                    </button>
                  </div>
                  {rutina && (
                    <button
                      type="button"
                      onClick={() => onOpenGymRoutine(rutina)}
                      className="self-start h-11 px-4 -mt-1 rounded-full border border-line-2 bg-white text-sm font-semibold flex items-center gap-2"
                    >
                      <Dumbbell className="w-4 h-4" strokeWidth={1.75} /> Ver rutina
                    </button>
                  )}
                  {foco.enCurso && (
                    <div aria-hidden="true" className="h-1 rounded-full bg-line-2 overflow-hidden">
                      <div className="h-1 rounded-full bg-ink" style={{ width: `${foco.progreso}%` }} />
                    </div>
                  )}
                </div>
              );
            }
            return (
              <div key={t.id} className="grid grid-cols-[50px_minmax(0,1fr)_44px] gap-3 items-center py-[11px] border-b border-hairline">
                <div className="flex flex-col gap-0.5 font-mono text-[13px] font-medium leading-[1.3]">
                  <span className={hecha ? 'text-ink-3' : 'text-ink'}>{t.time}</span>
                  <span className="text-ink-3">{fin(t)}</span>
                </div>
                <button type="button" onClick={() => onEditTask(t)} className="min-w-0 flex flex-col gap-[3px] text-left cursor-pointer">
                  <span className={`text-base leading-[1.3] font-medium ${hecha ? 'text-ink-3 line-through' : 'text-ink'}`}>{t.title}</span>
                  <span className="flex items-center gap-[7px] text-[13.5px] text-ink-2">
                    <span className="w-2 h-2 rounded-full flex-none" style={{ background: meta.dotColor }} />
                    {meta.label}
                    {rutina && !hecha && <span className="text-ink-3">· rutina</span>}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => onToggleTaskComplete(t.id)}
                  aria-pressed={hecha}
                  aria-label={`${hecha ? 'Marcar como pendiente' : 'Marcar como hecha'}: ${t.title}`}
                  className="w-11 h-11 flex items-center justify-center cursor-pointer"
                >
                  <span className={`w-[26px] h-[26px] rounded-full border-[1.5px] flex items-center justify-center text-white ${hecha ? 'bg-ink border-ink' : 'bg-white border-check'}`}>
                    {hecha && <Check className="w-3.5 h-3.5" strokeWidth={2} />}
                  </span>
                </button>
              </div>
            );
          })
        )}
      </section>

      {esHoy && (
        <section aria-label="Agua" className="flex items-center gap-3.5 pt-0.5">
          <span className="flex-none w-10 h-10 rounded-full bg-agua-suave text-agua flex items-center justify-center">
            <Droplets className="w-5 h-5" strokeWidth={1.75} />
          </span>
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            <button type="button" onClick={() => setAguaAbierta(a => !a)} aria-expanded={aguaAbierta} aria-label="Más opciones de agua"
              className="flex items-baseline justify-between gap-2 text-left cursor-pointer">
              <span className="text-[15px] font-medium">Agua</span>
              <span className="font-mono text-[13px] text-ink-2">{litros(agua.intakeLiters)} de {litros(agua.goalLiters)} L</span>
            </button>
            <div aria-hidden="true" className="grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${segmentos}, minmax(0, 1fr))` }}>
              {Array.from({ length: segmentos }, (_, i) => (
                <span key={i} className={`h-1.5 rounded-full ${i < llenos ? 'bg-agua' : 'bg-track'}`} />
              ))}
            </div>
          </div>
          {agua.intakeLiters > 0 && (
            <button
              type="button"
              onClick={() => agua.removeWater(0.25)}
              aria-label="Quitar 250 ml"
              className="flex-none w-11 h-11 -mr-2 rounded-full flex items-center justify-center text-ink-2 hover:bg-black/5"
            >
              <Minus className="w-4 h-4" strokeWidth={1.75} />
            </button>
          )}
          <button
            type="button"
            onClick={() => agua.addWater(0.25)}
            className="flex-none h-11 px-3.5 rounded-full border border-line-2 bg-white text-sm font-semibold active:scale-95 transition cursor-pointer"
          >
            + 250 ml
          </button>
        </section>
      )}
      {esHoy && aguaAbierta && (
        <div className="-mt-3 ml-[54px] flex flex-wrap gap-2">
          <button type="button" onClick={() => agua.addWater(0.5)} className="h-10 px-3.5 rounded-full border border-line-2 bg-white text-sm font-semibold active:scale-95 transition">+ 500 ml</button>
          <button type="button" onClick={() => agua.addWater(1)} className="h-10 px-3.5 rounded-full border border-line-2 bg-white text-sm font-semibold active:scale-95 transition">+ 1 L</button>
          {agua.intakeLiters > 0 && (
            <button type="button"
              onClick={() => { if (window.confirm('¿Reiniciar el agua de hoy a 0?')) { agua.resetToday(); showToast('Agua de hoy reiniciada'); } }}
              className="h-10 px-3.5 rounded-full text-sm font-semibold text-ink-2 hover:bg-black/5">
              Reiniciar hoy
            </button>
          )}
        </div>
      )}
    </div>
  );
};
