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
} from 'lucide-react';
import { TaskItem } from '../types';
import { getCategoryMeta } from '../data/categories';
import { RealTimeClockState } from '../hooks/useRealTimeClock';

interface NextActivityCardProps {
  clock: RealTimeClockState;
  tasks: TaskItem[];
  onToggleTaskComplete?: (taskId: string) => void;
}

export const NextActivityCard: React.FC<NextActivityCardProps> = ({
  clock,
  tasks,
  onToggleTaskComplete,
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
        className="w-full rounded-2xl border border-slate-800 bg-slate-900/60 p-4 sm:p-5 flex items-center justify-between gap-4"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
            <Check className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm sm:text-base font-bold text-white">
              Todas las actividades al día
            </h4>
            <p className="text-xs text-slate-400">
              No tienes actividades pendientes programadas en tu agenda.
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
    // Future day label
    const [y, m, d] = currentOrNext.date.split('-').map(Number);
    const daysWeek = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const dateObj = new Date(Date.UTC(y, m - 1, d));
    const dayName = daysWeek[dateObj.getUTCDay()];
    timeDetailLabel = `${dayName} ${d} Sep a las ${currentOrNext.time}`;
  }

  return (
    <div
      id="next-activity-card"
      className={`w-full rounded-2xl border transition-all duration-300 p-4 sm:p-5 shadow-lg backdrop-blur-sm ${
        isOngoing
          ? 'bg-gradient-to-r from-rose-950/40 via-slate-900 to-slate-900/90 border-rose-500/50 shadow-rose-950/30 ring-1 ring-rose-500/20'
          : 'bg-gradient-to-r from-indigo-950/30 via-slate-900 to-slate-900/90 border-indigo-500/40 shadow-indigo-950/20'
      }`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Left Side: Tag, Title, Metadata */}
        <div className="flex items-start sm:items-center gap-3.5 min-w-0">
          <div
            className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border shadow-inner ${
              isOngoing
                ? 'bg-rose-500/20 border-rose-500/40 text-rose-400'
                : 'bg-indigo-500/20 border-indigo-500/40 text-indigo-400'
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
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider border ${
                  isOngoing
                    ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                    : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
                }`}
              >
                {isOngoing && <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-ping" />}
                {isOngoing ? 'En curso ahora' : 'Próxima actividad'}
              </span>

              <span
                className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${meta.bgClass} ${meta.colorClass} ${meta.borderClass}`}
              >
                {meta.label} ({meta.tagColor})
              </span>

              {timeDetailLabel && (
                <span className="text-xs font-mono font-medium text-amber-300 hidden sm:inline">
                  &bull; {timeDetailLabel}
                </span>
              )}
            </div>

            {/* Task Title */}
            <div className="flex items-center gap-2">
              <h3 className="text-base sm:text-lg font-bold text-white tracking-tight truncate">
                {currentOrNext.title}
              </h3>
            </div>

            {/* Sub-label for mobile or extra notes */}
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 font-mono">
              <span className="flex items-center gap-1 text-slate-300">
                <Clock className="w-3.5 h-3.5 text-indigo-400" />
                {currentOrNext.time}
                {currentOrNext.endTime ? ` - ${currentOrNext.endTime}` : ''}
              </span>
              <span className="sm:hidden text-amber-300 font-medium">
                &bull; {timeDetailLabel}
              </span>
              {currentOrNext.notes && (
                <span className="text-slate-500 hidden md:inline truncate max-w-md">
                  &mdash; {currentOrNext.notes}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right Side: Quick Action (Checkmark / Complete) */}
        {onToggleTaskComplete && (
          <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
            <button
              id="next-activity-btn-complete"
              onClick={() => onToggleTaskComplete(currentOrNext.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-700 bg-slate-800/80 hover:bg-emerald-600/20 hover:border-emerald-500 hover:text-emerald-300 text-xs font-semibold text-slate-300 transition cursor-pointer"
              title="Marcar como completada"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>Marcar lista</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
