import React, { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Calendar as CalendarIcon,
  Clock,
  CheckCircle2,
  Circle,
  Tag,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Filter,
  Camera,
  Trash2,
  Edit2,
  CalendarDays,
  LayoutGrid,
  ListOrdered,
  PlusCircle,
  TrendingUp,
  Activity,
  Flame,
  Radio,
  Dumbbell,
  History,
  ArrowDown,
  ArrowUp,
} from 'lucide-react';
import { TaskItem, CategoryType } from '../types';
import { CATEGORIES, getCategoryMeta } from '../data/categories';
import { RealTimeClockState } from '../hooks/useRealTimeClock';
import { NextActivityCard } from './NextActivityCard';
import { DailyWaterTracker } from './DailyWaterTracker';

interface DailyDashboardProps {
  tasks: TaskItem[];
  clock: RealTimeClockState;
  onToggleTaskComplete: (taskId: string) => void;
  onDeleteTask: (taskId: string) => void;
  onEditTaskRequest: (task: TaskItem) => void;
  onOpenVisionModal: () => void;
  onAddNewTask?: (date?: string) => void;
  onOpenGymRoutine?: (routineId?: string) => void;
}

const isGymRelated = (task: TaskItem): boolean => {
  if (task.category === 'Sports/Karate') return true;
  const titleLow = (task.title || '').toLowerCase();
  const notesLow = (task.notes || '').toLowerCase();
  return ['gym', 'gimnasio', 'pesas', 'rutina', 'entreno', 'fuerza', 'pierna', 'pecho', 'espalda', 'tríceps', 'bíceps', 'press', 'kumite'].some(
    (k) => titleLow.includes(k) || notesLow.includes(k)
  );
};

const getRoutineIdForTask = (task: TaskItem): string => {
  const text = `${task.title} ${task.notes || ''}`.toLowerCase();
  if (text.includes('pierna') || text.includes('lunes') || text.includes('cadera') || text.includes('golpeo') || text.includes('sentadilla')) {
    return 'routine-lunes-pierna-cadera-golpeo';
  }
  if (text.includes('torso') || text.includes('miércoles') || text.includes('miercoles') || text.includes('cuello') || text.includes('cervical') || text.includes('banca')) {
    return 'routine-miercoles-torso-cuello';
  }
  if (text.includes('híbrido') || text.includes('hibrido') || text.includes('viernes') || text.includes('sábado') || text.includes('sabado') || text.includes('posterior') || text.includes('core') || text.includes('muerto')) {
    return 'routine-viernes-sabado-hibrido-core';
  }
  return 'routine-lunes-pierna-cadera-golpeo';
};

