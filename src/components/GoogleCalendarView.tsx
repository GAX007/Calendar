import React, { useState, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  Plus,
  CheckCircle2,
  Circle,
  Trash2,
  Edit2,
  Filter,
  Sparkles,
  ExternalLink,
  Download,
  Dumbbell,
  GraduationCap,
  Eye,
  EyeOff,
  Sun,
  Moon,
  Check,
  Zap,
  RefreshCw,
  ChevronDown,
} from 'lucide-react';
import { TaskItem, CategoryType } from '../types';
import { CATEGORIES, getCategoryMeta } from '../data/categories';
import { RealTimeClockState } from '../hooks/useRealTimeClock';
import { generateGoogleCalendarUrl } from '../utils/icsHelper';
import { syncLiveGoogleCalendar } from '../services/googleCalendarService';

interface GoogleCalendarViewProps {
  tasks: TaskItem[];
  clock: RealTimeClockState;
  userId?: string;
  userEmail?: string;
  onToggleTaskComplete: (taskId: string) => void;
  onDeleteTask: (taskId: string) => void;
  onEditTaskRequest: (task: TaskItem) => void;
  onAddNewTask?: (date?: string, time?: string) => void;
  onOpenSyncModal?: () => void;
  onOpenLinkCalendarModal?: () => void;
  onOpenGymRoutine?: (routineId?: string) => void;
  onLiveSyncSuccess?: (newTasks: TaskItem[]) => void;
  showToast?: (msg: string) => void;
}

type CalendarViewMode = 'day' | '3days' | 'week' | 'agenda';

// Grid starts at 07:00 and ends at 23:00 (16 full hours)
const START_HOUR = 7;
const END_HOUR = 23;
const TOTAL_HOURS = END_HOUR - START_HOUR;
const HOUR_HEIGHT_PX = 64; // height of 1 hour in pixels
const TOTAL_GRID_HEIGHT = TOTAL_HOURS * HOUR_HEIGHT_PX;

interface FreeSlot {
  start: string; // HH:mm
  end: string; // HH:mm
  durationMinutes: number;
}

