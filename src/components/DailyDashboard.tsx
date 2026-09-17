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
} from 'lucide-react';
import { TaskItem, CategoryType } from '../types';
import { CATEGORIES, getCategoryMeta } from '../data/categories';
import { RealTimeClockState } from '../hooks/useRealTimeClock';
import { NextActivityCard } from './NextActivityCard';

interface DailyDashboardProps {
  tasks: TaskItem[];
  clock: RealTimeClockState;
  onToggleTaskComplete: (taskId: string) => void;
  onDeleteTask: (taskId: string) => void;
  onEditTaskRequest: (task: TaskItem) => void;
  onOpenVisionModal: () => void;
  onAddNewTask?: (date?: string) => void;
}

export const DailyDashboard: React.FC<DailyDashboardProps> = ({
  tasks,
  clock,
  onToggleTaskComplete,
  onDeleteTask,
  onEditTaskRequest,
  onOpenVisionModal,
  onAddNewTask,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [activeDate, setActiveDate] = useState<string>(clock.dateStr);
  const [agendaMode, setAgendaMode] = useState<'days-feed' | 'single-day' | 'weekly-columns'>('days-feed');
  const [weekOffset, setWeekOffset] = useState<number>(0);

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
    // Shift by weekOffset * 7 days
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

  // Group all tasks by day
  const groupedTasksByDay = useMemo(() => {
    const datesSet = new Set<string>();
    calendarDays.forEach((d) => datesSet.add(d.date));
    tasks.forEach((t) => datesSet.add(t.date));

    const sortedDates = Array.from(datesSet).sort();

    const result: { date: string; tasks: TaskItem[] }[] = [];

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
        result.push({
          date,
          tasks: dayTasks,
        });
      }
    });

    return result;
  }, [tasks, selectedCategory, calendarDays]);

  // Tasks for single day view
  const singleDayTasks = useMemo(() => {
    let dayTasks = tasks.filter((t) => t.date === activeDate);
    if (selectedCategory !== 'all') {
      dayTasks = dayTasks.filter((t) => t.category === selectedCategory);
    }
    return dayTasks.sort((a, b) => a.time.localeCompare(b.time));
  }, [tasks, activeDate, selectedCategory]);

  // Calculate statistics
  const totalTasks = tasks.length;
  const completedCount = tasks.filter((t) => t.completed).length;
  const aiExtractedCount = tasks.filter((t) => t.sourceType !== 'manual').length;

  return (
    <div className="w-full max-w-5xl mx-auto px-3 sm:px-6 pt-4 sm:pt-6 pb-[calc(10rem+env(safe-area-inset-bottom,0px))] sm:pb-40 flex flex-col gap-5 sm:gap-6">
      {/* Próxima Actividad / Actividad en Curso */}
      <NextActivityCard
        clock={clock}
        tasks={tasks}
        onToggleTaskComplete={onToggleTaskComplete}
      />

      {/* Header: Title & View Switcher */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-indigo-400 font-semibold mb-1">
            <CalendarDays className="w-4 h-4 text-indigo-400 shrink-0" />
            <span>AGENDA POR DÍAS &bull; PLANIFICADOR</span>
          </div>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-extrabold text-white tracking-tight">
            Agenda Semanal y Diaria
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
            Organizada día a día con horarios, categorías y seguimiento en tiempo real.
          </p>
        </div>

        {/* View Mode Switcher */}
        <div className="w-full sm:w-auto overflow-x-auto no-scrollbar flex items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-xl self-start md:self-auto shrink-0">
          <button
            id="btn-view-days-feed"
            onClick={() => setAgendaMode('days-feed')}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
              agendaMode === 'days-feed'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ListOrdered className="w-3.5 h-3.5 shrink-0" />
            <span>Por Días<span className="hidden sm:inline"> (Agenda)</span></span>
          </button>

          <button
            id="btn-view-single-day"
            onClick={() => setAgendaMode('single-day')}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
              agendaMode === 'single-day'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <CalendarIcon className="w-3.5 h-3.5 shrink-0" />
            <span>Día Detallado</span>
          </button>

          <button
            id="btn-view-weekly"
            onClick={() => setAgendaMode('weekly-columns')}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
              agendaMode === 'weekly-columns'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5 shrink-0" />
            <span>Semanal<span className="hidden sm:inline"> (Columnas)</span></span>
          </button>
        </div>
      </div>

      {/* Interactive Calendar Days Strip (Planner Navigation) */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-1 text-xs text-slate-400 font-mono px-1">
          <div className="flex items-center gap-2">
            <span>SELECCIONAR DÍA</span>
            {weekOffset !== 0 && (
              <button
                onClick={() => {
                  setWeekOffset(0);
                  setActiveDate(clock.dateStr);
                }}
                className="px-2 py-0.5 rounded text-[10px] bg-indigo-600/30 text-indigo-300 hover:bg-indigo-600/50 border border-indigo-500/40 transition cursor-pointer"
              >
                Volver a Hoy
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-indigo-400 font-bold">
              {calendarDays[0]?.month} {calendarDays[0]?.date.split('-')[0]}
              {calendarDays[0]?.month !== calendarDays[calendarDays.length - 1]?.month && ` / ${calendarDays[calendarDays.length - 1]?.month}`}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setWeekOffset((w) => w - 1)}
                className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
                title="Semana anterior"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setWeekOffset((w) => w + 1)}
                className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
                title="Semana siguiente"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
          {calendarDays.map((day) => {
            const isSelected = activeDate === day.date;
            const dayTaskCount = tasks.filter((t) => t.date === day.date).length;

            return (
              <button
                key={day.date}
                id={`calendar-day-btn-${day.date}`}
                onClick={() => {
                  setActiveDate(day.date);
                  // Scroll or focus to this day if in feed mode
                  const el = document.getElementById(`day-section-${day.date}`);
                  if (el && agendaMode === 'days-feed') {
                    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }
                }}
                className={`relative flex flex-col items-center justify-center p-2 sm:p-2.5 rounded-xl border transition-all cursor-pointer ${
                  day.isToday
                    ? isSelected
                      ? 'bg-indigo-600/30 border-indigo-400 shadow-md ring-2 ring-indigo-500'
                      : 'bg-emerald-950/30 border-emerald-500/50 shadow-sm ring-1 ring-emerald-500/30'
                    : isSelected
                    ? 'bg-indigo-600/20 border-indigo-500 shadow-md ring-1 ring-indigo-500/50'
                    : 'bg-slate-900/90 border-slate-800 hover:border-slate-700 hover:bg-slate-850'
                }`}
              >
                {day.isToday && (
                  <span className="absolute -top-1.5 px-2 py-0.2 rounded-full bg-emerald-500 text-[9px] font-bold text-slate-950 uppercase flex items-center gap-1 shadow-sm shadow-emerald-500/40">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-950 animate-ping" />
                    Hoy
                  </span>
                )}
                {day.isTomorrow && (
                  <span className="absolute -top-1.5 px-1.5 py-0.2 rounded-full bg-indigo-500 text-[9px] font-bold text-white uppercase">
                    Mañana
                  </span>
                )}

                <span className="text-[11px] font-medium text-slate-400">{day.dayName}</span>
                <span
                  className={`text-base sm:text-lg font-extrabold tracking-tight mt-0.5 ${
                    day.isToday ? 'text-emerald-300' : isSelected ? 'text-indigo-300' : 'text-white'
                  }`}
                >
                  {day.dayNumber}
                </span>

                {/* Indicator for tasks scheduled on this day */}
                <div className="flex items-center gap-1 mt-1">
                  {dayTaskCount > 0 ? (
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full whitespace-nowrap ${
                        day.isToday
                          ? 'bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/40'
                          : isSelected
                          ? 'bg-indigo-500 text-white font-bold'
                          : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      {dayTaskCount} <span className="hidden sm:inline">{dayTaskCount === 1 ? 'bloque' : 'bloques'}</span><span className="sm:hidden">act.</span>
                    </span>
                  ) : (
                    <span className="text-[10px] text-slate-600">&mdash;</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Category Filter Chips Bar */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider shrink-0 flex items-center gap-1 mr-1">
          <Filter className="w-3.5 h-3.5" />
          Filtro:
        </span>

        <button
          id="cat-filter-all"
          onClick={() => setSelectedCategory('all')}
          className={`text-xs px-3 py-1.5 rounded-lg border whitespace-nowrap transition cursor-pointer ${
            selectedCategory === 'all'
              ? 'bg-slate-100 text-slate-900 font-bold border-slate-200'
              : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-850'
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
              className={`text-xs px-3 py-1.5 rounded-lg border whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 ${
                isSelected
                  ? `${meta.bgClass} ${meta.colorClass} ${meta.borderClass} font-bold ring-1 ring-current`
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-850'
              }`}
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: meta.dotColor }}
              />
              <span>{meta.label}</span>
              <span className="text-[10px] opacity-75">({count})</span>
            </button>
          );
        })}
      </div>

      {/* ========================================================================= */}
      {/* MODE 1: AGENDA DIVIDED BY DAYS (The user's requested day-by-day planner)  */}
      {/* ========================================================================= */}
      {agendaMode === 'days-feed' && (
        <div className="flex flex-col gap-8">
          {groupedTasksByDay.map((group) => {
            const dayMeta = calendarDays.find((d) => d.date === group.date);
            const isToday = group.date === clock.dateStr;
            const isTomorrow = dayMeta?.isTomorrow;
            const dayMinutes = group.tasks.reduce(
              (acc, t) => acc + (t.completed ? 0 : t.durationMinutes || 60),
              0
            );
            const dayHours = Math.floor(dayMinutes / 60);
            const dayMins = dayMinutes % 60;

            // Find index to insert the live marker line between past and future tasks
            const liveMarkerIndex = isToday
              ? group.tasks.findIndex((t) => t.time > clock.timeStr)
              : -1;

            return (
              <div
                key={group.date}
                id={`day-section-${group.date}`}
                className={`rounded-2xl border transition-all p-4 sm:p-5 flex flex-col gap-4 ${
                  isToday
                    ? 'bg-slate-900/95 border-emerald-500/50 ring-1 ring-emerald-500/30 shadow-xl shadow-emerald-950/20'
                    : 'bg-slate-900/50 border-slate-800'
                }`}
              >
                {/* Day Header Banner (Agenda page header) */}
                <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-11 h-11 rounded-xl flex flex-col items-center justify-center border font-mono ${
                        isToday
                          ? 'bg-emerald-600 text-white border-emerald-400 shadow-md shadow-emerald-500/30'
                          : isTomorrow
                          ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                          : 'bg-slate-800 text-slate-300 border-slate-700'
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
                        <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
                          {formatDayHeader(group.date)}
                        </h2>
                        {isToday && (
                          <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/50 text-emerald-300 text-[10px] font-bold uppercase flex items-center gap-1.5 font-mono">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                            Hoy &bull; En Vivo ({clock.timeStr})
                          </span>
                        )}
                        {isTomorrow && (
                          <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 text-[10px] font-bold uppercase">
                            Mañana
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400">
                        {group.tasks.length} {group.tasks.length === 1 ? 'actividad programada' : 'actividades programadas'}{' '}
                        {dayMinutes > 0 && `• ${dayHours}h ${dayMins > 0 ? `${dayMins}m` : ''} de dedicación`}
                      </p>
                    </div>
                  </div>

                  {/* Quick trigger to add task on this specific day */}
                  <div className="flex items-center gap-2">
                    {onAddNewTask && (
                      <button
                        onClick={() => onAddNewTask(group.date)}
                        className="text-xs text-indigo-400 hover:text-white hover:bg-indigo-600 px-2.5 py-1.5 rounded-lg border border-indigo-500/30 hover:border-indigo-500 transition cursor-pointer flex items-center gap-1 font-semibold"
                        title="Añadir tarea manualmente a este día"
                      >
                        <PlusCircle className="w-3.5 h-3.5" />
                        <span>Añadir</span>
                      </button>
                    )}
                    <button
                      onClick={onOpenVisionModal}
                      className="text-xs text-slate-400 hover:text-cyan-400 hover:bg-slate-800 px-2.5 py-1.5 rounded-lg border border-slate-800 transition cursor-pointer flex items-center gap-1"
                      title="Escanear foto u horario"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Escanear</span>
                    </button>
                  </div>
                </div>

                {/* Day Tasks List */}
                {group.tasks.length === 0 ? (
                  <div className="py-6 text-center text-slate-500 text-xs border border-dashed border-slate-800/80 rounded-xl bg-slate-950/30 flex flex-col items-center gap-2">
                    <span>No hay eventos programados para este día.</span>
                    {onAddNewTask && (
                      <button
                        onClick={() => onAddNewTask(group.date)}
                        className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-semibold hover:underline cursor-pointer"
                      >
                        <PlusCircle className="w-3.5 h-3.5" />
                        <span>Añadir tarea para este día</span>
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col gap-2.5">
                    {/* If live marker is at the very beginning of today's tasks */}
                    {isToday && liveMarkerIndex === 0 && (
                      <div className="flex items-center gap-3 my-1 px-1 py-1">
                        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500 text-white font-mono text-[11px] font-extrabold shadow-md shadow-rose-500/40 shrink-0">
                          <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                          AHORA &bull; {clock.timeStr}
                        </div>
                        <div className="h-[2px] flex-1 bg-gradient-to-r from-rose-500 via-rose-400/60 to-transparent" />
                        <span className="text-[11px] font-mono text-rose-300 font-semibold hidden sm:inline">
                          Línea de tiempo en vivo &bull; {clock.dayProgressPercent}% del día
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

                      // Check if live marker line should be rendered immediately before this task
                      const shouldRenderMarkerBefore =
                        isToday && liveMarkerIndex === taskIdx && taskIdx > 0;

                      return (
                        <React.Fragment key={task.id}>
                          {shouldRenderMarkerBefore && (
                            <div className="flex items-center gap-3 my-1.5 px-1 py-1">
                              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500 text-white font-mono text-[11px] font-extrabold shadow-md shadow-rose-500/40 shrink-0">
                                <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                                AHORA &bull; {clock.timeStr}
                              </div>
                              <div className="h-[2px] flex-1 bg-gradient-to-r from-rose-500 via-rose-400/60 to-transparent" />
                              <span className="text-[11px] font-mono text-rose-300 font-semibold hidden sm:inline">
                                {clock.dayProgressPercent}% del día completado
                              </span>
                            </div>
                          )}

                          <div
                            className={`group rounded-xl p-3.5 border transition-all duration-200 flex items-start justify-between gap-3 ${
                              task.completed
                                ? 'bg-slate-950/40 border-slate-800/50 opacity-60'
                                : isCurrentNow
                                ? 'bg-gradient-to-r from-rose-950/40 via-slate-900/90 to-slate-900 border-rose-500/80 shadow-lg shadow-rose-950/50 ring-2 ring-rose-500/40'
                                : 'bg-slate-950/80 border-slate-800 hover:border-slate-700 shadow-sm'
                            }`}
                          >
                            <div className="flex items-start gap-3 min-w-0">
                              {/* Checkbox */}
                              <button
                                onClick={() => onToggleTaskComplete(task.id)}
                                className={`mt-0.5 rounded-full p-1 transition cursor-pointer shrink-0 ${
                                  task.completed
                                    ? 'text-emerald-400 hover:text-slate-400'
                                    : 'text-slate-500 hover:text-emerald-400'
                                }`}
                              >
                                {task.completed ? (
                                  <CheckCircle2 className="w-5 h-5" />
                                ) : (
                                  <Circle className="w-5 h-5" />
                                )}
                              </button>

                              {/* Task Content */}
                              <div className="flex flex-col gap-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span
                                    className={`font-semibold text-sm sm:text-base tracking-tight ${
                                      task.completed
                                        ? 'line-through text-slate-400'
                                        : isCurrentNow
                                        ? 'text-rose-100 font-bold'
                                        : 'text-white'
                                    }`}
                                  >
                                    {task.title}
                                  </span>

                                  {/* Real-time status badge */}
                                  {isCurrentNow && (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-rose-500/25 text-rose-200 border border-rose-500 font-bold uppercase animate-pulse">
                                      <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                                      En Curso Ahora
                                    </span>
                                  )}
                                  {isUpcoming && diffMinutes !== null && diffMinutes <= 90 && diffMinutes > 0 && (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 font-semibold">
                                      Comienza en {diffMinutes} min
                                    </span>
                                  )}

                                  {/* Category Tag Pill */}
                                  <span
                                    className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${meta.bgClass} ${meta.colorClass} ${meta.borderClass}`}
                                  >
                                    {meta.label} ({meta.tagColor})
                                  </span>

                                  {/* Origin Pill */}
                                  {task.sourceType === 'vision' && (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                                      <Camera className="w-2.5 h-2.5" />
                                      Foto
                                    </span>
                                  )}
                                </div>

                                {/* Time & Duration badge */}
                                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 font-mono pt-0.5">
                                  <span className="flex items-center gap-1.5 text-amber-300 font-semibold">
                                    <Clock className="w-3.5 h-3.5 shrink-0" />
                                    {task.time}{task.endTime ? ` - ${task.endTime}` : ''} ({Math.floor(task.durationMinutes / 60)}h{' '}
                                    {task.durationMinutes % 60 > 0 ? `${task.durationMinutes % 60}m` : ''})
                                  </span>

                                  {task.priority === 'alta' && (
                                    <span className="text-rose-400 font-bold text-[11px]">
                                      Alta Prioridad
                                    </span>
                                  )}
                                </div>

                                {task.notes && (
                                  <p className="text-xs text-slate-400 leading-relaxed mt-0.5">
                                    {task.notes}
                                  </p>
                                )}
                              </div>
                            </div>

                            {/* Quick Actions */}
                            <div className="flex items-center gap-0.5 sm:gap-1 shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => onEditTaskRequest(task)}
                                className="w-8 h-8 rounded-lg text-slate-400 hover:text-indigo-300 active:bg-slate-800 flex items-center justify-center transition cursor-pointer"
                                title="Editar tarea"
                                aria-label="Editar tarea"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => onDeleteTask(task.id)}
                                className="w-8 h-8 rounded-lg text-slate-400 hover:text-rose-400 active:bg-slate-800 flex items-center justify-center transition cursor-pointer"
                                title="Eliminar tarea"
                                aria-label="Eliminar tarea"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </React.Fragment>
                      );
                    })}

                    {/* If live marker is after all tasks today */}
                    {isToday && liveMarkerIndex === -1 && group.tasks.length > 0 && (
                      <div className="flex items-center gap-3 my-1.5 px-1 py-1">
                        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500 text-white font-mono text-[11px] font-extrabold shadow-md shadow-rose-500/40 shrink-0">
                          <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                          AHORA &bull; {clock.timeStr}
                        </div>
                        <div className="h-[2px] flex-1 bg-gradient-to-r from-rose-500 via-rose-400/60 to-transparent" />
                        <span className="text-[11px] font-mono text-rose-300 font-semibold hidden sm:inline">
                          Tareas programadas finalizadas &bull; {clock.dayProgressPercent}% del día
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
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-indigo-400 font-semibold uppercase">
                  Vista de Horas &bull; Día Detallado
                </span>
                {activeDate === clock.dateStr && (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[10px] font-bold font-mono">
                    Hoy &bull; {clock.timeStr}
                  </span>
                )}
              </div>
              <h2 className="text-xl font-bold text-white tracking-tight">
                {formatDayHeader(activeDate)}
              </h2>
            </div>
            <div className="flex items-center gap-2">
              {onAddNewTask && (
                <button
                  onClick={() => onAddNewTask(activeDate)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-sm transition cursor-pointer"
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
                className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 transition cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  const idx = calendarDays.findIndex((d) => d.date === activeDate);
                  if (idx < calendarDays.length - 1) setActiveDate(calendarDays[idx + 1].date);
                }}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 transition cursor-pointer"
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
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md shadow-indigo-600/30 transition cursor-pointer"
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
                        ? 'bg-gradient-to-r from-rose-950/40 via-slate-900 to-slate-950 border-rose-500 ring-1 ring-rose-500/40'
                        : 'bg-slate-950 border-slate-800/90 hover:border-slate-700'
                    }`}
                  >
                    <div className="font-mono text-xs sm:text-sm font-bold text-amber-300 shrink-0 min-w-[5.5rem] pt-0.5">
                      {task.time}{task.endTime ? ` - ${task.endTime}` : ''}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-white text-base">{task.title}</h4>
                        {isCurrentNow && (
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/50 font-bold uppercase animate-pulse">
                            En curso ahora
                          </span>
                        )}
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full border ${meta.bgClass} ${meta.colorClass} ${meta.borderClass}`}
                        >
                          {meta.label}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-1 font-mono">
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
                className={`rounded-xl border p-3 flex flex-col gap-2.5 ${
                  day.isToday
                    ? 'bg-slate-900 border-emerald-500/50 shadow-md ring-1 ring-emerald-500/30'
                    : 'bg-slate-900/60 border-slate-800'
                }`}
              >
                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <div className="flex items-center gap-1.5">
                    <span className={`font-bold text-sm ${day.isToday ? 'text-emerald-300' : 'text-white'}`}>
                      {day.dayName} {day.dayNumber}
                    </span>
                    {day.isToday && (
                      <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                        Hoy
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-slate-400 font-mono">
                    {dayTasks.length} {dayTasks.length === 1 ? 'tarea' : 'tareas'}
                  </span>
                </div>

                <div className="flex flex-col gap-2 min-h-[140px]">
                  {dayTasks.length === 0 ? (
                    <span className="text-xs text-slate-600 italic py-4 text-center">
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
                          className={`p-2 rounded-lg border text-xs flex flex-col gap-1 ${
                            isCurrentNow
                              ? 'bg-rose-950/30 border-rose-500/60 shadow-sm'
                              : 'bg-slate-950 border-slate-800'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-semibold text-slate-200 truncate">
                              {t.title}
                            </span>
                            <span className="text-[10px] font-mono text-amber-300 shrink-0">
                              {t.time}{t.endTime ? ` - ${t.endTime}` : ''}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className={`text-[10px] ${meta.colorClass}`}>
                              {meta.label}
                            </span>
                            {isCurrentNow && (
                              <span className="text-[9px] font-mono text-rose-300 font-bold uppercase animate-pulse">
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