export const DailyDashboard: React.FC<DailyDashboardProps> = ({
  tasks,
  clock,
  onToggleTaskComplete,
  onDeleteTask,
  onEditTaskRequest,
  onOpenVisionModal,
  onAddNewTask,
  onOpenGymRoutine,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [activeDate, setActiveDate] = useState<string>(clock.dateStr);
  const [agendaMode, setAgendaMode] = useState<'days-feed' | 'single-day' | 'weekly-columns'>('days-feed');
  const [weekOffset, setWeekOffset] = useState<number>(0);
  const [showPastDays, setShowPastDays] = useState<boolean>(false);

  // If clock crosses midnight or changes date, keep activeDate aligned if user was on today
  const prevDateRef = useRef(clock.dateStr);
  useEffect(() => {
    if (activeDate === prevDateRef.current) {
      setActiveDate(clock.dateStr);
    }
    prevDateRef.current = clock.dateStr;
  }, [clock.dateStr, activeDate]);

  // Dynamically calculate calendar days relative to the live real-time clock and weekOffset
  const calendarDays = useMemo(() => {
    const baseDate = new Date(clock.currentDate);
    baseDate.setDate(baseDate.getDate() + weekOffset * 7);

    // Anchor to Monday of the displayed week
    const dayOfWeek = baseDate.getDay(); // 0 = Sun, 1 = Mon, ...
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(baseDate);
    monday.setDate(baseDate.getDate() + diffToMonday);

    const spanishDaysShort = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const spanishDaysFull = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const spanishMonthsShort = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const spanishMonthsFull = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

    const tomD = new Date(clock.currentDate);
    tomD.setDate(tomD.getDate() + 1);
    const tomorrowStr = `${tomD.getFullYear()}-${(tomD.getMonth() + 1).toString().padStart(2, '0')}-${tomD.getDate().toString().padStart(2, '0')}`;

    const yestD = new Date(clock.currentDate);
    yestD.setDate(yestD.getDate() - 1);
    const yesterdayStr = `${yestD.getFullYear()}-${(yestD.getMonth() + 1).toString().padStart(2, '0')}-${yestD.getDate().toString().padStart(2, '0')}`;

    const days = [];
    for (let i = 0; i < 7; i++) {
      const cur = new Date(monday);
      cur.setDate(monday.getDate() + i);

      const y = cur.getFullYear();
      const m = (cur.getMonth() + 1).toString().padStart(2, '0');
      const d = cur.getDate().toString().padStart(2, '0');
      const dateStr = `${y}-${m}-${d}`;

      const curDayOfWeek = cur.getDay();
      const curMonthIdx = cur.getMonth();

      days.push({
        date: dateStr,
        dayName: spanishDaysShort[curDayOfWeek],
        dayNumber: d,
        month: spanishMonthsShort[curMonthIdx],
        fullDay: `${spanishDaysFull[curDayOfWeek]} ${cur.getDate()} de ${spanishMonthsFull[curMonthIdx]}`,
        isToday: dateStr === clock.dateStr,
        isTomorrow: dateStr === tomorrowStr,
        isYesterday: dateStr === yesterdayStr,
      });
    }

    return days;
  }, [clock.dateStr, clock.currentDate, weekOffset]);

  // Format date helper in Spanish for ANY date
  const formatDayHeader = (dateStr: string) => {
    const matched = calendarDays.find((d) => d.date === dateStr);
    if (matched) {
      let suffix = '';
      if (matched.isToday) suffix = ' (Hoy)';
      else if (matched.isTomorrow) suffix = ' (Mañana)';
      else if (matched.isYesterday) suffix = ' (Ayer)';
      return `${matched.fullDay}${suffix}`;
    }

    try {
      const [yearStr, monthStr, dayStr] = dateStr.split('-');
      const y = parseInt(yearStr, 10);
      const m = parseInt(monthStr, 10) - 1;
      const d = parseInt(dayStr, 10);
      const dObj = new Date(y, m, d);

      const spanishDaysFull = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
      const spanishMonthsFull = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

      const dayName = spanishDaysFull[dObj.getDay()] || 'Día';
      const monthName = spanishMonthsFull[m] || monthStr;

      let suffix = '';
      if (dateStr === clock.dateStr) suffix = ' (Hoy)';

      return `${dayName} ${d} de ${monthName} de ${y}${suffix}`;
    } catch {
      return `Día ${dateStr}`;
    }
  };

  // Group all tasks by day and split into past vs active/upcoming days
  const { allGroupedDays, pastDays, activeAndUpcomingDays } = useMemo(() => {
    const datesSet = new Set<string>();
    calendarDays.forEach((d) => datesSet.add(d.date));
    tasks.forEach((t) => datesSet.add(t.date));

    const sortedDates = Array.from(datesSet).sort();

    const allGroups: { date: string; tasks: TaskItem[] }[] = [];
    const past: { date: string; tasks: TaskItem[] }[] = [];
    const active: { date: string; tasks: TaskItem[] }[] = [];

    sortedDates.forEach((date) => {
      let dayTasks = tasks.filter((t) => t.date === date);

      // Apply category filter if active
      if (selectedCategory !== 'all') {
        dayTasks = dayTasks.filter((t) => t.category === selectedCategory);
      }

      // Sort by time
      dayTasks.sort((a, b) => a.time.localeCompare(b.time));

      // Keep dates that have tasks or are within current displayed week
      if (dayTasks.length > 0 || calendarDays.some((c) => c.date === date)) {
        const groupObj = { date, tasks: dayTasks };
        allGroups.push(groupObj);
        if (date < clock.dateStr) {
          past.push(groupObj);
        } else {
          active.push(groupObj);
        }
      }
    });

    return {
      allGroupedDays: allGroups,
      pastDays: past,
      activeAndUpcomingDays: active,
    };
  }, [tasks, selectedCategory, calendarDays, clock.dateStr]);

  // Days to show in feed: by default starts from TODAY. Past days shown only if user toggles them or selects a past date.
  const displayFeedDays = useMemo(() => {
    if (showPastDays) {
      return allGroupedDays;
    }
    return activeAndUpcomingDays;
  }, [showPastDays, allGroupedDays, activeAndUpcomingDays]);

  // Tasks for single day view
  const singleDayTasks = useMemo(() => {
    let dayTasks = tasks.filter((t) => t.date === activeDate);
    if (selectedCategory !== 'all') {
      dayTasks = dayTasks.filter((t) => t.category === selectedCategory);
    }
    return dayTasks.sort((a, b) => a.time.localeCompare(b.time));
  }, [tasks, activeDate, selectedCategory]);

  // Dynamic routine banner for today
  const todayRoutineInfo = useMemo(() => {
    const day = clock.dayName;
    if (day === 'Lunes') {
      return {
        routineId: 'routine-lunes-pierna-cadera-golpeo',
        badge: 'Rutina de Hoy • Lunes',
        title: 'LUNES: Foco Pierna (Fuerza Base y Cadera) + Activación de Golpeo',
        subtitle: '6 ejercicios: Balón medicinal, Landmine Gyaku Tsuki, Sentadilla (100-105kg), Hip Thrust, Cuádriceps y Keiser',
        duration: '~65 min',
        isTrainingDay: true,
      };
    }
    if (day === 'Miércoles') {
      return {
        routineId: 'routine-miercoles-torso-cuello',
        badge: 'Rutina de Hoy • Miércoles',
        title: 'MIÉRCOLES: Foco Torso (Fuerza) + Blindaje Cervical',
        subtitle: '5 ejercicios: Saltos balísticos, Press Banca (55-60kg), Press Militar, Remo y Blindaje Cervical',
        duration: '~60 min',
        isTrainingDay: true,
      };
    }
    if (day === 'Viernes' || day === 'Sábado') {
      return {
        routineId: 'routine-viernes-sabado-hibrido-core',
        badge: `Rutina de Hoy • ${day}`,
        title: 'VIERNES o SÁBADO: Día Híbrido (Cadena Posterior y Volumen) + Core',
        subtitle: '5 ejercicios: Peso Muerto Rumano, Zancadas atrás, Press Inclinado, Jalón al Pecho y Core Pallof',
        duration: '~65 min',
        isTrainingDay: true,
      };
    }
    return {
      routineId: 'routine-lunes-pierna-cadera-golpeo',
      badge: 'Día de Descanso / Recuperación Activa',
      title: 'Día de Recuperación Activa, Estudio o Movilidad Articular',
      subtitle: 'Mantén una buena hidratación y descanso de calidad para los próximos entrenamientos.',
      duration: 'Pausa',
      isTrainingDay: false,
    };
  }, [clock.dayName]);

  const handleJumpToToday = () => {
    setWeekOffset(0);
    setActiveDate(clock.dateStr);
    const el = document.getElementById(`day-section-${clock.dateStr}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto px-3 sm:px-6 py-5 sm:py-8 flex flex-col gap-6">
      {/* Real-time Hero Card */}
      <NextActivityCard
        clock={clock}
        tasks={tasks}
        onToggleTaskComplete={onToggleTaskComplete}
        onOpenGymRoutine={onOpenGymRoutine}
      />

      {/* Routine Banner for Today (if gym day) */}
      {todayRoutineInfo.isTrainingDay && onOpenGymRoutine && (
        <div className="p-4 sm:p-5 rounded-2xl bg-rose-50/80 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-rose-600/20">
              <Dumbbell className="w-5 h-5" />
            </div>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-900/50 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                  {todayRoutineInfo.badge}
                </span>
                <span className="text-xs text-rose-600 dark:text-rose-400 font-semibold hidden sm:inline">
                  {todayRoutineInfo.duration}
                </span>
              </div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white tracking-tight mt-0.5 truncate">
                {todayRoutineInfo.title}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                {todayRoutineInfo.subtitle}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
            <button
              type="button"
              onClick={() => onOpenGymRoutine(todayRoutineInfo.routineId)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-md shadow-rose-600/20 transition cursor-pointer active:scale-95"
            >
              <Dumbbell className="w-4 h-4" />
              <span>Ver Rutina de Gym</span>
            </button>
          </div>
        </div>
      )}

      {/* Header: Title & View Switcher */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-indigo-600 dark:text-indigo-400 mb-0.5">
            <CalendarDays className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <span>AGENDA POR DÍAS &bull; PLANIFICADOR EN TIEMPO REAL</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            Agenda Semanal y Diaria
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Organizada dinámicamente día a día con horarios, categorías y seguimiento en vivo.
          </p>
        </div>

        {/* View Mode Switcher */}
        <div className="w-full sm:w-auto overflow-x-auto no-scrollbar flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 rounded-xl self-start md:self-auto shrink-0">
          <button
            id="btn-view-days-feed"
            onClick={() => setAgendaMode('days-feed')}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition cursor-pointer ${
              agendaMode === 'days-feed'
                ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <ListOrdered className="w-3.5 h-3.5 shrink-0" />
            <span>Por Días (Agenda)</span>
          </button>

          <button
            id="btn-view-single-day"
            onClick={() => setAgendaMode('single-day')}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition cursor-pointer ${
              agendaMode === 'single-day'
                ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <CalendarIcon className="w-3.5 h-3.5 shrink-0" />
            <span>Día Detallado</span>
          </button>

          <button
            id="btn-view-weekly"
            onClick={() => setAgendaMode('weekly-columns')}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition cursor-pointer ${
              agendaMode === 'weekly-columns'
                ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5 shrink-0" />
            <span>Semanal (Columnas)</span>
          </button>
        </div>
      </div>

      {/* Interactive Calendar Days Strip (Planner Navigation) */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-1 text-xs text-slate-500 dark:text-slate-400 px-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-700 dark:text-slate-300">CALENDARIO SEMANAL</span>
            <button
              onClick={handleJumpToToday}
              className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 border border-indigo-200 dark:border-indigo-800 transition cursor-pointer active:scale-95"
            >
              Ir a Hoy
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-indigo-600 dark:text-indigo-400 font-bold">
              {calendarDays[0]?.month} {calendarDays[0]?.date.split('-')[0]}
              {calendarDays[0]?.month !== calendarDays[calendarDays.length - 1]?.month && ` / ${calendarDays[calendarDays.length - 1]?.month}`}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setWeekOffset((w) => w - 1)}
                className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition cursor-pointer"
                title="Semana anterior"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setWeekOffset((w) => w + 1)}
                className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition cursor-pointer"
                title="Semana siguiente"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5 sm:gap-2">
          {calendarDays.map((day) => {
            const isSelected = activeDate === day.date;
            const dayTaskCount = tasks.filter((t) => t.date === day.date).length;

            return (
              <button
                key={day.date}
                id={`calendar-day-btn-${day.date}`}
                onClick={() => {
                  setActiveDate(day.date);
                  if (day.date < clock.dateStr) {
                    setShowPastDays(true);
                  }
                  // Scroll or focus to this day if in feed mode
                  const el = document.getElementById(`day-section-${day.date}`);
                  if (el && agendaMode === 'days-feed') {
                    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }
                }}
                className={`relative flex flex-col items-center justify-center p-2.5 rounded-2xl border transition-all cursor-pointer ${
                  day.isToday
                    ? isSelected
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 shadow-md ring-2 ring-emerald-500'
                      : 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-400/80 dark:border-emerald-500/50 shadow-xs'
                    : isSelected
                    ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-500 shadow-md ring-2 ring-indigo-500/40'
                    : 'bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 shadow-xs'
                }`}
              >
                {day.isToday && (
                  <span className="absolute -top-2 px-2 py-0.2 rounded-full bg-emerald-500 text-[9px] font-bold text-white uppercase flex items-center gap-1 shadow-xs">
                    Hoy
                  </span>
                )}

                <span
                  className={`text-[11px] font-bold uppercase ${
                    day.isToday
                      ? 'text-emerald-700 dark:text-emerald-300'
                      : isSelected
                      ? 'text-indigo-600 dark:text-indigo-400'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {day.dayName}
                </span>

                <span
                  className={`text-base sm:text-lg font-extrabold mt-0.5 ${
                    day.isToday
                      ? 'text-emerald-800 dark:text-emerald-100'
                      : isSelected
                      ? 'text-indigo-900 dark:text-white'
                      : 'text-slate-900 dark:text-slate-100'
                  }`}
                >
                  {day.dayNumber}
                </span>

                <div className="flex items-center gap-1 mt-1">
                  {dayTaskCount > 0 ? (
                    <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400">
                      {dayTaskCount} {dayTaskCount === 1 ? 'act.' : 'acts.'}
                    </span>
                  ) : (
                    <span className="text-[10px] text-slate-400 dark:text-slate-600">Libre</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Category Filter Pills Bar */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
        <span className="text-xs font-semibold text-slate-400 flex items-center gap-1 mr-1 shrink-0">
          <Filter className="w-3.5 h-3.5" />
          Filtrar:
        </span>

        <button
          id="cat-filter-all"
          onClick={() => setSelectedCategory('all')}
          className={`text-xs px-3 py-1.5 rounded-xl border whitespace-nowrap transition cursor-pointer ${
            selectedCategory === 'all'
              ? 'bg-slate-900 text-white font-bold border-slate-900 dark:bg-white dark:text-slate-900 shadow-xs'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
          }`}
        >
          Todas ({tasks.length})
        </button>

        {Object.keys(CATEGORIES).map((catKey) => {
          const meta = CATEGORIES[catKey as CategoryType];
          const count = tasks.filter((t) => t.category === catKey).length;
          const isSelected = selectedCategory === catKey;

          return (
            <button
              key={catKey}
              id={`cat-filter-${catKey}`}
              onClick={() => setSelectedCategory(catKey)}
              className={`text-xs px-3 py-1.5 rounded-xl border whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 ${
                isSelected
                  ? `${meta.bgClass} ${meta.colorClass} ${meta.borderClass} font-bold ring-2 ring-current`
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: meta.dotColor }}
              />
              <span>{meta.label}</span>
              <span className="text-[10px] opacity-75 font-mono">({count})</span>
            </button>
          );
        })}
      </div>

      {/* ========================================================================= */}
      {/* MODE 1: AGENDA DIVIDED BY DAYS (Day-by-Day Planner, Starting at Today)    */}
      {/* ========================================================================= */}
      {agendaMode === 'days-feed' && (
        <div className="flex flex-col gap-6">
          {/* Collapsible toggle for past history (keeps feed anchored to TODAY) */}
          {pastDays.length > 0 && (
            <div className="flex justify-center -mb-2">
              <button
                type="button"
                onClick={() => setShowPastDays((p) => !p)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer shadow-xs active:scale-95"
              >
                <History className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                <span>
                  {showPastDays
                    ? 'Ocultar historial de días anteriores'
                    : `Ver historial de días anteriores (${pastDays.length} días)`}
                </span>
                {showPastDays ? <ArrowUp className="w-3 h-3 ml-1" /> : <ArrowDown className="w-3 h-3 ml-1" />}
              </button>
            </div>
          )}

          {displayFeedDays.map((group) => {
            const dayMeta = calendarDays.find((d) => d.date === group.date);
            const isToday = group.date === clock.dateStr;
            const isTomorrow = dayMeta?.isTomorrow;
            const isPast = group.date < clock.dateStr;
            const dayMinutes = group.tasks.reduce(
              (acc, t) => acc + (t.completed ? 0 : t.durationMinutes || 60),
              0
            );
            const dayHours = Math.floor(dayMinutes / 60);
            const dayMins = dayMinutes % 60;

            const liveMarkerIndex = isToday
              ? group.tasks.findIndex((t) => t.time > clock.timeStr)
              : -1;

            return (
              <div
                key={group.date}
                id={`day-section-${group.date}`}
                className={`rounded-2xl border transition-all p-4 sm:p-5 flex flex-col gap-4 ${
                  isToday
                    ? 'bg-white dark:bg-slate-900 border-emerald-400/90 dark:border-emerald-500/60 ring-2 ring-emerald-400/30 dark:ring-emerald-500/30 shadow-md'
                    : isPast
                    ? 'bg-slate-50/70 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800 opacity-80'
                    : 'bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 shadow-xs'
                }`}
              >
                {/* Day Header Banner */}
                <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-11 h-11 rounded-xl flex flex-col items-center justify-center border font-mono ${
                        isToday
                          ? 'bg-emerald-600 text-white border-emerald-500 shadow-md shadow-emerald-500/20'
                          : isTomorrow
                          ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800'
                          : isPast
                          ? 'bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <span className="text-[10px] font-bold uppercase leading-none">
                        {dayMeta?.dayName || 'Día'}
                      </span>
                      <span className="text-base font-extrabold leading-none mt-0.5">
                        {dayMeta?.dayNumber || group.date.split('-')[2]}
                      </span>
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white tracking-tight">
                          {formatDayHeader(group.date)}
                        </h2>
                        {isToday && (
                          <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold uppercase flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                            Hoy &bull; En Vivo ({clock.timeStr})
                          </span>
                        )}
                        {isTomorrow && (
                          <span className="px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 text-[10px] font-bold uppercase">
                            Mañana
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {group.tasks.length} {group.tasks.length === 1 ? 'actividad programada' : 'actividades programadas'}{' '}
                        {dayMinutes > 0 && `• ${dayHours}h ${dayMins > 0 ? `${dayMins}m` : ''} de dedicación`}
                      </p>
                    </div>
                  </div>

                  {/* Actions for this day */}
                  <div className="flex items-center gap-2">
                    {onAddNewTask && (
                      <button
                        onClick={() => onAddNewTask(group.date)}
                        className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-white hover:bg-indigo-600 dark:hover:bg-indigo-600 px-3 py-1.5 rounded-xl border border-indigo-200 dark:border-indigo-800 transition cursor-pointer flex items-center gap-1 font-semibold"
                        title="Añadir tarea a este día"
                      >
                        <PlusCircle className="w-3.5 h-3.5" />
                        <span>Añadir</span>
                      </button>
                    )}
                    <button
                      onClick={onOpenVisionModal}
                      className="text-xs text-slate-600 dark:text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 transition cursor-pointer flex items-center gap-1"
                      title="Escanear foto u horario"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Foto</span>
                    </button>
                  </div>
                </div>

                {/* Day Tasks List */}
                {group.tasks.length === 0 ? (
                  <div className="py-6 text-center text-slate-400 text-xs border border-dashed border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50/50 dark:bg-slate-900/30 flex flex-col items-center gap-2">
                    <span>No hay actividades programadas para este día.</span>
                    {onAddNewTask && (
                      <button
                        onClick={() => onAddNewTask(group.date)}
                        className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 font-semibold cursor-pointer"
                      >
                        <PlusCircle className="w-3.5 h-3.5" />
                        <span>Añadir tarea para este día</span>
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col gap-2.5">
                    {/* Live marker at top */}
                    {isToday && liveMarkerIndex === 0 && (
                      <div className="flex items-center gap-3 my-1 px-1 py-1">
                        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-600 text-white font-mono text-[11px] font-extrabold shadow-sm shrink-0">
                          <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                          AHORA &bull; {clock.timeStr}
                        </div>
                        <div className="h-[2px] flex-1 bg-gradient-to-r from-rose-500 via-rose-300 dark:via-rose-600 to-transparent" />
                        <span className="text-[11px] font-mono text-rose-600 dark:text-rose-400 font-semibold hidden sm:inline">
                          En directo &bull; {clock.dayProgressPercent}% del día
                        </span>
                      </div>
                    )}

                    {group.tasks.map((task, taskIdx) => {
                      const meta = getCategoryMeta(task.category);

                      const isCurrentNow =
                        isToday &&
                        !task.completed &&
                        clock.timeStr >= task.time &&
                        clock.timeStr <= (task.endTime || '23:59');

                      const isUpcoming = isToday && !task.completed && clock.timeStr < task.time;

                      let diffMinutes: number | null = null;
                      if (isUpcoming) {
                        const [sH, sM] = task.time.split(':').map(Number);
                        const [cH, cM] = clock.timeStr.split(':').map(Number);
                        diffMinutes = sH * 60 + sM - (cH * 60 + cM);
                      }

                      const shouldRenderMarkerBefore =
                        isToday && liveMarkerIndex === taskIdx && taskIdx > 0;

                      return (
                        <React.Fragment key={task.id}>
                          {shouldRenderMarkerBefore && (
                            <div className="flex items-center gap-3 my-1.5 px-1 py-1">
                              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-600 text-white font-mono text-[11px] font-extrabold shadow-sm shrink-0">
                                <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                                AHORA &bull; {clock.timeStr}
                              </div>
                              <div className="h-[2px] flex-1 bg-gradient-to-r from-rose-500 via-rose-300 dark:via-rose-600 to-transparent" />
                              <span className="text-[11px] font-mono text-rose-600 dark:text-rose-400 font-semibold hidden sm:inline">
                                {clock.dayProgressPercent}% del día transcurrido
                              </span>
                            </div>
                          )}

                          <div
                            className={`group rounded-xl p-3.5 border transition-all duration-200 flex items-start justify-between gap-3 ${
                              task.completed
                                ? 'bg-slate-100/70 dark:bg-slate-850/40 border-slate-200 dark:border-slate-800 border-l-4 border-l-slate-300 dark:border-l-slate-700 opacity-60'
                                : isCurrentNow
                                ? 'bg-rose-50/90 dark:bg-rose-950/40 border-rose-300 dark:border-rose-500/70 border-l-4 border-l-rose-500 shadow-sm ring-1 ring-rose-300 dark:ring-rose-500/30'
                                : `${meta.cardBg || 'bg-slate-50/70 dark:bg-slate-850'} ${meta.cardBorder || 'border-slate-200 dark:border-slate-750'} border-l-4 ${meta.leftBar || 'border-l-indigo-500'} ${meta.hoverBg || 'hover:bg-slate-100'} shadow-xs hover:shadow-sm`
                            }`}
                          >
                            <div className="flex items-start gap-3 min-w-0">
                              {/* Checkbox */}
                              <button
                                onClick={() => onToggleTaskComplete(task.id)}
                                className={`mt-0.5 rounded-full p-1 transition cursor-pointer shrink-0 ${
                                  task.completed
                                    ? 'text-emerald-500 hover:text-slate-400'
                                    : 'text-slate-300 dark:text-slate-600 hover:text-emerald-500'
                                }`}
                              >
                                {task.completed ? (
                                  <CheckCircle2 className="w-5 h-5 text-emerald-500 fill-emerald-500/20" />
                                ) : (
                                  <Circle className="w-5 h-5" />
                                )}
                              </button>

                              {/* Task Content */}
                              <div className="flex flex-col gap-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span
                                    className={`font-semibold text-sm sm:text-base tracking-tight ${
                                      task.completed
                                        ? 'line-through text-slate-400 dark:text-slate-500'
                                        : isCurrentNow
                                        ? 'text-rose-900 dark:text-rose-100 font-bold'
                                        : 'text-slate-900 dark:text-white'
                                    }`}
                                  >
                                    {task.title}
                                  </span>

                                  {isCurrentNow && (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-500/25 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500 uppercase animate-pulse">
                                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                                      En Curso
                                    </span>
                                  )}

                                  {isUpcoming && diffMinutes !== null && diffMinutes <= 90 && diffMinutes > 0 && (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-500/40">
                                      Comienza en {diffMinutes} min
                                    </span>
                                  )}

                                  <span
                                    className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${meta.bgClass} ${meta.colorClass} ${meta.borderClass}`}
                                  >
                                    {meta.label}
                                  </span>

                                  {onOpenGymRoutine && isGymRelated(task) && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onOpenGymRoutine(getRoutineIdForTask(task));
                                      }}
                                      className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/40 hover:bg-rose-100 transition cursor-pointer active:scale-95"
                                      title="Abrir detalles de la rutina en el módulo Gym"
                                    >
                                      <Dumbbell className="w-2.5 h-2.5 text-rose-500" />
                                      <span>Ver Rutina Gym</span>
                                    </button>
                                  )}

                                  {task.sourceType === 'vision' && (
                                    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-cyan-50 dark:bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-500/20">
                                      <Camera className="w-2.5 h-2.5" />
                                      Foto
                                    </span>
                                  )}
                                </div>

                                {/* Time & Duration badge */}
                                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400 pt-0.5">
                                  <span className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300 font-medium">
                                    <Clock className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                                    {task.time}{task.endTime ? ` - ${task.endTime}` : ''} ({Math.floor(task.durationMinutes / 60)}h{' '}
                                    {task.durationMinutes % 60 > 0 ? `${task.durationMinutes % 60}m` : ''})
                                  </span>

                                  {task.priority === 'alta' && (
                                    <span className="text-rose-600 dark:text-rose-400 font-bold text-[11px]">
                                      Alta Prioridad
                                    </span>
                                  )}
                                </div>

                                {task.notes && (
                                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mt-0.5">
                                    {task.notes}
                                  </p>
                                )}
                              </div>
                            </div>

                            {/* Quick Actions */}
                            <div className="flex items-center gap-1 shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => onEditTaskRequest(task)}
                                className="w-8 h-8 rounded-lg text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition cursor-pointer"
                                title="Editar tarea"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => onDeleteTask(task.id)}
                                className="w-8 h-8 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center justify-center transition cursor-pointer"
                                title="Eliminar tarea"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </React.Fragment>
                      );
                    })}

                    {/* Live marker at bottom */}
                    {isToday && liveMarkerIndex === -1 && group.tasks.length > 0 && (
                      <div className="flex items-center gap-3 my-1.5 px-1 py-1">
                        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-600 text-white font-mono text-[11px] font-extrabold shadow-sm shrink-0">
                          <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                          AHORA &bull; {clock.timeStr}
                        </div>
                        <div className="h-[2px] flex-1 bg-gradient-to-r from-rose-500 via-rose-300 dark:via-rose-600 to-transparent" />
                        <span className="text-[11px] font-mono text-rose-600 dark:text-rose-400 font-semibold hidden sm:inline">
                          Tareas programadas del día finalizadas
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODE 2: SINGLE DAY DETAILED HOURLY VIEW                                   */}
      {/* ========================================================================= */}
      {agendaMode === 'single-day' && (
        <div className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex flex-col gap-4 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 uppercase">
                  Vista de Horas &bull; Día Detallado
                </span>
                {activeDate === clock.dateStr && (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold">
                    Hoy &bull; {clock.timeStr}
                  </span>
                )}
              </div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
                {formatDayHeader(activeDate)}
              </h2>
            </div>
            <div className="flex items-center gap-2">
              {onAddNewTask && (
                <button
                  onClick={() => onAddNewTask(activeDate)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs transition cursor-pointer"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>Añadir tarea</span>
                </button>
              )}
              <button
                onClick={() => {
                  const idx = calendarDays.findIndex((d) => d.date === activeDate);
                  if (idx > 0) setActiveDate(calendarDays[idx - 1].date);
                }}
                className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  const idx = calendarDays.findIndex((d) => d.date === activeDate);
                  if (idx < calendarDays.length - 1) setActiveDate(calendarDays[idx + 1].date);
                }}
                className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {singleDayTasks.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-sm flex flex-col items-center gap-3">
              <span>No hay actividades programadas para este día en particular.</span>
              {onAddNewTask && (
                <button
                  onClick={() => onAddNewTask(activeDate)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs transition cursor-pointer"
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>Añadir primera tarea</span>
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {singleDayTasks.map((task) => {
                const meta = getCategoryMeta(task.category);
                const isCurrentNow =
                  activeDate === clock.dateStr &&
                  !task.completed &&
                  clock.timeStr >= task.time &&
                  clock.timeStr <= (task.endTime || '23:59');

                return (
                  <div
                    key={task.id}
                    className={`flex items-start gap-4 p-4 rounded-xl border transition ${
                      isCurrentNow
                        ? 'bg-rose-50/80 dark:bg-rose-950/30 border-rose-300 dark:border-rose-500/70 border-l-4 border-l-rose-500 shadow-xs'
                        : `${meta.cardBg || 'bg-slate-50/70 dark:bg-slate-850'} ${meta.cardBorder || 'border-slate-200/90 dark:border-slate-800'} border-l-4 ${meta.leftBar || 'border-l-indigo-500'} ${meta.hoverBg || ''} hover:shadow-xs`
                    }`}
                  >
                    <div className="text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-300 shrink-0 min-w-[5.5rem] pt-0.5">
                      {task.time}{task.endTime ? ` - ${task.endTime}` : ''}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-slate-900 dark:text-white text-base">{task.title}</h4>
                        {isCurrentNow && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/50 font-bold uppercase animate-pulse">
                            En curso ahora
                          </span>
                        )}
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full border ${meta.bgClass} ${meta.colorClass} ${meta.borderClass}`}
                        >
                          {meta.label}
                        </span>
                        {onOpenGymRoutine && isGymRelated(task) && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenGymRoutine(getRoutineIdForTask(task));
                            }}
                            className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/40 hover:bg-rose-100 transition cursor-pointer active:scale-95"
                            title="Abrir detalles de la rutina en el módulo Gym"
                          >
                            <Dumbbell className="w-3 h-3 text-rose-500" />
                            <span>Ver Rutina Gym</span>
                          </button>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        Duración: {task.durationMinutes} minutos &bull; {task.notes || 'Sin notas adicionales'}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODE 3: WEEKLY COLUMNS GRID                                               */}
      {/* ========================================================================= */}
      {agendaMode === 'weekly-columns' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {calendarDays.slice(0, 7).map((day) => {
            const dayTasks = tasks.filter((t) => t.date === day.date);

            return (
              <div
                key={day.date}
                className={`rounded-2xl border p-3.5 flex flex-col gap-2.5 ${
                  day.isToday
                    ? 'bg-emerald-50/50 dark:bg-slate-900 border-emerald-400/90 dark:border-emerald-500/50 shadow-xs ring-1 ring-emerald-400/30'
                    : 'bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 shadow-xs'
                }`}
              >
                <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-1.5">
                    <span className={`font-bold text-sm ${day.isToday ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-900 dark:text-white'}`}>
                      {day.dayName} {day.dayNumber}
                    </span>
                    {day.isToday && (
                      <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/40">
                        Hoy
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {dayTasks.length} {dayTasks.length === 1 ? 'tarea' : 'tareas'}
                  </span>
                </div>

                <div className="flex flex-col gap-2 min-h-[140px]">
                  {dayTasks.length === 0 ? (
                    <span className="text-xs text-slate-400 italic py-6 text-center">
                      Libre
                    </span>
                  ) : (
                    dayTasks.map((t) => {
                      const meta = getCategoryMeta(t.category);
                      const isCurrentNow =
                        day.isToday &&
                        !t.completed &&
                        clock.timeStr >= t.time &&
                        clock.timeStr <= (t.endTime || '23:59');

                      return (
                        <div
                          key={t.id}
                          className={`p-2.5 rounded-xl border text-xs flex flex-col gap-1 transition ${
                            isCurrentNow
                              ? 'bg-rose-50/90 dark:bg-rose-950/40 border-rose-300 dark:border-rose-500/60 border-l-4 border-l-rose-500 shadow-xs'
                              : `${meta.cardBg || 'bg-slate-50/80 dark:bg-slate-850'} ${meta.cardBorder || 'border-slate-200/80 dark:border-slate-800'} border-l-4 ${meta.leftBar || 'border-l-indigo-500'}`
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                              {t.title}
                            </span>
                            <span className="text-[10px] text-slate-500 dark:text-slate-400 shrink-0 font-medium">
                              {t.time}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className={`text-[10px] ${meta.colorClass}`}>
                              {meta.label}
                            </span>
                            {isCurrentNow && (
                              <span className="text-[9px] font-bold uppercase text-rose-600 dark:text-rose-400 animate-pulse">
                                Ahora
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
