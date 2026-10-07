import React from 'react';
import {
  Clock,
  ArrowRight,
  CheckCircle2,
  Calendar,
  Sparkles,
  Flame,
  Radio,
  Check,
  Dumbbell,
} from 'lucide-react';
import { TaskItem } from '../types';
import { getCategoryMeta } from '../data/categories';
import { RealTimeClockState } from '../hooks/useRealTimeClock';

interface NextActivityCardProps {
  clock: RealTimeClockState;
  tasks: TaskItem[];
  onToggleTaskComplete?: (taskId: string) => void;
  onOpenGymRoutine?: (routineId?: string) => void;
}

export const NextActivityCard: React.FC<NextActivityCardProps> = ({
  clock,
  tasks,
  onToggleTaskComplete,
  onOpenGymRoutine,
}) => {
  // Tasks for today
  const todayTasks = tasks.filter((t) => t.date === clock.dateStr);

  // Check if a task is currently active right now
  const activeTask = todayTasks.find((t) => {
    if (t.completed) return false;
    const taskStart = t.time;
    const taskEnd = t.endTime || '23:59';
    return clock.timeStr >= taskStart && clock.timeStr <= taskEnd;
  });

  // Next upcoming task today
  const nextTaskToday = !activeTask
    ? todayTasks
        .filter((t) => !t.completed && t.time > clock.timeStr)
        .sort((a, b) => a.time.localeCompare(b.time))[0]
    : null;

  // Next upcoming task in future days (if none left today)
  const nextFutureTask =
    !activeTask && !nextTaskToday
      ? tasks
          .filter((t) => !t.completed && t.date > clock.dateStr)
          .sort((a, b) => {
            if (a.date !== b.date) return a.date.localeCompare(b.date);
            return a.time.localeCompare(b.time);
          })[0]
      : null;

  const currentOrNext = activeTask || nextTaskToday || nextFutureTask;

  if (!currentOrNext) {
    return (
      <div
        id="next-activity-card"
        className="w-full rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-4 sm:p-5 flex items-center justify-between gap-4 shadow-xs"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
            <Check className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
              Todas las actividades al día
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              No tienes actividades pendientes programadas para este momento en tu agenda.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const isOngoing = !!activeTask;
  const meta = getCategoryMeta(currentOrNext.category);

  // Time calculations
  let timeDetailLabel = '';
  if (isOngoing && currentOrNext.endTime) {
    const [eH, eM] = currentOrNext.endTime.split(':').map(Number);
    const [cH, cM] = clock.timeStr.split(':').map(Number);
    const minsLeft = Math.max(0, eH * 60 + eM - (cH * 60 + cM));
    if (minsLeft > 0) {
      const h = Math.floor(minsLeft / 60);
      const m = minsLeft % 60;
      timeDetailLabel = `Finaliza en ${h > 0 ? `${h}h ` : ''}${m} min`;
    } else {
      timeDetailLabel = 'Finalizando ahora';
    }
  } else if (!isOngoing && currentOrNext.date === clock.dateStr) {
    const [sH, sM] = currentOrNext.time.split(':').map(Number);
    const [cH, cM] = clock.timeStr.split(':').map(Number);
    const minsUntil = Math.max(0, sH * 60 + sM - (cH * 60 + cM));
    const h = Math.floor(minsUntil / 60);
    const m = minsUntil % 60;
    timeDetailLabel = `Comienza en ${h > 0 ? `${h}h ` : ''}${m} min`;
  } else if (currentOrNext.date !== clock.dateStr) {
    // Dynamic month formatting
    const [y, m, d] = currentOrNext.date.split('-').map(Number);
    const daysWeek = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const monthsShort = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const dateObj = new Date(Date.UTC(y, m - 1, d));
    const dayName = daysWeek[dateObj.getUTCDay()];
    const monthName = monthsShort[m - 1] || 'Mes';
    timeDetailLabel = `${dayName} ${d} ${monthName} a las ${currentOrNext.time}`;
  }

  return (
    <div
      id="next-activity-card"
      className={`w-full rounded-2xl border transition-all duration-300 p-4 sm:p-5 shadow-xs ${
        isOngoing
          ? 'bg-rose-50/70 dark:bg-rose-950/30 border-rose-200 dark:border-rose-500/40 border-l-4 border-l-rose-500 ring-1 ring-rose-200 dark:ring-rose-500/20'
          : `${meta.cardBg || 'bg-slate-50 dark:bg-slate-900'} ${meta.cardBorder || 'border-slate-200/90 dark:border-slate-800'} border-l-4 ${meta.leftBar || 'border-l-indigo-500'} hover:shadow-sm`
      }`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Left Side: Tag, Title, Metadata */}
        <div className="flex items-start sm:items-center gap-3.5 min-w-0">
          <div
            className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border ${
              isOngoing
                ? 'bg-rose-100 dark:bg-rose-500/20 border-rose-200 dark:border-rose-500/40 text-rose-600 dark:text-rose-400'
                : 'bg-indigo-50 dark:bg-indigo-500/20 border-indigo-200 dark:border-indigo-500/40 text-indigo-600 dark:text-indigo-400'
            }`}
          >
            {isOngoing ? (
              <Radio className="w-5 h-5 animate-pulse" />
            ) : (
              <Clock className="w-5 h-5" />
            )}
          </div>

          <div className="flex flex-col gap-1 min-w-0">
            {/* Top row: Status Badge + Category Tag */}
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                  isOngoing
                    ? 'bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-500/40'
                    : 'bg-indigo-50 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-500/40'
                }`}
              >
                {isOngoing && <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />}
                {isOngoing ? 'En curso ahora' : 'Próxima actividad'}
              </span>

              <span
                className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${meta.bgClass} ${meta.colorClass} ${meta.borderClass}`}
              >
                {meta.label}
              </span>

              {timeDetailLabel && (
                <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 hidden sm:inline">
                  &bull; {timeDetailLabel}
                </span>
              )}
            </div>

            {/* Task Title */}
            <div className="flex items-center gap-2">
              <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white tracking-tight truncate">
                {currentOrNext.title}
              </h3>
            </div>

            {/* Sub-label for mobile or extra notes */}
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-1 text-slate-700 dark:text-slate-300 font-medium">
                <Clock className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                {currentOrNext.time}
                {currentOrNext.endTime ? ` - ${currentOrNext.endTime}` : ''}
              </span>
              <span className="sm:hidden text-amber-600 dark:text-amber-400 font-semibold">
                &bull; {timeDetailLabel}
              </span>
              {currentOrNext.notes && (
                <span className="text-slate-400 dark:text-slate-500 hidden md:inline truncate max-w-md">
                  &mdash; {currentOrNext.notes}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right Side: Quick Action (Checkmark / Complete, Gym Routine) */}
        <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
          {onOpenGymRoutine && (
            (() => {
              const titleLow = (currentOrNext.title || '').toLowerCase();
              const notesLow = (currentOrNext.notes || '').toLowerCase();
              const isGym =
                currentOrNext.category === 'Sports/Karate' ||
                ['gym', 'gimnasio', 'pesas', 'rutina', 'entreno', 'fuerza', 'pierna', 'pecho', 'espalda'].some(
                  (k) => titleLow.includes(k) || notesLow.includes(k)
                );
              if (!isGym) return null;

              const getRoutineId = () => {
                const combined = `${titleLow} ${notesLow}`;
                if (combined.includes('pierna') || combined.includes('cadera') || combined.includes('golpeo') || combined.includes('lunes') || combined.includes('sentadilla')) {
                  return 'routine-lunes-pierna-cadera-golpeo';
                }
                if (combined.includes('torso') || combined.includes('cuello') || combined.includes('cervical') || combined.includes('miercoles') || combined.includes('miércoles') || combined.includes('banca')) {
                  return 'routine-miercoles-torso-cuello';
                }
                if (combined.includes('híbrido') || combined.includes('hibrido') || combined.includes('posterior') || combined.includes('core') || combined.includes('viernes') || combined.includes('sabado') || combined.includes('sábado') || combined.includes('muerto')) {
                  return 'routine-viernes-sabado-hibrido-core';
                }
                return 'routine-lunes-pierna-cadera-golpeo';
              };

              return (
                <button
                  type="button"
                  onClick={() => onOpenGymRoutine(getRoutineId())}
                  className="flex items-center gap-1.5 px-3 py-2 min-h-[38px] rounded-xl border border-rose-200 dark:border-rose-500/40 bg-rose-50 dark:bg-rose-500/20 hover:bg-rose-100 dark:hover:bg-rose-500/30 text-rose-700 dark:text-rose-300 text-xs font-bold transition cursor-pointer shadow-xs active:scale-95 touch-manipulation"
                  title="Abrir detalles de la rutina en el módulo de Gym"
                >
                  <Dumbbell className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                  <span>Ver Rutina</span>
                </button>
              );
            })()
          )}

          {onToggleTaskComplete && (
            <button
              id="next-activity-btn-complete"
              onClick={() => onToggleTaskComplete(currentOrNext.id)}
              className="flex items-center gap-1.5 px-3.5 py-2 min-h-[38px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 hover:bg-emerald-50 dark:bg-slate-800 dark:hover:bg-emerald-950/40 hover:border-emerald-300 dark:hover:border-emerald-600 hover:text-emerald-700 dark:hover:text-emerald-300 text-xs font-semibold text-slate-700 dark:text-slate-300 transition cursor-pointer active:scale-95 touch-manipulation"
              title="Marcar como completada"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Marcar lista</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