export const GoogleCalendarView: React.FC<GoogleCalendarViewProps> = ({
  tasks,
  clock,
  userId,
  userEmail,
  onToggleTaskComplete,
  onDeleteTask,
  onEditTaskRequest,
  onAddNewTask,
  onOpenLinkCalendarModal,
  onOpenGymRoutine,
  onLiveSyncSuccess,
  showToast,
}) => {
  const [viewMode, setViewMode] = useState<CalendarViewMode>('week');
  const [activeDate, setActiveDate] = useState<string>(clock.dateStr);
  const [showFreeSlotsBanner, setShowFreeSlotsBanner] = useState<boolean>(true);
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');
  const [isSyncingLive, setIsSyncingLive] = useState<boolean>(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const handleLiveSync = async () => {
    setIsSyncingLive(true);
    try {
      const res = await syncLiveGoogleCalendar(userId, userEmail);
      if (res.success && res.tasks.length > 0) {
        onLiveSyncSuccess?.(res.tasks);
        showToast?.(`✓ ¡${res.tasks.length} eventos sincronizados desde Google Calendar!`);
      } else if (!res.success && res.error?.includes('No tienes un calendario vinculado')) {
        onOpenLinkCalendarModal?.();
      } else {
        showToast?.(res.error || 'No se pudieron recuperar eventos del calendario');
      }
    } catch {
      showToast?.('Error al conectar con Google Calendar');
    } finally {
      setIsSyncingLive(false);
    }
  };

  // Auto-scroll to current hour on initial mount or when view changes
  useEffect(() => {
    if (scrollContainerRef.current) {
      const [currentHour] = clock.timeStr.split(':').map(Number);
      const targetHour = Math.max(START_HOUR, Math.min(END_HOUR - 4, currentHour - 1));
      const scrollY = (targetHour - START_HOUR) * HOUR_HEIGHT_PX;
      scrollContainerRef.current.scrollTop = scrollY;
    }
  }, [viewMode]);

  // Keep activeDate in sync if clock changes date while on today
  const prevClockDate = useRef(clock.dateStr);
  useEffect(() => {
    if (activeDate === prevClockDate.current) {
      setActiveDate(clock.dateStr);
    }
    prevClockDate.current = clock.dateStr;
  }, [clock.dateStr, activeDate]);

  // Generate days based on activeDate and viewMode
  const displayedDays = useMemo(() => {
    const base = new Date(`${activeDate}T12:00:00`);
    const dayOfWeek = base.getDay(); // 0 = Sun, 1 = Mon...
    const spanishDaysShort = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'];
    const spanishDaysFull = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const spanishMonths = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

    const result: Array<{
      date: string;
      dayShort: string;
      dayFull: string;
      dayNumber: number;
      monthName: string;
      year: number;
      isToday: boolean;
      dateObj: Date;
    }> = [];

    let count = 1;
    let startDate = new Date(base);

    if (viewMode === 'day') {
      count = 1;
      startDate = new Date(base);
    } else if (viewMode === '3days') {
      count = 3;
      // Start 1 day before or today
      startDate = new Date(base);
    } else if (viewMode === 'week') {
      count = 7;
      // Anchor to Monday
      const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      startDate = new Date(base);
      startDate.setDate(startDate.getDate() + diffToMonday);
    } else {
      count = 7;
    }

    for (let i = 0; i < count; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      const y = d.getFullYear();
      const m = (d.getMonth() + 1).toString().padStart(2, '0');
      const dayNum = d.getDate();
      const dayStr = dayNum.toString().padStart(2, '0');
      const dateStr = `${y}-${m}-${dayStr}`;

      result.push({
        date: dateStr,
        dayShort: spanishDaysShort[d.getDay()],
        dayFull: spanishDaysFull[d.getDay()],
        dayNumber: dayNum,
        monthName: spanishMonths[d.getMonth()],
        year: y,
        isToday: dateStr === clock.dateStr,
        dateObj: d,
      });
    }

    return result;
  }, [activeDate, viewMode, clock.dateStr]);

  // Navigation handlers
  const handleJumpToToday = () => {
    setActiveDate(clock.dateStr);
  };

  const handlePrev = () => {
    const d = new Date(`${activeDate}T12:00:00`);
    const delta = viewMode === 'week' ? 7 : viewMode === '3days' ? 3 : 1;
    d.setDate(d.getDate() - delta);
    const y = d.getFullYear();
    const m = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    setActiveDate(`${y}-${m}-${day}`);
  };

  const handleNext = () => {
    const d = new Date(`${activeDate}T12:00:00`);
    const delta = viewMode === 'week' ? 7 : viewMode === '3days' ? 3 : 1;
    d.setDate(d.getDate() + delta);
    const y = d.getFullYear();
    const m = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    setActiveDate(`${y}-${m}-${day}`);
  };

  // Header Title Range (e.g. "Octubre 2026" or "6 - 12 de Octubre, 2026")
  const headerDateTitle = useMemo(() => {
    if (displayedDays.length === 0) return '';
    const first = displayedDays[0];
    const last = displayedDays[displayedDays.length - 1];
    if (displayedDays.length === 1) {
      return `${first.dayFull}, ${first.dayNumber} de ${first.monthName} ${first.year}`;
    }
    if (first.monthName === last.monthName) {
      return `${first.dayNumber} - ${last.dayNumber} de ${first.monthName} ${first.year}`;
    }
    return `${first.dayNumber} de ${first.monthName} - ${last.dayNumber} de ${last.monthName} ${last.year}`;
  }, [displayedDays]);

  // Filter tasks by selected category
  const filteredTasks = useMemo(() => {
    if (selectedCategoryFilter === 'all') return tasks;
    return tasks.filter((t) => t.category === selectedCategoryFilter);
  }, [tasks, selectedCategoryFilter]);

  // Calculate free time slots for today (or activeDate)
  const freeSlotsToday = useMemo<FreeSlot[]>(() => {
    const targetDate = activeDate;
    const dayTasks = tasks
      .filter((t) => t.date === targetDate && !t.completed)
      .map((t) => {
        const [sH, sM] = t.time.split(':').map(Number);
        const [eH, eM] = (t.endTime || '23:59').split(':').map(Number);
        return {
          startMins: sH * 60 + sM,
          endMins: eH * 60 + eM,
        };
      })
      .sort((a, b) => a.startMins - b.startMins);

    const dayStartMins = START_HOUR * 60;
    const dayEndMins = END_HOUR * 60;

    const slots: FreeSlot[] = [];
    let currentCursor = dayStartMins;

    for (const t of dayTasks) {
      if (t.startMins > currentCursor) {
        const gapMins = t.startMins - currentCursor;
        if (gapMins >= 30) {
          // meaningful free gap >= 30 minutes
          const sH = Math.floor(currentCursor / 60).toString().padStart(2, '0');
          const sM = (currentCursor % 60).toString().padStart(2, '0');
          const eH = Math.floor(t.startMins / 60).toString().padStart(2, '0');
          const eM = (t.startMins % 60).toString().padStart(2, '0');
          slots.push({
            start: `${sH}:${sM}`,
            end: `${eH}:${eM}`,
            durationMinutes: gapMins,
          });
        }
      }
      currentCursor = Math.max(currentCursor, t.endMins);
    }

    if (currentCursor < dayEndMins) {
      const gapMins = dayEndMins - currentCursor;
      if (gapMins >= 30) {
        const sH = Math.floor(currentCursor / 60).toString().padStart(2, '0');
        const sM = (currentCursor % 60).toString().padStart(2, '0');
        const eH = Math.floor(dayEndMins / 60).toString().padStart(2, '0');
        const eM = (dayEndMins % 60).toString().padStart(2, '0');
        slots.push({
          start: `${sH}:${sM}`,
          end: `${eH}:${eM}`,
          durationMinutes: gapMins,
        });
      }
    }

    return slots;
  }, [tasks, activeDate]);

  const totalFreeHoursToday = useMemo(() => {
    const totalMins = freeSlotsToday.reduce((acc, s) => acc + s.durationMinutes, 0);
    return (totalMins / 60).toFixed(1);
  }, [freeSlotsToday]);

  // Layout positioning for tasks within a day column
  const getPositionedTasksForDay = (dateStr: string) => {
    const dayTasks = filteredTasks.filter((t) => t.date === dateStr);

    return dayTasks.map((task) => {
      const [sH, sM] = task.time.split(':').map(Number);
      const startMinutes = sH * 60 + sM;
      const duration = task.durationMinutes || 60;

      // Clamp between START_HOUR and END_HOUR
      const gridStartMinutes = START_HOUR * 60;
      const totalGridMinutes = TOTAL_HOURS * 60;

      const topPx = Math.max(
        0,
        ((startMinutes - gridStartMinutes) / totalGridMinutes) * TOTAL_GRID_HEIGHT
      );
      const heightPx = Math.max(
        28,
        (duration / totalGridMinutes) * TOTAL_GRID_HEIGHT - 2
      );

      return {
        task,
        topPx,
        heightPx,
        startMinutes,
      };
    });
  };

  // Current live red time line position
  const currentLiveTopPx = useMemo(() => {
    const [cH, cM] = clock.timeStr.split(':').map(Number);
    const currentMins = cH * 60 + cM;
    const gridStartMinutes = START_HOUR * 60;
    const totalGridMinutes = TOTAL_HOURS * 60;

    if (currentMins < gridStartMinutes || currentMins > END_HOUR * 60) {
      return null;
    }

    return ((currentMins - gridStartMinutes) / totalGridMinutes) * TOTAL_GRID_HEIGHT;
  }, [clock.timeStr]);

  return (
    <div className="flex flex-col gap-3 w-full">
      {/* ========================================================================= */}
      {/* GOOGLE CALENDAR HEADER CONTROL BAR                                        */}
      {/* ========================================================================= */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-3 sm:p-4 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Left: Today button, Prev/Next, Title */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <button
            onClick={handleJumpToToday}
            className="px-3.5 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 transition cursor-pointer active:scale-95 shadow-2xs"
          >
            Hoy
          </button>

          <div className="flex items-center gap-1">
            <button
              onClick={handlePrev}
              title="Anterior"
              className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={handleNext}
              title="Siguiente"
              className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <h2 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white tracking-tight">
            {headerDateTitle}
          </h2>

          {/* Free hours badge */}
          <div
            onClick={() => setShowFreeSlotsBanner((prev) => !prev)}
            title="Toca para ver u ocultar el desglose de horas libres"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-xs font-bold cursor-pointer hover:bg-emerald-100/70 transition shadow-2xs"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>{totalFreeHoursToday}h libres detectadas</span>
          </div>
        </div>

        {/* Right: View mode selector, Sync button & Add Task button */}
        <div className="flex items-center gap-2 self-start md:self-auto flex-wrap sm:flex-nowrap">
          {/* Category quick filter */}
          <select
            value={selectedCategoryFilter}
            onChange={(e) => setSelectedCategoryFilter(e.target.value)}
            className="text-xs font-semibold py-1.5 px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-pointer outline-hidden shadow-2xs"
          >
            <option value="all">Todas las categorías</option>
            <option value="Academics">Académico</option>
            <option value="Sports/Karate">Deportes / Gym</option>
            <option value="Work">Trabajo</option>
            <option value="Personal">Personal</option>
            <option value="Health">Salud</option>
          </select>

          {/* View mode selector (Semana, 3 Días, Día, Agenda) */}
          <div className="relative flex items-center shrink-0">
            <div className="pointer-events-none absolute left-2.5 flex items-center text-indigo-600 dark:text-indigo-400">
              <CalendarIcon className="w-3.5 h-3.5" />
            </div>
            <select
              id="calendar-view-mode-selector"
              value={viewMode}
              onChange={(e) => setViewMode(e.target.value as CalendarViewMode)}
              className="pl-7 pr-7 py-1.5 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-750 cursor-pointer outline-hidden shadow-2xs appearance-none transition"
              title="Seleccionar vista del calendario"
            >
              <option value="week">Semana</option>
              <option value="3days">3 Días</option>
              <option value="day">Día</option>
              <option value="agenda">Agenda</option>
            </select>
            <div className="pointer-events-none absolute right-2 flex items-center text-slate-400">
              <ChevronDown className="w-3.5 h-3.5" />
            </div>
          </div>

          {/* Subtle live sync button */}
          <button
            type="button"
            onClick={handleLiveSync}
            disabled={isSyncingLive}
            className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 hover:bg-slate-50 dark:hover:bg-slate-750 transition cursor-pointer shrink-0 shadow-2xs active:scale-95 disabled:opacity-60"
            title="Sincronizado automáticamente con Google Calendar (haz clic para refrescar ahora)"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncingLive ? 'animate-spin text-indigo-600' : ''}`} />
          </button>

          {/* Quick button to link or edit user's Google Calendar */}
          {onOpenLinkCalendarModal && (
            <button
              type="button"
              onClick={onOpenLinkCalendarModal}
              className="p-1.5 rounded-xl border border-blue-200 dark:border-blue-800/80 bg-blue-50/70 dark:bg-blue-950/40 text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/60 transition cursor-pointer shrink-0 shadow-2xs active:scale-95"
              title="Vincular / Configurar mi Google Calendar (.ics)"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Add Task Button */}
          {onAddNewTask && (
            <button
              onClick={() => onAddNewTask(activeDate)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs transition cursor-pointer shrink-0 active:scale-95"
              title="Añadir nueva actividad"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Crear</span>
            </button>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* FREE SLOTS BANNER (Huecos libres del día)                                 */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {showFreeSlotsBanner && freeSlotsToday.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-emerald-50/70 dark:bg-emerald-950/25 border border-emerald-200/90 dark:border-emerald-900/60 rounded-2xl p-3 sm:p-3.5 flex flex-col gap-2 shadow-2xs overflow-hidden"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span className="text-xs font-bold text-emerald-800 dark:text-emerald-200">
                  Huecos libres disponibles para hoy ({activeDate}):
                </span>
                <span className="text-[11px] text-emerald-600 dark:text-emerald-400">
                  {totalFreeHoursToday} horas libres en total
                </span>
              </div>
              <button
                onClick={() => setShowFreeSlotsBanner(false)}
                className="text-emerald-600 hover:text-emerald-800 dark:hover:text-emerald-200 text-xs font-bold cursor-pointer"
              >
                Ocultar
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {freeSlotsToday.map((slot, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => onAddNewTask && onAddNewTask(activeDate, slot.start)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800 text-slate-800 dark:text-slate-200 text-xs font-semibold hover:border-emerald-400 dark:hover:border-emerald-500 hover:shadow-xs transition cursor-pointer active:scale-95"
                  title="Haz clic para programar una actividad en este hueco libre"
                >
                  <Clock className="w-3 h-3 text-emerald-600" />
                  <span>
                    {slot.start} - {slot.end} ({Math.floor(slot.durationMinutes / 60)}h{' '}
                    {slot.durationMinutes % 60 > 0 ? `${slot.durationMinutes % 60}m` : ''} libre)
                  </span>
                  <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-bold ml-1">
                    + Agendar
                  </span>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ========================================================================= */}
      {/* VIEW: AGENDA OR TIME-GRID                                                 */}
      {/* ========================================================================= */}
      {viewMode === 'agenda' ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-4 sm:p-5 flex flex-col gap-4 shadow-xs">
          <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200 pb-2 border-b border-slate-100 dark:border-slate-800">
            Agenda Lineal de Actividades ({filteredTasks.length} en total)
          </h3>
          {filteredTasks.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              No hay actividades para los filtros actuales.
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {filteredTasks.map((task) => {
                const meta = getCategoryMeta(task.category);
                return (
                  <div
                    key={task.id}
                    className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 ${
                      task.completed
                        ? 'bg-slate-100/70 dark:bg-slate-850/40 border-slate-200 dark:border-slate-800 border-l-4 border-l-slate-300 dark:border-l-slate-700 opacity-60'
                        : `${meta.cardBg} ${meta.cardBorder} border-l-4 ${meta.leftBar} shadow-xs`
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <button
                        onClick={() => onToggleTaskComplete(task.id)}
                        className="text-slate-400 hover:text-emerald-500 cursor-pointer shrink-0"
                      >
                        {task.completed ? (
                          <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                        ) : (
                          <Circle className="w-5 h-5" />
                        )}
                      </button>
                      <div className="min-w-0">
                        <h4
                          className={`font-bold text-sm text-slate-900 dark:text-white truncate ${
                            task.completed ? 'line-through text-slate-400' : ''
                          }`}
                        >
                          {task.title}
                        </h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {task.date} &bull; {task.time}{task.endTime ? ` - ${task.endTime}` : ''} ({task.durationMinutes}m) &bull;{' '}
                          <span className={`font-semibold ${meta.colorClass}`}>{meta.label}</span>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <a
                        href={generateGoogleCalendarUrl(task)}
                        target="_blank"
                        rel="noreferrer"
                        title="Abrir en Google Calendar"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                      <button
                        onClick={() => onEditTaskRequest(task)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => onDeleteTask(task.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* ========================================================================= */
        /* VIEW 2: GOOGLE CALENDAR TIME GRID (DAY / 3 DAYS / WEEK)                   */
        /* ========================================================================= */
        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-3xl shadow-sm overflow-hidden flex flex-col">
          {/* Day Column Headers (Sticky Top) */}
          <div className="flex border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-850/80 backdrop-blur-xs">
            {/* Left corner spacer above time labels */}
            <div className="w-14 sm:w-16 shrink-0 border-r border-slate-200/80 dark:border-slate-800 flex items-center justify-center p-2 text-[10px] font-bold text-slate-400">
              GMT+2
            </div>

            {/* Day columns headers */}
            <div className="flex-1 grid" style={{ gridTemplateColumns: `repeat(${displayedDays.length}, minmax(0, 1fr))` }}>
              {displayedDays.map((day) => (
                <div
                  key={day.date}
                  className={`p-2.5 sm:p-3 text-center border-r last:border-r-0 border-slate-200/70 dark:border-slate-800 flex flex-col items-center justify-center gap-0.5 cursor-pointer transition hover:bg-slate-100/50 dark:hover:bg-slate-800/50 ${
                    day.isToday ? 'bg-indigo-50/40 dark:bg-indigo-950/20' : ''
                  }`}
                  onClick={() => setActiveDate(day.date)}
                >
                  <span className={`text-[10px] sm:text-xs font-bold tracking-wider ${
                    day.isToday ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400'
                  }`}>
                    {day.dayShort}
                  </span>
                  <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs sm:text-sm font-extrabold transition ${
                    day.isToday
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : day.date === activeDate
                      ? 'bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white'
                      : 'text-slate-800 dark:text-slate-200'
                  }`}>
                    {day.dayNumber}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Scrollable Hourly Time Grid */}
          <div
            ref={scrollContainerRef}
            className="overflow-y-auto max-h-[70vh] relative flex"
          >
            {/* Time labels gutter (Left Column) */}
            <div
              className="w-14 sm:w-16 shrink-0 border-r border-slate-200/80 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-950/30 select-none relative"
              style={{ height: `${TOTAL_GRID_HEIGHT}px` }}
            >
              {Array.from({ length: TOTAL_HOURS }).map((_, idx) => {
                const hour = START_HOUR + idx;
                const timeLabel = `${hour.toString().padStart(2, '0')}:00`;
                return (
                  <div
                    key={hour}
                    className="absolute right-2 text-[10px] sm:text-[11px] font-mono text-slate-400 font-medium"
                    style={{ top: `${idx * HOUR_HEIGHT_PX - 8}px` }}
                  >
                    {timeLabel}
                  </div>
                );
              })}
            </div>

            {/* Grid Columns Area */}
            <div
              className="flex-1 grid relative"
              style={{
                gridTemplateColumns: `repeat(${displayedDays.length}, minmax(0, 1fr))`,
                height: `${TOTAL_GRID_HEIGHT}px`,
              }}
            >
              {/* Horizontal background grid lines */}
              <div className="absolute inset-0 pointer-events-none z-0">
                {Array.from({ length: TOTAL_HOURS }).map((_, idx) => (
                  <React.Fragment key={idx}>
                    {/* Hour line */}
                    <div
                      className="absolute inset-x-0 border-b border-slate-200/60 dark:border-slate-800/80"
                      style={{ top: `${(idx + 1) * HOUR_HEIGHT_PX}px` }}
                    />
                    {/* Half-hour dashed guide */}
                    <div
                      className="absolute inset-x-0 border-b border-dashed border-slate-100 dark:border-slate-800/40"
                      style={{ top: `${idx * HOUR_HEIGHT_PX + HOUR_HEIGHT_PX / 2}px` }}
                    />
                  </React.Fragment>
                ))}
              </div>

              {/* Day Columns */}
              {displayedDays.map((day) => {
                const dayTasks = getPositionedTasksForDay(day.date);

                return (
                  <div
                    key={day.date}
                    className="relative border-r last:border-r-0 border-slate-200/70 dark:border-slate-800/80 h-full group"
                    onClick={(e) => {
                      if (onAddNewTask && e.target === e.currentTarget) {
                        // Calculate clicked hour
                        const rect = e.currentTarget.getBoundingClientRect();
                        const clickY = e.clientY - rect.top;
                        const clickedHour = Math.floor(clickY / HOUR_HEIGHT_PX) + START_HOUR;
                        const timeStr = `${clickedHour.toString().padStart(2, '0')}:00`;
                        onAddNewTask(day.date, timeStr);
                      }
                    }}
                  >
                    {/* Click-to-add empty hour slot indicators */}
                    {Array.from({ length: TOTAL_HOURS }).map((_, hIdx) => {
                      const hourVal = START_HOUR + hIdx;
                      return (
                        <div
                          key={hourVal}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onAddNewTask) {
                              onAddNewTask(day.date, `${hourVal.toString().padStart(2, '0')}:00`);
                            }
                          }}
                          className="absolute inset-x-0 cursor-pointer hover:bg-indigo-50/30 dark:hover:bg-indigo-950/20 transition-colors group/cell"
                          style={{
                            top: `${hIdx * HOUR_HEIGHT_PX}px`,
                            height: `${HOUR_HEIGHT_PX}px`,
                          }}
                          title={`Click para agendar a las ${hourVal.toString().padStart(2, '0')}:00 en ${day.dayShort} ${day.dayNumber}`}
                        >
                          <span className="opacity-0 group-hover/cell:opacity-100 transition-opacity text-[10px] text-indigo-500 dark:text-indigo-400 font-bold ml-2 mt-1 inline-block">
                            + Libre {hourVal}:00
                          </span>
                        </div>
                      );
                    })}

                    {/* Live red time marker for Today */}
                    {day.isToday && currentLiveTopPx !== null && (
                      <div
                        className="absolute inset-x-0 z-20 pointer-events-none flex items-center"
                        style={{ top: `${currentLiveTopPx}px` }}
                      >
                        <div className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-sm shrink-0 -ml-1.5 ring-2 ring-white dark:ring-slate-900" />
                        <div className="h-[2px] flex-1 bg-rose-500 shadow-xs" />
                        <span className="text-[9px] font-mono font-bold bg-rose-500 text-white px-1 rounded-sm shrink-0 shadow-2xs mr-1">
                          {clock.timeStr}
                        </span>
                      </div>
                    )}

                    {/* Placed Event Blocks */}
                    {dayTasks.map(({ task, topPx, heightPx }) => {
                      const meta = getCategoryMeta(task.category);
                      const isCompleted = task.completed;

                      return (
                        <div
                          key={task.id}
                          style={{
                            top: `${topPx}px`,
                            height: `${heightPx}px`,
                            left: '2px',
                            right: '2px',
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            onEditTaskRequest(task);
                          }}
                          className={`absolute z-10 rounded-xl p-1.5 sm:p-2 border transition-all cursor-pointer shadow-2xs hover:shadow-md hover:z-30 flex flex-col justify-between overflow-hidden group/item ${
                            isCompleted
                              ? 'bg-slate-100/80 dark:bg-slate-850/60 border-slate-300 dark:border-slate-700 opacity-60 border-l-4 border-l-slate-400'
                              : `${meta.cardBg} ${meta.cardBorder} border-l-4 ${meta.leftBar} hover:brightness-95`
                          }`}
                          title={`${task.title} (${task.time} - ${task.endTime || 'fin'})`}
                        >
                          {/* Event Header: Title & Time */}
                          <div className="min-w-0">
                            <div className="flex items-center justify-between gap-1">
                              <span
                                className={`text-[11px] sm:text-xs font-bold truncate leading-tight ${
                                  isCompleted
                                    ? 'line-through text-slate-500'
                                    : 'text-slate-900 dark:text-white'
                                }`}
                              >
                                {task.title}
                              </span>

                              {/* Complete Checkbox */}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onToggleTaskComplete(task.id);
                                }}
                                className="text-slate-400 hover:text-emerald-500 transition shrink-0"
                              >
                                {isCompleted ? (
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                                ) : (
                                  <Circle className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>

                            <div className="flex items-center gap-1.5 text-[10px] text-slate-600 dark:text-slate-300 font-medium">
                              <Clock className="w-2.5 h-2.5 shrink-0 opacity-70" />
                              <span>
                                {task.time}{task.endTime ? ` - ${task.endTime}` : ''}
                              </span>
                            </div>
                          </div>

                          {/* Gym routine button if applicable & enough height */}
                          {heightPx > 48 && onOpenGymRoutine && (task.category === 'Sports/Karate' || task.title.toLowerCase().includes('gym')) && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpenGymRoutine();
                              }}
                              className="mt-1 self-start inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300 hover:bg-rose-200 transition"
                            >
                              <Dumbbell className="w-2.5 h-2.5" />
                              <span>Rutina</span>
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
