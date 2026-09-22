import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence, Reorder, useDragControls } from 'motion/react';
import {
  Dumbbell,
  Flame,
  CheckCircle2,
  Circle,
  Clock,
  Plus,
  Trash2,
  Edit2,
  Timer,
  Play,
  Pause,
  RotateCcw,
  Calendar as CalendarIcon,
  Sparkles,
  X,
  Check,
  Zap,
  Target,
  FileText,
  Weight,
  Layers,
  Info,
  Pencil,
  ChevronUp,
  ChevronDown,
  ArrowUpDown,
  GripVertical,
} from 'lucide-react';
import { GymRoutine, ExerciseItem, TaskItem } from '../types';
import {
  getLocalGymRoutines,
  saveGymRoutine,
  deleteGymRoutine,
  toggleSetCompletion,
  resetWorkoutSession,
  subscribeToGymChanges,
  reorderExercise,
} from '../services/gymService';
import { RealTimeClockState } from '../hooks/useRealTimeClock';

interface GymModuleProps {
  clock: RealTimeClockState;
  userId?: string;
  userEmail?: string;
  onScheduleRoutineInCalendar?: (task: TaskItem) => void;
  onClose?: () => void;
  initialRoutineId?: string;
}

interface ExerciseReorderRowProps {
  exercise: ExerciseItem;
  exIndex: number;
  totalExercises: number;
  routineId: string;
  userId?: string;
  userEmail?: string;
  timerPreset: number;
  onStartTimer: (seconds: number) => void;
  onEdit: () => void;
  onDelete: () => void;
  onQuickWeightChange: (exerciseId: string, newWeight: string) => void;
  onNudgeUp?: () => void;
  onNudgeDown?: () => void;
  onDragEndFinal?: () => void;
}

const ExerciseReorderRow: React.FC<ExerciseReorderRowProps> = ({
  exercise,
  exIndex,
  totalExercises,
  routineId,
  userId,
  userEmail,
  timerPreset,
  onStartTimer,
  onEdit,
  onDelete,
  onQuickWeightChange,
  onNudgeUp,
  onNudgeDown,
  onDragEndFinal,
}) => {
  const dragControls = useDragControls();
  const setsCount = parseInt(exercise.setsReps.match(/^(\d+)/)?.[1] || '3', 10);
  const completedSets = exercise.completedSets || new Array(setsCount).fill(false);
  const isAllDone = completedSets.slice(0, setsCount).every(Boolean);

  return (
    <Reorder.Item
      as="div"
      value={exercise}
      dragListener={false}
      dragControls={dragControls}
      onDragEnd={onDragEndFinal}
      className={`p-4 sm:p-5 transition-colors relative ${
        isAllDone ? 'bg-emerald-950/15' : 'hover:bg-slate-850/40'
      }`}
      whileDrag={{
        scale: 1.015,
        backgroundColor: 'rgba(15, 23, 42, 0.96)',
        boxShadow: '0 20px 30px -10px rgba(0, 0, 0, 0.8), 0 0 0 2px rgba(244, 63, 94, 0.5)',
        zIndex: 50,
      }}
    >
      {/* Desktop Layout: Grid */}
      <div className="hidden lg:grid grid-cols-12 gap-3 items-start">
        {/* 1. Orden & Ejercicio */}
        <div className="col-span-3 flex items-start gap-2.5">
          {/* Drag Handle with Live Number Badge */}
          <div
            onPointerDown={(e) => dragControls.start(e)}
            className="flex items-center gap-1.5 px-2 py-1 rounded-xl bg-slate-800/90 hover:bg-rose-500/20 border border-slate-700 hover:border-rose-500/50 cursor-grab active:cursor-grabbing touch-none transition-all group shrink-0 mt-0.5 select-none shadow-sm"
            title="Mantén pulsado y arrastra hacia arriba o abajo para reordenar"
          >
            <GripVertical className="w-4 h-4 text-slate-400 group-hover:text-rose-400 transition-colors" />
            <span className="font-mono text-xs font-bold text-slate-300 group-hover:text-rose-300">
              #{exIndex + 1}
            </span>
          </div>

          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="font-bold text-sm text-white tracking-tight leading-snug break-words">
              {exercise.name}
            </span>
            {exercise.muscleGroup && (
              <span className="text-[11px] text-slate-400">{exercise.muscleGroup}</span>
            )}
          </div>
        </div>

        {/* 2. Series x Repes */}
        <div className="col-span-2 flex flex-col items-center justify-center gap-1.5">
          <span className="px-2.5 py-1 rounded-lg bg-slate-800/90 border border-slate-700 text-xs font-mono font-bold text-white shadow-inner">
            {exercise.setsReps}
          </span>

          {/* Interactive Set Checkboxes */}
          <div className="flex items-center gap-1">
            {Array.from({ length: setsCount }).map((_, sIdx) => {
              const done = completedSets[sIdx];
              return (
                <button
                  key={sIdx}
                  type="button"
                  onClick={() => {
                    toggleSetCompletion(routineId, exercise.id, sIdx, userId, userEmail);
                    if (!done) onStartTimer(timerPreset);
                  }}
                  className={`w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-mono font-bold transition active:scale-90 cursor-pointer ${
                    done
                      ? 'bg-emerald-500 text-slate-950 shadow-sm shadow-emerald-500/40'
                      : 'bg-slate-800 border border-slate-700 text-slate-400 hover:border-slate-500 hover:text-white'
                  }`}
                  title={`Serie ${sIdx + 1}: ${done ? 'Completada' : 'Pendiente'}`}
                >
                  {done ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : sIdx + 1}
                </button>
              );
            })}
          </div>
        </div>

        {/* 3. Peso */}
        <div className="col-span-2 flex flex-col items-center justify-center gap-1">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 font-mono text-xs font-bold text-rose-300">
            <Weight className="w-3.5 h-3.5 text-rose-400" />
            <input
              type="text"
              value={exercise.weight}
              onChange={(e) => onQuickWeightChange(exercise.id, e.target.value)}
              className="w-20 bg-transparent text-center text-white focus:outline-none focus:bg-slate-900 rounded"
              placeholder="80 kg"
            />
          </div>
          <span className="text-[9px] text-slate-500 font-mono">Modificable</span>
        </div>

        {/* 4. Transferencia */}
        <div className="col-span-2 flex flex-col gap-1">
          <div className="p-2 rounded-xl bg-amber-950/20 border border-amber-500/30 text-amber-200/90 text-xs leading-relaxed">
            <div className="flex items-center gap-1 font-bold text-[10px] uppercase text-amber-400 mb-0.5 font-mono">
              <Flame className="w-3 h-3" />
              <span>Transferencia</span>
            </div>
            {exercise.transfer || 'Fuerza general'}
          </div>
        </div>

        {/* 5. Ejecución */}
        <div className="col-span-2 flex flex-col gap-1">
          <div className="p-2 rounded-xl bg-slate-800/60 border border-slate-700/80 text-slate-300 text-xs leading-relaxed">
            <div className="flex items-center gap-1 font-bold text-[10px] uppercase text-indigo-300 mb-0.5 font-mono">
              <FileText className="w-3 h-3 text-indigo-400" />
              <span>Técnica / Tempo</span>
            </div>
            {exercise.execution || 'Control estricto'}
          </div>
        </div>

        {/* Acciones */}
        <div className="col-span-1 flex items-center justify-end gap-1">
          {/* Subtle nudge arrows */}
          <div className="flex flex-col -space-y-1 mr-0.5">
            <button
              type="button"
              disabled={exIndex === 0}
              onClick={onNudgeUp}
              title="Subir posición"
              className="p-0.5 text-slate-500 hover:text-white disabled:opacity-20 transition cursor-pointer"
            >
              <ChevronUp className="w-3 h-3" />
            </button>
            <button
              type="button"
              disabled={exIndex === totalExercises - 1}
              onClick={onNudgeDown}
              title="Bajar posición"
              className="p-0.5 text-slate-500 hover:text-white disabled:opacity-20 transition cursor-pointer"
            >
              <ChevronDown className="w-3 h-3" />
            </button>
          </div>
          <button
            type="button"
            onClick={onEdit}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            title="Editar ejercicio completo"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer"
            title="Eliminar ejercicio"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Mobile Layout: Responsive Card */}
      <div className="flex flex-col gap-3 lg:hidden">
        {/* Top Row: Drag Handle, Name, Actions */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2.5 min-w-0">
            {/* Mobile Drag Handle */}
            <div
              onPointerDown={(e) => dragControls.start(e)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-800/90 border border-slate-700 active:border-rose-500 active:bg-rose-500/20 cursor-grab active:cursor-grabbing touch-none shrink-0 select-none shadow-sm"
              title="Mantén pulsado y arrastra para reordenar"
            >
              <GripVertical className="w-4 h-4 text-rose-400" />
              <span className="font-mono text-xs font-bold text-rose-300">
                #{exIndex + 1}
              </span>
            </div>

            <div className="min-w-0 pt-0.5">
              <h4 className="font-bold text-sm text-white leading-tight break-words">{exercise.name}</h4>
              {exercise.muscleGroup && (
                <span className="text-xs text-slate-400">{exercise.muscleGroup}</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <div className="flex flex-col -space-y-1 mr-0.5">
              <button
                type="button"
                disabled={exIndex === 0}
                onClick={onNudgeUp}
                className="p-0.5 text-slate-500 hover:text-white disabled:opacity-20 transition"
                title="Subir posición"
              >
                <ChevronUp className="w-3 h-3" />
              </button>
              <button
                type="button"
                disabled={exIndex === totalExercises - 1}
                onClick={onNudgeDown}
                className="p-0.5 text-slate-500 hover:text-white disabled:opacity-20 transition"
                title="Bajar posición"
              >
                <ChevronDown className="w-3 h-3" />
              </button>
            </div>
            <button
              type="button"
              onClick={onEdit}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              title="Editar ejercicio"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition"
              title="Eliminar ejercicio"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Badges: Series x Repes & Peso */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-xs font-mono font-bold text-white">
            <span>Series:</span>
            <span className="text-rose-300">{exercise.setsReps}</span>
          </div>

          <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-xs font-mono font-bold text-white">
            <Weight className="w-3 h-3 text-rose-400" />
            <input
              type="text"
              value={exercise.weight}
              onChange={(e) => onQuickWeightChange(exercise.id, e.target.value)}
              className="w-16 bg-transparent text-center text-white focus:outline-none font-mono"
              placeholder="80 kg"
            />
          </div>

          {/* Interactive Set Checkboxes for Mobile */}
          <div className="flex items-center gap-1 ml-auto">
            {Array.from({ length: setsCount }).map((_, sIdx) => {
              const done = completedSets[sIdx];
              return (
                <button
                  key={sIdx}
                  type="button"
                  onClick={() => {
                    toggleSetCompletion(routineId, exercise.id, sIdx, userId, userEmail);
                    if (!done) onStartTimer(timerPreset);
                  }}
                  className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-mono font-bold transition active:scale-90 ${
                    done
                      ? 'bg-emerald-500 text-slate-950 font-black'
                      : 'bg-slate-800 border border-slate-700 text-slate-300'
                  }`}
                >
                  {done ? <Check className="w-4 h-4 stroke-[3]" /> : sIdx + 1}
                </button>
              );
            })}
          </div>
        </div>

        {/* Section 4: Transferencia */}
        <div className="p-2.5 rounded-xl bg-amber-950/20 border border-amber-500/30 text-amber-200/90 text-xs leading-relaxed">
          <div className="flex items-center gap-1 font-bold text-[10px] uppercase text-amber-400 mb-0.5 font-mono">
            <Flame className="w-3 h-3" />
            <span>4. Transferencia Deportiva</span>
          </div>
          <p>{exercise.transfer}</p>
        </div>

        {/* Section 5: Ejecución */}
        <div className="p-2.5 rounded-xl bg-slate-800/60 border border-slate-700 text-slate-300 text-xs leading-relaxed">
          <div className="flex items-center gap-1 font-bold text-[10px] uppercase text-indigo-300 mb-0.5 font-mono">
            <FileText className="w-3 h-3 text-indigo-400" />
            <span>5. Ejecución Técnica</span>
          </div>
          <p>{exercise.execution}</p>
        </div>
      </div>
    </Reorder.Item>
  );
};

export const GymModule: React.FC<GymModuleProps> = ({
  clock,
  userId,
  userEmail,
  onScheduleRoutineInCalendar,
  onClose,
  initialRoutineId,
}) => {
  const [routines, setRoutines] = useState<GymRoutine[]>(() => getLocalGymRoutines(userId, userEmail));
  const [activeRoutineId, setActiveRoutineId] = useState<string>(() => {
    if (initialRoutineId && routines.some((r) => r.id === initialRoutineId)) {
      return initialRoutineId;
    }
    return routines[0]?.id || '';
  });

  const [isWorkoutMode, setIsWorkoutMode] = useState<boolean>(false);

  // Modals
  const [editingExercise, setEditingExercise] = useState<{
    exercise: ExerciseItem | null;
    routineId: string;
    exerciseIndex?: number;
  } | null>(null);
  const [isCreatingRoutine, setIsCreatingRoutine] = useState<boolean>(false);
  const [editingRoutineMeta, setEditingRoutineMeta] = useState<GymRoutine | null>(null);
  const [scheduleModalRoutine, setScheduleModalRoutine] = useState<GymRoutine | null>(null);
  const [scheduleDate, setScheduleDate] = useState<string>(clock.dateStr);
  const [scheduleTime, setScheduleTime] = useState<string>('18:00');

  // Rest Timer State
  const [timerSeconds, setTimerSeconds] = useState<number>(0);
  const [isTimerRunning, setIsTimerRunning] = useState<boolean>(false);
  const [timerPreset, setTimerPreset] = useState<number>(90);

  // Subscribe to external/local changes
  useEffect(() => {
    const unsub = subscribeToGymChanges(() => {
      setRoutines(getLocalGymRoutines(userId, userEmail));
    });
    return unsub;
  }, [userId, userEmail]);

  // Keep active routine valid
  useEffect(() => {
    if (!routines.some((r) => r.id === activeRoutineId) && routines.length > 0) {
      setActiveRoutineId(routines[0].id);
    }
  }, [routines, activeRoutineId]);

  // Active routine object
  const activeRoutine = useMemo(() => {
    return routines.find((r) => r.id === activeRoutineId) || routines[0] || null;
  }, [routines, activeRoutineId]);

  // Timer countdown
  useEffect(() => {
    let interval: any = null;
    if (isTimerRunning && timerSeconds > 0) {
      interval = setInterval(() => {
        setTimerSeconds((prev) => prev - 1);
      }, 1000);
    } else if (timerSeconds === 0 && isTimerRunning) {
      setIsTimerRunning(false);
    }
    return () => clearInterval(interval);
  }, [isTimerRunning, timerSeconds]);

  const startRestTimer = (seconds: number) => {
    setTimerPreset(seconds);
    setTimerSeconds(seconds);
    setIsTimerRunning(true);
  };

  const handleStartTimer = (seconds: number) => {
    setTimerSeconds(seconds);
    setIsTimerRunning(true);
  };

  const handleResetTimer = () => {
    setTimerSeconds(0);
    setIsTimerRunning(false);
  };

  // Quick weight inline edit
  const handleQuickWeightChange = (exerciseId: string, newWeight: string) => {
    if (!activeRoutine) return;
    const updatedExercises = activeRoutine.exercises.map((ex) =>
      ex.id === exerciseId ? { ...ex, weight: newWeight } : ex
    );
    const updatedRoutine = { ...activeRoutine, exercises: updatedExercises };
    saveGymRoutine(updatedRoutine, userId, userEmail);
  };

  // Direct exercise reordering (arrow nudge)
  const handleReorderExercise = (fromIdx: number, toIdx: number) => {
    if (!activeRoutine) return;
    const updated = reorderExercise(activeRoutine.id, fromIdx, toIdx, userId, userEmail);
    setRoutines(updated);
  };

  // Drag-and-drop reordering with smooth debounced sync
  const saveTimeoutRef = useRef<any>(null);
  const handleReorderExercises = (newExercises: ExerciseItem[]) => {
    if (!activeRoutine) return;
    const updated = {
      ...activeRoutine,
      exercises: newExercises,
      updatedAt: new Date().toISOString(),
    };
    setRoutines((prev) => prev.map((r) => (r.id === activeRoutine.id ? updated : r)));

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      saveGymRoutine(updated, userId, userEmail);
    }, 120);
  };

  const handleDragEndFinal = () => {
    if (!activeRoutine) return;
    saveGymRoutine(activeRoutine, userId, userEmail);
  };

  // Workout progress stats
  const workoutStats = useMemo(() => {
    if (!activeRoutine) return { totalSets: 0, completedSets: 0, percent: 0 };
    let total = 0;
    let completed = 0;
    activeRoutine.exercises.forEach((ex) => {
      const setsCount = ex.completedSets?.length || 3;
      total += setsCount;
      completed += (ex.completedSets || []).filter(Boolean).length;
    });
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { totalSets: total, completedSets: completed, percent };
  }, [activeRoutine]);

  // Schedule routine in calendar
  const handleConfirmSchedule = () => {
    if (!scheduleModalRoutine || !onScheduleRoutineInCalendar) return;
    const [h, m] = scheduleTime.split(':').map(Number);
    const endH = Math.floor((h * 60 + m + (scheduleModalRoutine.estimatedMinutes || 60)) / 60) % 24;
    const endM = (h * 60 + m + (scheduleModalRoutine.estimatedMinutes || 60)) % 60;
    const endTimeStr = `${endH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}`;

    const newTask: TaskItem = {
      id: `task-gym-${Date.now()}`,
      title: `Gym: ${scheduleModalRoutine.title}`,
      category: 'Sports/Karate',
      date: scheduleDate,
      time: scheduleTime,
      endTime: endTimeStr,
      durationMinutes: scheduleModalRoutine.estimatedMinutes || 60,
      priority: 'alta',
      notes: `Rutina: ${scheduleModalRoutine.focus || scheduleModalRoutine.subtitle}. ${scheduleModalRoutine.exercises.length} ejercicios programados.`,
      sourceType: 'manual',
      completed: false,
      extractedFields: {
        detectedTag: 'Sports/Karate (Tag: Red)',
        deadlineLabel: `${scheduleDate}, ${scheduleTime} - ${endTimeStr}`,
      },
    };

    onScheduleRoutineInCalendar(newTask);
    setScheduleModalRoutine(null);
  };

  return (
    <div className="w-full max-w-5xl mx-auto px-3 sm:px-6 pt-4 pb-32 flex flex-col gap-5 sm:gap-6">
      {/* Top Header Card */}
      <div className="rounded-2xl border border-rose-500/40 bg-gradient-to-r from-rose-950/40 via-slate-900 to-slate-900/90 p-4 sm:p-5 shadow-xl shadow-rose-950/20 backdrop-blur-sm relative overflow-hidden">
        <div className="absolute -top-10 -right-10 w-36 h-36 rounded-full bg-rose-500/10 blur-2xl pointer-events-none" />

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-rose-600/20 border border-rose-500/50 flex items-center justify-center text-rose-400 shrink-0 shadow-inner">
              <Dumbbell className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full bg-rose-500/20 border border-rose-500/40 text-rose-300 text-[10px] font-mono font-bold uppercase tracking-wider">
                  Módulo de Entrenamiento
                </span>
                <span className="text-xs text-slate-400 hidden sm:inline">&bull; 5 Campos Profesionales</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight mt-0.5">
                Mis Rutinas de Gimnasio
              </h1>
              <p className="text-xs sm:text-sm text-slate-400">
                Ejercicio &bull; Series x Repes &bull; Peso &bull; Transferencia &bull; Ejecución
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-center">
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-300 font-medium text-xs border border-slate-700 transition cursor-pointer"
                title="Regresar a la vista de calendario"
              >
                <CalendarIcon className="w-3.5 h-3.5 text-indigo-400" />
                <span>Volver a Agenda</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsCreatingRoutine(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-md shadow-rose-600/30 transition cursor-pointer active:scale-95"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Nueva Rutina</span>
            </button>
          </div>
        </div>
      </div>

      {/* Routine Selector Carousel / Tabs */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between px-1 text-xs font-mono text-slate-400">
          <span className="font-bold uppercase tracking-wider flex items-center gap-1.5 text-rose-300">
            <Layers className="w-3.5 h-3.5 text-rose-400" />
            Tus Días de Entrenamiento ({routines.length})
          </span>
          <span className="text-[11px] text-slate-500 hidden sm:inline">Haz clic para cambiar de día</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          {routines.map((r) => {
            const isSelected = r.id === activeRoutineId;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => {
                  setActiveRoutineId(r.id);
                  setIsWorkoutMode(false);
                }}
                className={`flex flex-col p-3 rounded-xl border text-left transition-all cursor-pointer relative ${
                  isSelected
                    ? 'bg-rose-950/40 border-rose-500 shadow-md ring-1 ring-rose-500/50'
                    : 'bg-slate-900/90 border-slate-800 hover:border-slate-700 hover:bg-slate-850'
                }`}
              >
                {isSelected && (
                  <span className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-rose-400 animate-ping" />
                )}
                <span className="text-xs font-bold text-white truncate">{r.title}</span>
                <span className="text-[11px] text-slate-400 truncate mt-0.5">{r.subtitle || r.focus}</span>

                <div className="flex items-center justify-between gap-1 mt-2.5 pt-2 border-t border-slate-800 text-[10px] font-mono text-slate-400">
                  <span>{r.exercises.length} ejercicios</span>
                  {r.estimatedMinutes && <span>{r.estimatedMinutes} min</span>}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Active Routine Detail Card */}
      {activeRoutine && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/90 shadow-xl overflow-hidden flex flex-col">
          {/* Active Routine Subheader Banner */}
          <div className="p-4 sm:p-5 border-b border-slate-800 bg-slate-900 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg sm:text-xl font-extrabold text-white tracking-tight">
                  {activeRoutine.title}
                </h2>
                {activeRoutine.targetDays && activeRoutine.targetDays.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-rose-300 text-[10px] font-mono font-semibold">
                    📅 {activeRoutine.targetDays.join(' y ')}
                  </span>
                )}
              </div>
              {activeRoutine.focus && (
                <p className="text-xs text-rose-300/80 font-medium mt-1 flex items-center gap-1.5">
                  <Target className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                  <span>Enfoque: {activeRoutine.focus}</span>
                </p>
              )}
            </div>

            {/* Top Routine Controls */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Toggle Workout Active Mode */}
              <button
                type="button"
                onClick={() => setIsWorkoutMode((prev) => !prev)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer active:scale-95 ${
                  isWorkoutMode
                    ? 'bg-emerald-600 border-emerald-400 text-white shadow-md shadow-emerald-600/30'
                    : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-750 hover:text-white'
                }`}
              >
                <Zap className={`w-3.5 h-3.5 ${isWorkoutMode ? 'text-amber-300 animate-bounce' : 'text-slate-400'}`} />
                <span>{isWorkoutMode ? 'Modo Gym: Activo' : 'Entrenar Ahora'}</span>
              </button>

              {/* Schedule in Calendar */}
              {onScheduleRoutineInCalendar && (
                <button
                  type="button"
                  onClick={() => setScheduleModalRoutine(activeRoutine)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 hover:bg-indigo-600/20 hover:border-indigo-500 hover:text-indigo-300 text-xs text-slate-300 font-semibold transition cursor-pointer"
                  title="Programar esta rutina en tu calendario"
                >
                  <CalendarIcon className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="hidden sm:inline">Agendar en Calendario</span>
                  <span className="sm:hidden">Agendar</span>
                </button>
              )}

              {/* Add Exercise */}
              <button
                type="button"
                onClick={() =>
                  setEditingExercise({
                    exercise: null,
                    routineId: activeRoutine.id,
                  })
                }
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 hover:bg-rose-950/40 hover:border-rose-500 hover:text-rose-300 text-xs text-slate-300 font-semibold transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Añadir Ejercicio</span>
              </button>

              {/* Edit Routine Meta */}
              <button
                type="button"
                onClick={() => setEditingRoutineMeta(activeRoutine)}
                className="p-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
                title="Editar título y días de la rutina"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Active Workout Progress Bar & Rest Timer (if Workout Mode is enabled) */}
          <AnimatePresence>
            {isWorkoutMode && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="bg-slate-950/80 border-b border-slate-800 p-4 flex flex-col md:flex-row items-center justify-between gap-4"
              >
                {/* Progress bar */}
                <div className="flex-1 w-full flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-slate-300 flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 text-amber-400" />
                      Series completadas: <strong>{workoutStats.completedSets} / {workoutStats.totalSets}</strong>
                    </span>
                    <span className="font-bold text-emerald-400">{workoutStats.percent}%</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-rose-500 via-amber-400 to-emerald-400 rounded-full transition-all duration-300"
                      style={{ width: `${workoutStats.percent}%` }}
                    />
                  </div>
                </div>

                {/* Rest Timer */}
                <div className="flex items-center gap-3 shrink-0 bg-slate-900 border border-slate-800 p-2 rounded-xl">
                  <div className="flex items-center gap-2 font-mono">
                    <Timer className={`w-4 h-4 ${isTimerRunning ? 'text-amber-400 animate-spin' : 'text-slate-400'}`} />
                    <span className="text-sm font-bold text-white min-w-[45px]">
                      {Math.floor(timerSeconds / 60)}:{(timerSeconds % 60).toString().padStart(2, '0')}
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    {[60, 90, 120].map((sec) => (
                      <button
                        key={sec}
                        type="button"
                        onClick={() => startRestTimer(sec)}
                        className={`px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold border transition cursor-pointer ${
                          timerPreset === sec && timerSeconds > 0
                            ? 'bg-rose-600 text-white border-rose-500'
                            : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
                        }`}
                      >
                        {sec}s
                      </button>
                    ))}

                    <button
                      type="button"
                      onClick={() => setIsTimerRunning((prev) => !prev)}
                      className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                      title={isTimerRunning ? 'Pausar cronómetro' : 'Reanudar cronómetro'}
                    >
                      {isTimerRunning ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setIsTimerRunning(false);
                        setTimerSeconds(0);
                      }}
                      className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-rose-400 transition"
                      title="Reiniciar cronómetro"
                    >
                      <RotateCcw className="w-3 h-3" />
                    </button>
                  </div>

                  {/* Reset session button */}
                  <button
                    type="button"
                    onClick={() => resetWorkoutSession(activeRoutine.id, userId, userEmail)}
                    className="ml-2 px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-750 text-[10px] font-mono text-slate-400 hover:text-white transition"
                    title="Reiniciar checks de series para empezar de nuevo"
                  >
                    Reiniciar sesión
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Table Header on Desktop */}
          <div className="hidden lg:grid grid-cols-12 gap-3 px-5 py-3 bg-slate-950/60 border-b border-slate-800/80 text-[11px] font-mono font-bold text-slate-400 uppercase tracking-wider">
            <div className="col-span-3 flex items-center gap-2">
              <span>1. Ejercicio</span>
              <span className="text-[10px] text-rose-400/90 font-mono font-normal normal-case flex items-center gap-1">
                <GripVertical className="w-3 h-3 text-rose-400" /> Arrastra para ordenar
              </span>
            </div>
            <div className="col-span-2 text-center">2. Series x Repes</div>
            <div className="col-span-2 text-center">3. Peso</div>
            <div className="col-span-2">4. Transferencia</div>
            <div className="col-span-2">5. Ejecución</div>
            <div className="col-span-1 text-right">Acciones</div>
          </div>

          {/* Reorderable Exercise Items List with Drag and Drop */}
          <Reorder.Group
            as="div"
            axis="y"
            values={activeRoutine.exercises}
            onReorder={handleReorderExercises}
            className="flex flex-col divide-y divide-slate-800/80"
          >
            {activeRoutine.exercises.map((exercise, exIndex) => (
              <ExerciseReorderRow
                key={exercise.id}
                exercise={exercise}
                exIndex={exIndex}
                totalExercises={activeRoutine.exercises.length}
                routineId={activeRoutine.id}
                userId={userId}
                userEmail={userEmail}
                timerPreset={timerPreset}
                onStartTimer={startRestTimer}
                onEdit={() =>
                  setEditingExercise({
                    exercise,
                    routineId: activeRoutine.id,
                    exerciseIndex: exIndex,
                  })
                }
                onDelete={() => {
                  if (confirm(`¿Eliminar el ejercicio "${exercise.name}"?`)) {
                    const updatedExercises = activeRoutine.exercises.filter((e) => e.id !== exercise.id);
                    saveGymRoutine({ ...activeRoutine, exercises: updatedExercises }, userId, userEmail);
                  }
                }}
                onQuickWeightChange={handleQuickWeightChange}
                onNudgeUp={() => handleReorderExercise(exIndex, exIndex - 1)}
                onNudgeDown={() => handleReorderExercise(exIndex, exIndex + 1)}
                onDragEndFinal={handleDragEndFinal}
              />
            ))}
          </Reorder.Group>

          {/* Bottom Card Footer Actions */}
          <div className="p-4 bg-slate-950/70 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() =>
                setEditingExercise({
                  exercise: null,
                  routineId: activeRoutine.id,
                  exerciseIndex: activeRoutine.exercises.length,
                })
              }
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-xs font-semibold text-slate-200 transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 text-rose-400" />
              <span>Añadir otro ejercicio</span>
            </button>

            {routines.length > 1 && (
              <button
                type="button"
                onClick={() => {
                  if (confirm(`¿Eliminar la rutina "${activeRoutine.title}"?`)) {
                    deleteGymRoutine(activeRoutine.id, userId, userEmail);
                  }
                }}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-rose-500/50 text-xs text-slate-400 hover:text-rose-400 transition cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Eliminar rutina</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: EXERCISE EDITOR (Editing all 5 fields)                           */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {editingExercise && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col my-8"
            >
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  const name = (form.elements.namedItem('name') as HTMLInputElement).value.trim();
                  const muscleGroup = (form.elements.namedItem('muscleGroup') as HTMLInputElement).value.trim();
                  const setsReps = (form.elements.namedItem('setsReps') as HTMLInputElement).value.trim();
                  const weight = (form.elements.namedItem('weight') as HTMLInputElement).value.trim();
                  const transfer = (form.elements.namedItem('transfer') as HTMLTextAreaElement).value.trim();
                  const execution = (form.elements.namedItem('execution') as HTMLTextAreaElement).value.trim();
                  const targetPos = parseInt(
                    (form.elements.namedItem('orderPosition') as HTMLSelectElement)?.value ?? '0',
                    10
                  );

                  if (!name || !activeRoutine) return;

                  const setsCount = parseInt(setsReps.match(/^(\d+)/)?.[1] || '3', 10);
                  const isNew = !editingExercise.exercise;

                  const newExercise: ExerciseItem = {
                    id: editingExercise.exercise?.id || `ex-${Date.now()}`,
                    name,
                    muscleGroup,
                    setsReps,
                    weight,
                    transfer,
                    execution,
                    completedSets: editingExercise.exercise?.completedSets || new Array(setsCount).fill(false),
                  };

                  let updatedExercises = [...activeRoutine.exercises];
                  if (isNew) {
                    const safePos = Math.min(Math.max(0, targetPos), updatedExercises.length);
                    updatedExercises.splice(safePos, 0, newExercise);
                  } else {
                    const fromPos =
                      editingExercise.exerciseIndex !== undefined
                        ? editingExercise.exerciseIndex
                        : updatedExercises.findIndex((ex) => ex.id === newExercise.id);
                    if (fromPos >= 0 && fromPos < updatedExercises.length) {
                      updatedExercises.splice(fromPos, 1);
                    }
                    const safePos = Math.min(Math.max(0, targetPos), updatedExercises.length);
                    updatedExercises.splice(safePos, 0, newExercise);
                  }

                  saveGymRoutine({ ...activeRoutine, exercises: updatedExercises }, userId, userEmail);
                  setEditingExercise(null);
                }}
              >
                <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Dumbbell className="w-5 h-5 text-rose-400" />
                    <h3 className="font-extrabold text-base sm:text-lg text-white">
                      {editingExercise.exercise ? 'Editar Ejercicio' : 'Nuevo Ejercicio'}
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditingExercise(null)}
                    className="p-1 rounded-lg text-slate-400 hover:text-white transition"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="p-4 sm:p-5 flex flex-col gap-4 max-h-[70vh] overflow-y-auto">
                  {/* Posición / Orden en la rutina */}
                  <div>
                    <label className="block text-xs font-mono font-bold text-slate-300 uppercase mb-1 flex items-center gap-1.5">
                      <ArrowUpDown className="w-3.5 h-3.5 text-rose-400" />
                      <span>Posición / Orden en la rutina</span>
                    </label>
                    <select
                      name="orderPosition"
                      defaultValue={
                        editingExercise.exerciseIndex !== undefined
                          ? editingExercise.exerciseIndex
                          : activeRoutine.exercises.length
                      }
                      className="w-full px-3 py-2 rounded-xl bg-slate-850 border border-slate-700 text-white text-sm focus:outline-none focus:border-rose-500 font-mono cursor-pointer"
                    >
                      {Array.from({
                        length: editingExercise.exercise
                          ? activeRoutine.exercises.length
                          : activeRoutine.exercises.length + 1,
                      }).map((_, idx) => {
                        const totalCount = editingExercise.exercise
                          ? activeRoutine.exercises.length
                          : activeRoutine.exercises.length + 1;
                        return (
                          <option key={idx} value={idx}>
                            #{idx + 1} {idx === 0 ? '(Primero en la rutina)' : idx === totalCount - 1 ? '(Último en la rutina)' : ''}
                          </option>
                        );
                      })}
                    </select>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Elige el orden donde se ubicará este ejercicio dentro de tu rutina.
                    </p>
                  </div>
                  {/* 1. Ejercicio & Grupo Muscular */}
                  <div>
                    <label className="block text-xs font-mono font-bold text-slate-300 uppercase mb-1">
                      1. Ejercicio *
                    </label>
                    <input
                      name="name"
                      defaultValue={editingExercise.exercise?.name || ''}
                      required
                      className="w-full px-3 py-2 rounded-xl bg-slate-850 border border-slate-700 text-white text-sm focus:outline-none focus:border-rose-500"
                      placeholder="ej. Press de Banca Plano con Barra"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-mono font-bold text-slate-300 uppercase mb-1">
                      Grupo Muscular
                    </label>
                    <input
                      name="muscleGroup"
                      defaultValue={editingExercise.exercise?.muscleGroup || ''}
                      className="w-full px-3 py-2 rounded-xl bg-slate-850 border border-slate-700 text-white text-sm focus:outline-none focus:border-rose-500"
                      placeholder="ej. Pectoral mayor y tríceps"
                    />
                  </div>

                  {/* 2. Series x Repes & 3. Peso */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-mono font-bold text-slate-300 uppercase mb-1">
                        2. Series x Repes *
                      </label>
                      <input
                        name="setsReps"
                        defaultValue={editingExercise.exercise?.setsReps || '4 x 8-10'}
                        required
                        className="w-full px-3 py-2 rounded-xl bg-slate-850 border border-slate-700 text-white text-sm font-mono focus:outline-none focus:border-rose-500"
                        placeholder="ej. 4 x 8-10"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-mono font-bold text-slate-300 uppercase mb-1">
                        3. Peso *
                      </label>
                      <input
                        name="weight"
                        defaultValue={editingExercise.exercise?.weight || '80 kg'}
                        required
                        className="w-full px-3 py-2 rounded-xl bg-slate-850 border border-slate-700 text-white text-sm font-mono focus:outline-none focus:border-rose-500"
                        placeholder="ej. 80 kg o 24 kg c/m"
                      />
                    </div>
                  </div>

                  {/* 4. Transferencia */}
                  <div>
                    <label className="block text-xs font-mono font-bold text-amber-300 uppercase mb-1 flex items-center gap-1">
                      <Flame className="w-3.5 h-3.5 text-amber-400" />
                      4. Transferencia Deportiva / Funcional
                    </label>
                    <textarea
                      name="transfer"
                      rows={2}
                      defaultValue={editingExercise.exercise?.transfer || ''}
                      className="w-full px-3 py-2 rounded-xl bg-slate-850 border border-amber-500/30 text-white text-xs focus:outline-none focus:border-amber-400"
                      placeholder="ej. Potencia de impacto en tsuki, empuje de torso y estabilidad en combate."
                    />
                  </div>

                  {/* 5. Ejecución */}
                  <div>
                    <label className="block text-xs font-mono font-bold text-indigo-300 uppercase mb-1 flex items-center gap-1">
                      <FileText className="w-3.5 h-3.5 text-indigo-400" />
                      5. Claves de Ejecución Técnica / Tempo
                    </label>
                    <textarea
                      name="execution"
                      rows={2}
                      defaultValue={editingExercise.exercise?.execution || ''}
                      className="w-full px-3 py-2 rounded-xl bg-slate-850 border border-indigo-500/30 text-white text-xs focus:outline-none focus:border-indigo-400"
                      placeholder="ej. Tempo 3-0-1. Escápulas retraídas, barra rozando esternón con pausa de 1s, RIR 1-2."
                    />
                  </div>
                </div>

                <div className="p-4 border-t border-slate-800 flex items-center justify-end gap-2 bg-slate-950/60">
                  <button
                    type="button"
                    onClick={() => setEditingExercise(null)}
                    className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700 transition"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition shadow-md shadow-rose-600/30"
                  >
                    Guardar Ejercicio
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ========================================================================= */}
      {/* MODAL 2: SCHEDULE ROUTINE IN CALENDAR                                     */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {scheduleModalRoutine && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-5 flex flex-col gap-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CalendarIcon className="w-5 h-5 text-indigo-400" />
                  <h3 className="font-extrabold text-base text-white">Programar Rutina en Agenda</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setScheduleModalRoutine(null)}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-3 rounded-xl bg-slate-850 border border-slate-700 text-xs text-slate-300">
                <span className="font-bold text-white">{scheduleModalRoutine.title}</span>
                <p className="text-slate-400 text-[11px] mt-0.5">
                  {scheduleModalRoutine.exercises.length} ejercicios &bull; ~{scheduleModalRoutine.estimatedMinutes || 60} min
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-mono font-bold text-slate-400 uppercase mb-1">Fecha</label>
                  <input
                    type="date"
                    value={scheduleDate}
                    onChange={(e) => setScheduleDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-850 border border-slate-700 text-white text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono font-bold text-slate-400 uppercase mb-1">Hora Inicio</label>
                  <input
                    type="time"
                    value={scheduleTime}
                    onChange={(e) => setScheduleTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-850 border border-slate-700 text-white text-xs font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setScheduleModalRoutine(null)}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmSchedule}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md shadow-indigo-600/30"
                >
                  Añadir al Calendario
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ========================================================================= */}
      {/* MODAL 3: CREATE NEW ROUTINE                                               */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {(isCreatingRoutine || editingRoutineMeta) && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-5 flex flex-col gap-4"
            >
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  const title = (form.elements.namedItem('title') as HTMLInputElement).value.trim();
                  const subtitle = (form.elements.namedItem('subtitle') as HTMLInputElement).value.trim();
                  const focus = (form.elements.namedItem('focus') as HTMLInputElement).value.trim();
                  const mins = parseInt((form.elements.namedItem('minutes') as HTMLInputElement).value, 10) || 60;
                  const daysStr = (form.elements.namedItem('days') as HTMLInputElement).value.trim();

                  if (!title) return;

                  const targetDays = daysStr ? daysStr.split(',').map((s) => s.trim()) : ['Lunes'];

                  if (editingRoutineMeta) {
                    saveGymRoutine(
                      {
                        ...editingRoutineMeta,
                        title,
                        subtitle,
                        focus,
                        estimatedMinutes: mins,
                        targetDays,
                      },
                      userId,
                      userEmail
                    );
                    setEditingRoutineMeta(null);
                  } else {
                    const newRoutine: GymRoutine = {
                      id: `routine-${Date.now()}`,
                      title,
                      subtitle,
                      focus,
                      estimatedMinutes: mins,
                      targetDays,
                      exercises: [],
                    };
                    saveGymRoutine(newRoutine, userId, userEmail);
                    setActiveRoutineId(newRoutine.id);
                    setIsCreatingRoutine(false);
                  }
                }}
              >
                <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
                  <h3 className="font-bold text-base text-white">
                    {editingRoutineMeta ? 'Editar Rutina' : 'Crear Nueva Rutina'}
                  </h3>
                  <button
                    type="button"
                    onClick={() => {
                      setIsCreatingRoutine(false);
                      setEditingRoutineMeta(null);
                    }}
                    className="text-slate-400 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex flex-col gap-3">
                  <div>
                    <label className="block text-xs font-mono font-bold text-slate-300 uppercase mb-1">
                      Nombre de la Rutina *
                    </label>
                    <input
                      name="title"
                      defaultValue={editingRoutineMeta?.title || ''}
                      required
                      className="w-full px-3 py-2 rounded-xl bg-slate-850 border border-slate-700 text-white text-xs"
                      placeholder="ej. Día 5: Hombro & Brazo"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-mono font-bold text-slate-300 uppercase mb-1">
                      Subtítulo / Músculos
                    </label>
                    <input
                      name="subtitle"
                      defaultValue={editingRoutineMeta?.subtitle || ''}
                      className="w-full px-3 py-2 rounded-xl bg-slate-850 border border-slate-700 text-white text-xs"
                      placeholder="ej. Deltoides, bíceps y tríceps"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-mono font-bold text-slate-300 uppercase mb-1">
                      Enfoque / Transferencia Principal
                    </label>
                    <input
                      name="focus"
                      defaultValue={editingRoutineMeta?.focus || ''}
                      className="w-full px-3 py-2 rounded-xl bg-slate-850 border border-slate-700 text-white text-xs"
                      placeholder="ej. Hipertrofia y velocidad de brazos"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-mono font-bold text-slate-300 uppercase mb-1">
                        Minutos Estimados
                      </label>
                      <input
                        name="minutes"
                        type="number"
                        defaultValue={editingRoutineMeta?.estimatedMinutes || 60}
                        className="w-full px-3 py-2 rounded-xl bg-slate-850 border border-slate-700 text-white text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-mono font-bold text-slate-300 uppercase mb-1">
                        Días sugeridos (coma)
                      </label>
                      <input
                        name="days"
                        defaultValue={editingRoutineMeta?.targetDays?.join(', ') || 'Lunes, Jueves'}
                        className="w-full px-3 py-2 rounded-xl bg-slate-850 border border-slate-700 text-white text-xs"
                        placeholder="Lunes, Jueves"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-4 mt-2 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => {
                      setIsCreatingRoutine(false);
                      setEditingRoutineMeta(null);
                    }}
                    className="px-3.5 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold"
                  >
                    Guardar
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
