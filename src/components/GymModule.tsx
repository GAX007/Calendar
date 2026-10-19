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
  Volume2,
  VolumeX,
  SlidersHorizontal,
  CalendarPlus,
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
  resetToOfficialRoutines,
  canResetToOfficialRoutines,
} from '../services/gymService';
import { RealTimeClockState } from '../hooks/useRealTimeClock';
import GymAudioEngine, {
  GymSoundMode,
  getSavedGymSoundMode,
  saveGymSoundMode,
  enableBackgroundAudioKeepAlive,
  disableBackgroundAudioKeepAlive,
  updateMediaSession,
  requestNotificationPermission,
  sendTimerFinishedNotification,
  createBackgroundTimerWorker,
  BackgroundTimerController,
  GYM_TIMER_TARGET_STORAGE_KEY,
} from '../utils/gymAudio';

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
  const [abierto, setAbierto] = useState(false);
  const setsCount = parseInt(exercise.setsReps.match(/^(\d+)/)?.[1] || '3', 10);
  const completedSets = exercise.completedSets || new Array(setsCount).fill(false);
  const isAllDone = completedSets.slice(0, setsCount).every(Boolean);
  const descanso = exercise.restSeconds || timerPreset;

  return (
    <Reorder.Item
      as="div"
      value={exercise}
      dragListener={false}
      dragControls={dragControls}
      onDragEnd={onDragEndFinal}
      className="relative bg-white py-4 border-b border-hairline flex flex-col gap-3"
      whileDrag={{ scale: 1.01, boxShadow: '0 12px 28px rgba(20, 21, 23, 0.14)', zIndex: 50 }}
    >
      <div className="grid grid-cols-[34px_minmax(0,1fr)_44px] gap-2 items-start">
        <button
          type="button"
          onPointerDown={(e) => dragControls.start(e)}
          aria-label={`Mover ${exercise.name}: mantén pulsado y arrastra`}
          title="Mantén pulsado y arrastra para reordenar"
          className="h-11 -mt-2.5 flex items-center font-mono text-[13px] font-medium text-ink-3 touch-none cursor-grab active:cursor-grabbing select-none"
        >
          {String(exIndex + 1).padStart(2, '0')}
        </button>
        <div className="min-w-0 flex flex-col gap-[3px]">
          <span className={`text-base leading-[1.3] font-medium ${isAllDone ? 'text-ink-3 line-through' : 'text-ink'}`}>{exercise.name}</span>
          <span className="text-[13.5px] leading-[1.35] text-ink-2">
            {[exercise.setsReps, exercise.weight, `descanso ${descanso} s`].filter(Boolean).join(' · ')}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          aria-expanded={abierto}
          aria-label={`${abierto ? 'Ocultar' : 'Ver'} cómo se hace: ${exercise.name}`}
          className="w-11 h-11 -mt-2.5 rounded-full flex items-center justify-center text-slate-700 hover:bg-black/5"
        >
          {abierto ? <ChevronUp className="w-[18px] h-[18px]" strokeWidth={1.75} /> : <ChevronDown className="w-[18px] h-[18px]" strokeWidth={1.75} />}
        </button>
      </div>

      {abierto && (
        <div className="ml-[42px] rounded-[14px] bg-surface px-3.5 py-3 flex flex-col gap-2.5 text-sm leading-[1.5] text-slate-700">
          {exercise.muscleGroup && <p><strong className="font-semibold text-ink">Trabaja.</strong> {exercise.muscleGroup}</p>}
          {exercise.execution && <p><strong className="font-semibold text-ink">Cómo hacerlo.</strong> {exercise.execution}</p>}
          {exercise.transfer && <p><strong className="font-semibold text-ink">Para el karate.</strong> {exercise.transfer}</p>}
          {exercise.notes && <p><strong className="font-semibold text-ink">Notas.</strong> {exercise.notes}</p>}
          <label className="flex items-center gap-2 text-[13px] text-ink-2">
            Peso
            <input
              type="text"
              value={exercise.weight}
              onChange={(e) => onQuickWeightChange(exercise.id, e.target.value)}
              placeholder="80 kg"
              className="flex-1 min-w-0 h-10 rounded-xl border border-line-2 bg-white px-3 text-[15px] text-ink outline-none focus:border-ink"
            />
          </label>
          <div className="flex flex-wrap items-center gap-0.5 -ml-2">
            <button type="button" disabled={exIndex === 0} onClick={onNudgeUp} aria-label="Subir ejercicio" className="w-11 h-11 rounded-full flex items-center justify-center hover:bg-black/5 disabled:opacity-30">
              <ChevronUp className="w-[18px] h-[18px]" strokeWidth={1.75} />
            </button>
            <button type="button" disabled={exIndex === totalExercises - 1} onClick={onNudgeDown} aria-label="Bajar ejercicio" className="w-11 h-11 rounded-full flex items-center justify-center hover:bg-black/5 disabled:opacity-30">
              <ChevronDown className="w-[18px] h-[18px]" strokeWidth={1.75} />
            </button>
            <button type="button" onClick={onEdit} className="h-11 px-3 rounded-full text-sm font-semibold flex items-center gap-2 hover:bg-black/5">
              <Pencil className="w-4 h-4" strokeWidth={1.75} /> Editar
            </button>
            <button type="button" onClick={onDelete} className="h-11 px-3 rounded-full text-sm font-semibold text-ink-2 flex items-center gap-2 hover:bg-black/5">
              <Trash2 className="w-4 h-4" strokeWidth={1.75} /> Eliminar
            </button>
          </div>
        </div>
      )}

      <div className="ml-[42px] flex flex-wrap gap-1.5">
        {Array.from({ length: setsCount }).map((_, sIdx) => {
          const done = Boolean(completedSets[sIdx]);
          return (
            <button
              key={sIdx}
              type="button"
              aria-pressed={done}
              aria-label={`Serie ${sIdx + 1} de ${exercise.name}${done ? ', hecha' : ''}`}
              onClick={() => {
                toggleSetCompletion(routineId, exercise.id, sIdx, userId, userEmail);
                if (!done) onStartTimer(descanso);
              }}
              className={`w-11 h-11 rounded-xl border-[1.5px] font-mono text-sm font-medium flex items-center justify-center transition active:scale-95 ${
                done ? 'bg-ink border-ink text-white' : 'bg-white border-line-3 text-ink'
              }`}
            >
              {sIdx + 1}
            </button>
          );
        })}
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
  const [timerPreset, setTimerPreset] = useState<number>(120);

  // Modals for workout reset confirmation & mobile countdown timer picker
  const [showResetConfirmModal, setShowResetConfirmModal] = useState<boolean>(false);
  const [isTimerPickerOpen, setIsTimerPickerOpen] = useState<boolean>(false);
  const [pickerMinutes, setPickerMinutes] = useState<number>(2);
  const [pickerSeconds, setPickerSeconds] = useState<number>(0);
  const [soundMode, setSoundMode] = useState<GymSoundMode>(() => getSavedGymSoundMode());

  // Background timer references (wall-clock timestamp & Web Worker)
  const targetEndTimeRef = useRef<number | null>(null);
  const timerSecondsRef = useRef<number>(0);
  const soundModeRef = useRef<GymSoundMode>(soundMode);
  const isTimerRunningRef = useRef<boolean>(false);
  const lastSoundSecondRef = useRef<number | null>(null);
  const workerRef = useRef<BackgroundTimerController | null>(null);

  // Keep refs in sync with state
  useEffect(() => {
    soundModeRef.current = soundMode;
  }, [soundMode]);

  useEffect(() => {
    isTimerRunningRef.current = isTimerRunning;
  }, [isTimerRunning]);

  useEffect(() => {
    timerSecondsRef.current = timerSeconds;
  }, [timerSeconds]);

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

  // Background resilient timer engine (Web Worker + Date.now() timestamp + Keep-Alive audio)
  useEffect(() => {
    // Check if there was an active timer target in localStorage
    const savedTarget = localStorage.getItem(GYM_TIMER_TARGET_STORAGE_KEY);
    if (savedTarget) {
      const targetNum = parseInt(savedTarget, 10);
      const remaining = Math.max(0, Math.ceil((targetNum - Date.now()) / 1000));
      if (remaining > 0) {
        targetEndTimeRef.current = targetNum;
        timerSecondsRef.current = remaining;
        setTimerSeconds(remaining);
        setIsTimerRunning(true);
        setIsWorkoutMode(true);
        enableBackgroundAudioKeepAlive();
        updateMediaSession(remaining, true);
      } else {
        localStorage.removeItem(GYM_TIMER_TARGET_STORAGE_KEY);
      }
    }

    // Initialize Web Worker for background ticking
    const worker = createBackgroundTimerWorker(() => {
      const target = targetEndTimeRef.current;
      if (!target || !isTimerRunningRef.current) return;

      const now = Date.now();
      const remaining = Math.max(0, Math.ceil((target - now) / 1000));

      updateMediaSession(remaining, true);

      if (remaining !== timerSecondsRef.current) {
        timerSecondsRef.current = remaining;
        setTimerSeconds(remaining);

        // Sound & Haptic countdown at 5, 4, 3, 2, 1
        if (remaining >= 1 && remaining <= 5) {
          if (lastSoundSecondRef.current !== remaining) {
            lastSoundSecondRef.current = remaining;
            GymAudioEngine.playCountdown(remaining, soundModeRef.current);
            if ('vibrate' in navigator) {
              navigator.vibrate(80);
            }
          }
        } else if (remaining === 0) {
          if (lastSoundSecondRef.current !== 0) {
            lastSoundSecondRef.current = 0;
            GymAudioEngine.playFinished(soundModeRef.current);
            sendTimerFinishedNotification();

            targetEndTimeRef.current = null;
            localStorage.removeItem(GYM_TIMER_TARGET_STORAGE_KEY);
            setIsTimerRunning(false);
            disableBackgroundAudioKeepAlive();
            updateMediaSession(0, false);
            workerRef.current?.stop();
          }
        }
      }
    });

    workerRef.current = worker;
    if (targetEndTimeRef.current && isTimerRunningRef.current) {
      worker.start();
    }

    // Refresh UI immediately whenever user returns to tab from WhatsApp or lock screen
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && targetEndTimeRef.current) {
        const remaining = Math.max(0, Math.ceil((targetEndTimeRef.current - Date.now()) / 1000));
        timerSecondsRef.current = remaining;
        setTimerSeconds(remaining);

        if (remaining <= 0) {
          if (lastSoundSecondRef.current !== 0) {
            lastSoundSecondRef.current = 0;
            GymAudioEngine.playFinished(soundModeRef.current);
            sendTimerFinishedNotification();
          }
          setIsTimerRunning(false);
          targetEndTimeRef.current = null;
          localStorage.removeItem(GYM_TIMER_TARGET_STORAGE_KEY);
          disableBackgroundAudioKeepAlive();
          updateMediaSession(0, false);
          workerRef.current?.stop();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      worker.destroy();
      disableBackgroundAudioKeepAlive();
    };
  }, []);

  const startRestTimer = (seconds: number) => {
    GymAudioEngine.getAudioContext();
    requestNotificationPermission();
    enableBackgroundAudioKeepAlive();

    const target = Date.now() + seconds * 1000;
    targetEndTimeRef.current = target;
    localStorage.setItem(GYM_TIMER_TARGET_STORAGE_KEY, String(target));

    lastSoundSecondRef.current = null;
    timerSecondsRef.current = seconds;
    setTimerPreset(seconds);
    setTimerSeconds(seconds);
    setIsTimerRunning(true);
    setIsWorkoutMode(true);

    updateMediaSession(seconds, true);
    workerRef.current?.start();
  };

  const handleStartTimer = (seconds: number) => startRestTimer(seconds);

  const handleTogglePlayPause = () => {
    GymAudioEngine.getAudioContext();
    if (isTimerRunning) {
      // Pause
      const remaining = targetEndTimeRef.current
        ? Math.max(0, Math.ceil((targetEndTimeRef.current - Date.now()) / 1000))
        : timerSeconds;

      targetEndTimeRef.current = null;
      localStorage.removeItem(GYM_TIMER_TARGET_STORAGE_KEY);
      disableBackgroundAudioKeepAlive();
      updateMediaSession(remaining, false);
      workerRef.current?.stop();

      timerSecondsRef.current = remaining;
      setTimerSeconds(remaining);
      setIsTimerRunning(false);
    } else {
      // Start or Resume
      const secToRun = timerSeconds > 0 ? timerSeconds : timerPreset || 120;
      startRestTimer(secToRun);
    }
  };

  const handleResetTimer = () => {
    targetEndTimeRef.current = null;
    localStorage.removeItem(GYM_TIMER_TARGET_STORAGE_KEY);
    disableBackgroundAudioKeepAlive();
    updateMediaSession(0, false);
    workerRef.current?.stop();

    timerSecondsRef.current = 0;
    setTimerSeconds(0);
    setIsTimerRunning(false);
    lastSoundSecondRef.current = null;
  };

  const toggleSoundMode = () => {
    const modes: GymSoundMode[] = ['both', 'beeps', 'voice', 'muted'];
    const nextIdx = (modes.indexOf(soundMode) + 1) % modes.length;
    const nextMode = modes[nextIdx];
    setSoundMode(nextMode);
    saveGymSoundMode(nextMode);
    if (nextMode !== 'muted') {
      GymAudioEngine.testPreview(nextMode);
    }
  };

  const openTimerPicker = () => {
    const initialSec = timerSeconds > 0 ? timerSeconds : timerPreset || 120;
    setPickerMinutes(Math.floor(initialSec / 60));
    setPickerSeconds(initialSec % 60);
    setIsTimerPickerOpen(true);
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

  const fmtReloj = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const sonidoEtiqueta = soundMode === 'both' ? 'pitidos y voz' : soundMode === 'beeps' ? 'solo pitidos' : soundMode === 'voice' ? 'solo voz' : 'sin sonido';
  const etiquetaRutina = (r: GymRoutine) => (r.targetDays?.length ? r.targetDays.map((d) => d.slice(0, 3)).join('/') : r.title.split(':')[0].slice(0, 14));
  const tituloRutina = (r: GymRoutine) => (r.title.includes(':') ? r.title.split(':').slice(1).join(':').trim() : r.title);

  return (
    <div className={`w-full max-w-2xl mx-auto px-5 flex flex-col gap-[22px] ${isWorkoutMode ? 'pb-24' : ''}`}>
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1 min-w-0">
          <span className="text-sm font-medium text-ink-2">
            {activeRoutine
              ? `${activeRoutine.targetDays?.join(' y ') || 'Rutina'} · ${activeRoutine.exercises.length} ejercicios${activeRoutine.estimatedMinutes ? ` · ${activeRoutine.estimatedMinutes} min` : ''}`
              : 'Rutinas'}
          </span>
          <h1 className="text-[34px] leading-[1.05] font-semibold tracking-[-0.025em]">Gym</h1>
        </div>
        <div className="flex items-center gap-2 flex-none">
          {activeRoutine && onScheduleRoutineInCalendar && (
            <button
              type="button"
              onClick={() => setScheduleModalRoutine(activeRoutine)}
              aria-label="Agendar esta rutina en el calendario"
              className="w-11 h-11 rounded-full bg-surface-2 flex items-center justify-center active:scale-95 transition"
            >
              <CalendarPlus className="w-5 h-5" strokeWidth={1.75} />
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsCreatingRoutine(true)}
            aria-label="Nueva rutina"
            className="w-11 h-11 rounded-full bg-surface-2 flex items-center justify-center active:scale-95 transition"
          >
            <Plus className="w-5 h-5" strokeWidth={1.75} />
          </button>
        </div>
      </header>

      {routines.length > 0 && (
        <nav aria-label="Rutinas" className="flex gap-0.5 p-[3px] rounded-[15px] bg-surface-2 overflow-x-auto no-scrollbar">
          {routines.map((r) => {
            const on = r.id === activeRoutine?.id;
            return (
              <button
                key={r.id}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  setActiveRoutineId(r.id);
                  setIsWorkoutMode(false);
                }}
                className={`flex-1 min-w-[88px] h-11 px-3 rounded-xl text-[14.5px] whitespace-nowrap transition ${
                  on ? 'bg-white font-semibold shadow-[0_1px_2px_rgba(20,21,23,0.08)]' : 'text-ink-2 font-medium'
                }`}
              >
                {etiquetaRutina(r)}
              </button>
            );
          })}
        </nav>
      )}

      {activeRoutine && (
        <section className="flex flex-col gap-3.5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-1.5 min-w-0">
              <h2 className="text-[22px] leading-[1.2] font-semibold tracking-[-0.015em]">{tituloRutina(activeRoutine)}</h2>
              {(activeRoutine.subtitle || activeRoutine.focus) && (
                <p className="text-[14.5px] leading-[1.45] text-ink-2 text-pretty">{activeRoutine.subtitle || activeRoutine.focus}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setEditingRoutineMeta(activeRoutine)}
              aria-label="Editar la rutina"
              className="flex-none w-11 h-11 -mr-2 -mt-1.5 rounded-full flex items-center justify-center hover:bg-black/5"
            >
              <Pencil className="w-[18px] h-[18px]" strokeWidth={1.75} />
            </button>
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex justify-between text-[13.5px]">
              <span className="font-medium">{workoutStats.completedSets} de {workoutStats.totalSets} series</span>
              <span className="font-mono text-ink-2">{workoutStats.percent}%</span>
            </div>
            <div aria-hidden="true" className="h-1.5 rounded-full bg-track-2 overflow-hidden">
              <div className="h-1.5 rounded-full bg-ink transition-all duration-300" style={{ width: `${workoutStats.percent}%` }} />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1 -ml-3">
            {!isWorkoutMode && (
              <button type="button" onClick={() => setIsWorkoutMode(true)} className="h-11 px-3 rounded-full text-sm font-semibold flex items-center gap-2 hover:bg-black/5">
                <Timer className="w-4 h-4" strokeWidth={1.75} /> Temporizador
              </button>
            )}
            {workoutStats.completedSets > 0 && (
              <button type="button" onClick={() => setShowResetConfirmModal(true)} className="h-11 px-3 rounded-full text-sm font-semibold flex items-center gap-2 hover:bg-black/5">
                <RotateCcw className="w-4 h-4" strokeWidth={1.75} /> Reiniciar entreno
              </button>
            )}
          </div>
        </section>
      )}

      {activeRoutine && (
        <section aria-label="Ejercicios" className="flex flex-col">
          <Reorder.Group
            as="div"
            axis="y"
            values={activeRoutine.exercises}
            onReorder={handleReorderExercises}
            className="flex flex-col border-t border-hairline"
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

          <div className="flex flex-wrap items-center justify-between gap-1 pt-2 -mx-3">
            <button
              type="button"
              onClick={() =>
                setEditingExercise({
                  exercise: null,
                  routineId: activeRoutine.id,
                  exerciseIndex: activeRoutine.exercises.length,
                })
              }
              className="h-11 px-3 rounded-full text-sm font-semibold flex items-center gap-2 hover:bg-black/5"
            >
              <Plus className="w-4 h-4" strokeWidth={1.75} /> Añadir ejercicio
            </button>
            {routines.length > 1 && (
              <button
                type="button"
                onClick={() => {
                  if (confirm(`¿Eliminar la rutina "${activeRoutine.title}"?`)) {
                    deleteGymRoutine(activeRoutine.id, userId, userEmail);
                  }
                }}
                className="h-11 px-3 rounded-full text-sm font-semibold text-ink-2 flex items-center gap-2 hover:bg-black/5"
              >
                <Trash2 className="w-4 h-4" strokeWidth={1.75} /> Eliminar rutina
              </button>
            )}
          </div>
          {canResetToOfficialRoutines(userId, userEmail) && <button
            type="button"
            onClick={() => {
              if (window.confirm('¿Restablecer todas las rutinas a la versión oficial actualizada (Lunes, Miércoles, Viernes/Sábado)?')) {
                const updated = resetToOfficialRoutines(userId, userEmail);
                setRoutines(updated);
                setActiveRoutineId(updated[0]?.id || '');
              }
            }}
            className="self-start h-11 -ml-3 px-3 rounded-full text-sm text-ink-2 underline underline-offset-4 hover:bg-black/5"
          >
            Restablecer las rutinas oficiales
          </button>}
        </section>
      )}

      {/* Rest timer: a bar above the tab bar while training */}
      {isWorkoutMode && (
        <div className="fixed inset-x-0 bottom-[var(--bottom-nav-h)] z-40 bg-white md:bg-transparent">
          <div className="max-w-2xl mx-auto px-4 pt-2 pb-2.5 md:pb-6">
            <div className="flex items-center gap-1 h-14 pl-1.5 pr-1.5 rounded-full bg-accent text-ink animate-subir">
              <button
                type="button"
                onClick={handleTogglePlayPause}
                aria-label={isTimerRunning ? 'Pausar el descanso' : 'Empezar el descanso'}
                className="flex-none w-11 h-11 rounded-full flex items-center justify-center hover:bg-black/5"
              >
                {isTimerRunning ? <Pause className="w-5 h-5" strokeWidth={1.75} /> : <Play className="w-5 h-5" strokeWidth={1.75} />}
              </button>
              <button
                type="button"
                onClick={openTimerPicker}
                aria-label="Elegir el tiempo de descanso"
                className="min-w-0 h-11 px-1 flex items-center gap-2.5"
              >
                <span role="timer" className="font-mono text-[17px] font-medium">{fmtReloj(timerSeconds > 0 ? timerSeconds : timerPreset)}</span>
                <span className="text-sm truncate">{isTimerRunning ? 'Descanso' : timerSeconds > 0 ? 'En pausa' : 'Descanso listo'}</span>
              </button>
              <span className="flex-1" />
              <button
                type="button"
                onClick={toggleSoundMode}
                aria-label={`Sonido: ${sonidoEtiqueta}. Pulsa para cambiar`}
                title={`Sonido: ${sonidoEtiqueta}`}
                className="flex-none w-11 h-11 rounded-full flex items-center justify-center hover:bg-black/5"
              >
                {soundMode === 'muted' ? <VolumeX className="w-5 h-5" strokeWidth={1.75} /> : <Volume2 className="w-5 h-5" strokeWidth={1.75} />}
              </button>
              <button
                type="button"
                onClick={() => {
                  handleResetTimer();
                  setIsWorkoutMode(false);
                }}
                className="flex-none h-11 px-4 rounded-full bg-ink text-white text-sm font-semibold active:scale-95 transition"
              >
                {isTimerRunning ? 'Saltar' : 'Cerrar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: EXERCISE EDITOR (Editing all 5 fields)                           */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {editingExercise && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-ink/40 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="w-full max-w-lg bg-white border border-line rounded-2xl shadow-2xl overflow-hidden flex flex-col my-8"
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
                    restSeconds: editingExercise.exercise?.restSeconds,
                    notes: editingExercise.exercise?.notes,
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
                <div className="p-4 sm:p-5 border-b border-line flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Dumbbell className="w-5 h-5 text-ink-2" />
                    <h3 className="font-extrabold text-base sm:text-lg text-ink">
                      {editingExercise.exercise ? 'Editar Ejercicio' : 'Nuevo Ejercicio'}
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditingExercise(null)}
                    className="p-1 rounded-lg text-slate-400 hover:text-ink transition"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="p-4 sm:p-5 flex flex-col gap-4 max-h-[70vh] overflow-y-auto">
                  {/* Posición / Orden en la rutina */}
                  <div>
                    <label className="block text-xs font-mono font-bold text-slate-700 uppercase mb-1 flex items-center gap-1.5">
                      <ArrowUpDown className="w-3.5 h-3.5 text-ink-2" />
                      <span>Posición / Orden en la rutina</span>
                    </label>
                    <select
                      name="orderPosition"
                      defaultValue={
                        editingExercise.exerciseIndex !== undefined
                          ? editingExercise.exerciseIndex
                          : activeRoutine.exercises.length
                      }
                      className="w-full px-3 py-2 rounded-xl bg-surface-2 border border-line-2 text-ink text-sm focus:outline-none focus:border-ink font-mono cursor-pointer"
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
                    <label className="block text-xs font-mono font-bold text-slate-700 uppercase mb-1">
                      1. Ejercicio *
                    </label>
                    <input
                      name="name"
                      defaultValue={editingExercise.exercise?.name || ''}
                      required
                      className="w-full px-3 py-2 rounded-xl bg-surface-2 border border-line-2 text-ink text-sm focus:outline-none focus:border-ink"
                      placeholder="ej. Press de Banca Plano con Barra"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-mono font-bold text-slate-700 uppercase mb-1">
                      Grupo Muscular
                    </label>
                    <input
                      name="muscleGroup"
                      defaultValue={editingExercise.exercise?.muscleGroup || ''}
                      className="w-full px-3 py-2 rounded-xl bg-surface-2 border border-line-2 text-ink text-sm focus:outline-none focus:border-ink"
                      placeholder="ej. Pectoral mayor y tríceps"
                    />
                  </div>

                  {/* 2. Series x Repes & 3. Peso */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-mono font-bold text-slate-700 uppercase mb-1">
                        2. Series x Repes *
                      </label>
                      <input
                        name="setsReps"
                        defaultValue={editingExercise.exercise?.setsReps || '4 x 8-10'}
                        required
                        className="w-full px-3 py-2 rounded-xl bg-surface-2 border border-line-2 text-ink text-sm font-mono focus:outline-none focus:border-ink"
                        placeholder="ej. 4 x 8-10"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-mono font-bold text-slate-700 uppercase mb-1">
                        3. Peso *
                      </label>
                      <input
                        name="weight"
                        defaultValue={editingExercise.exercise?.weight || '80 kg'}
                        required
                        className="w-full px-3 py-2 rounded-xl bg-surface-2 border border-line-2 text-ink text-sm font-mono focus:outline-none focus:border-ink"
                        placeholder="ej. 80 kg o 24 kg c/m"
                      />
                    </div>
                  </div>

                  {/* 4. Transferencia */}
                  <div>
                    <label className="block text-xs font-mono font-bold text-ink-2 uppercase mb-1 flex items-center gap-1">
                      <Flame className="w-3.5 h-3.5 text-ink-2" />
                      4. Transferencia Deportiva / Funcional
                    </label>
                    <textarea
                      name="transfer"
                      rows={2}
                      defaultValue={editingExercise.exercise?.transfer || ''}
                      className="w-full px-3 py-2 rounded-xl bg-surface-2 border border-line text-ink text-xs focus:outline-none focus:border-ink"
                      placeholder="ej. Potencia de impacto en tsuki, empuje de torso y estabilidad en combate."
                    />
                  </div>

                  {/* 5. Ejecución */}
                  <div>
                    <label className="block text-xs font-mono font-bold text-ink-2 uppercase mb-1 flex items-center gap-1">
                      <FileText className="w-3.5 h-3.5 text-ink-2" />
                      5. Claves de Ejecución Técnica / Tempo
                    </label>
                    <textarea
                      name="execution"
                      rows={2}
                      defaultValue={editingExercise.exercise?.execution || ''}
                      className="w-full px-3 py-2 rounded-xl bg-surface-2 border border-line text-ink text-xs focus:outline-none focus:border-indigo-400"
                      placeholder="ej. Tempo 3-0-1. Escápulas retraídas, barra rozando esternón con pausa de 1s, RIR 1-2."
                    />
                  </div>
                </div>

                <div className="p-4 border-t border-line flex items-center justify-end gap-2 bg-surface">
                  <button
                    type="button"
                    onClick={() => setEditingExercise(null)}
                    className="px-4 py-2 rounded-xl bg-surface-2 text-slate-700 text-xs font-semibold hover:bg-line transition"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-ink hover:bg-ink text-white text-xs font-bold transition shadow-md "
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
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-ink/40 ">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-white border border-line rounded-2xl shadow-2xl p-5 flex flex-col gap-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CalendarIcon className="w-5 h-5 text-ink-2" />
                  <h3 className="font-extrabold text-base text-ink">Programar Rutina en Agenda</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setScheduleModalRoutine(null)}
                  className="text-slate-400 hover:text-ink"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-3 rounded-xl bg-surface-2 border border-line-2 text-xs text-slate-700">
                <span className="font-bold text-ink">{scheduleModalRoutine.title}</span>
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
                    className="w-full px-3 py-2 rounded-xl bg-surface-2 border border-line-2 text-ink text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono font-bold text-slate-400 uppercase mb-1">Hora Inicio</label>
                  <input
                    type="time"
                    value={scheduleTime}
                    onChange={(e) => setScheduleTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-surface-2 border border-line-2 text-ink text-xs font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setScheduleModalRoutine(null)}
                  className="px-3.5 py-2 rounded-xl bg-surface-2 text-slate-700 text-xs font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmSchedule}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md "
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
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-ink/40 ">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-white border border-line rounded-2xl shadow-2xl p-5 flex flex-col gap-4"
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
                <div className="flex items-center justify-between pb-3 border-b border-line mb-3">
                  <h3 className="font-bold text-base text-ink">
                    {editingRoutineMeta ? 'Editar Rutina' : 'Crear Nueva Rutina'}
                  </h3>
                  <button
                    type="button"
                    onClick={() => {
                      setIsCreatingRoutine(false);
                      setEditingRoutineMeta(null);
                    }}
                    className="text-slate-400 hover:text-ink"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex flex-col gap-3">
                  <div>
                    <label className="block text-xs font-mono font-bold text-slate-700 uppercase mb-1">
                      Nombre de la Rutina *
                    </label>
                    <input
                      name="title"
                      defaultValue={editingRoutineMeta?.title || ''}
                      required
                      className="w-full px-3 py-2 rounded-xl bg-surface-2 border border-line-2 text-ink text-xs"
                      placeholder="ej. Día 5: Hombro & Brazo"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-mono font-bold text-slate-700 uppercase mb-1">
                      Subtítulo / Músculos
                    </label>
                    <input
                      name="subtitle"
                      defaultValue={editingRoutineMeta?.subtitle || ''}
                      className="w-full px-3 py-2 rounded-xl bg-surface-2 border border-line-2 text-ink text-xs"
                      placeholder="ej. Deltoides, bíceps y tríceps"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-mono font-bold text-slate-700 uppercase mb-1">
                      Enfoque / Transferencia Principal
                    </label>
                    <input
                      name="focus"
                      defaultValue={editingRoutineMeta?.focus || ''}
                      className="w-full px-3 py-2 rounded-xl bg-surface-2 border border-line-2 text-ink text-xs"
                      placeholder="ej. Hipertrofia y velocidad de brazos"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-mono font-bold text-slate-700 uppercase mb-1">
                        Minutos Estimados
                      </label>
                      <input
                        name="minutes"
                        type="number"
                        defaultValue={editingRoutineMeta?.estimatedMinutes || 60}
                        className="w-full px-3 py-2 rounded-xl bg-surface-2 border border-line-2 text-ink text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-mono font-bold text-slate-700 uppercase mb-1">
                        Días sugeridos (coma)
                      </label>
                      <input
                        name="days"
                        defaultValue={editingRoutineMeta?.targetDays?.join(', ') || 'Lunes, Jueves'}
                        className="w-full px-3 py-2 rounded-xl bg-surface-2 border border-line-2 text-ink text-xs"
                        placeholder="Lunes, Jueves"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-4 mt-2 border-t border-line">
                  <button
                    type="button"
                    onClick={() => {
                      setIsCreatingRoutine(false);
                      setEditingRoutineMeta(null);
                    }}
                    className="px-3.5 py-2 rounded-xl bg-surface-2 text-slate-700 text-xs font-semibold"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-ink hover:bg-ink text-white text-xs font-bold"
                  >
                    Guardar
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ========================================================================= */}
      {/* MODAL 4: CONFIRM REINICIAR ENTRENO                                        */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {showResetConfirmModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 ">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              className="w-full max-w-md bg-white border border-line rounded-3xl shadow-2xl overflow-hidden p-6 flex flex-col gap-4 relative"
            >
              <div className="w-14 h-14 rounded-2xl bg-surface border border-line flex items-center justify-center text-ink-2 mx-auto ">
                <RotateCcw className="w-7 h-7 text-ink-2" />
              </div>

              <div className="text-center">
                <h3 className="text-lg sm:text-xl font-black text-ink tracking-tight">
                  ¿Seguro que quieres reiniciar el entreno?
                </h3>
                <p className="text-sm text-slate-700 mt-2.5 leading-relaxed">
                  Empezarás de 0 otra vez. Se desmarcarán todas las series de los ejercicios de esta rutina para que puedas realizar tu entrenamiento desde el principio.
                </p>
              </div>

              <div className="flex items-center gap-3 mt-3 pt-3 border-t border-line">
                <button
                  type="button"
                  onClick={() => setShowResetConfirmModal(false)}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-surface-2 hover:bg-line text-slate-700 text-xs font-bold transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (activeRoutine) {
                      resetWorkoutSession(activeRoutine.id, userId, userEmail);
                      handleResetTimer();
                    }
                    setShowResetConfirmModal(false);
                  }}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-ink hover:bg-ink text-white text-xs font-bold shadow-lg transition cursor-pointer active:scale-95 flex items-center justify-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Sí, reiniciar de 0</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ========================================================================= */}
      {/* MODAL 5: MOBILE COUNTDOWN TIMER PICKER (RELOJ DE CUENTA ATRÁS DEL MÓVIL)  */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {isTimerPickerOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-ink/40 ">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              className="w-full max-w-md bg-white border border-line rounded-3xl shadow-2xl p-5 sm:p-6 flex flex-col gap-5 relative overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center justify-between pb-3 border-b border-line">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-surface border border-line flex items-center justify-center text-ink-2">
                    <Timer className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-base text-ink">Temporizador de Descanso</h3>
                    <p className="text-[11px] text-slate-400 font-mono">Personaliza minutos y segundos como en el móvil</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsTimerPickerOpen(false)}
                  className="p-1 rounded-xl text-slate-400 hover:text-ink hover:bg-surface-2 transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Big Digital Display like smartphone clock countdown */}
              <div className="flex flex-col items-center justify-center py-4 px-6 rounded-2xl bg-surface border border-line ">
                <div className="font-mono text-5xl sm:text-6xl font-black text-ink-2 tracking-wider flex items-center gap-2">
                  <span>{pickerMinutes.toString().padStart(2, '0')}</span>
                  <span className="text-slate-600 animate-pulse">:</span>
                  <span>{pickerSeconds.toString().padStart(2, '0')}</span>
                </div>
                <div className="flex items-center gap-12 text-[11px] font-mono uppercase text-slate-400 font-bold mt-1">
                  <span>Minutos</span>
                  <span>Segundos</span>
                </div>
              </div>

              {/* Dual Column Stepper / Controls */}
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                {/* Minutos column */}
                <div className="flex flex-col gap-2 p-3 rounded-2xl bg-surface border border-line">
                  <span className="text-xs font-mono font-bold text-slate-700 text-center uppercase tracking-wide">
                    Minutos
                  </span>
                  <div className="flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPickerMinutes((m) => Math.max(0, m - 1))}
                      className="w-10 h-10 rounded-xl bg-surface-2 hover:bg-line text-ink font-mono font-bold text-lg flex items-center justify-center active:scale-95 transition cursor-pointer"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      min={0}
                      max={59}
                      value={pickerMinutes}
                      onChange={(e) => setPickerMinutes(Math.max(0, Math.min(59, parseInt(e.target.value, 10) || 0)))}
                      className="w-14 h-10 text-center font-mono font-extrabold text-lg bg-white border border-line-2 rounded-xl text-ink focus:outline-none focus:border-ink"
                    />
                    <button
                      type="button"
                      onClick={() => setPickerMinutes((m) => Math.min(59, m + 1))}
                      className="w-10 h-10 rounded-xl bg-surface-2 hover:bg-line text-ink font-mono font-bold text-lg flex items-center justify-center active:scale-95 transition cursor-pointer"
                    >
                      +
                    </button>
                  </div>
                  {/* Quick minute chips */}
                  <div className="flex flex-wrap gap-1 justify-center mt-1">
                    {[1, 2, 3, 4, 5].map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => {
                          setPickerMinutes(m);
                          setPickerSeconds(0);
                        }}
                        className={`px-2 py-1 rounded-lg text-[11px] font-mono font-bold transition cursor-pointer ${
                          pickerMinutes === m && pickerSeconds === 0
                            ? 'bg-ink text-white'
                            : 'bg-surface-2 text-slate-700 hover:bg-line'
                        }`}
                      >
                        {m}m
                      </button>
                    ))}
                  </div>
                </div>

                {/* Segundos column */}
                <div className="flex flex-col gap-2 p-3 rounded-2xl bg-surface border border-line">
                  <span className="text-xs font-mono font-bold text-slate-700 text-center uppercase tracking-wide">
                    Segundos
                  </span>
                  <div className="flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPickerSeconds((s) => Math.max(0, s - 5))}
                      className="w-10 h-10 rounded-xl bg-surface-2 hover:bg-line text-ink font-mono font-bold text-lg flex items-center justify-center active:scale-95 transition cursor-pointer"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      min={0}
                      max={59}
                      step={5}
                      value={pickerSeconds}
                      onChange={(e) => setPickerSeconds(Math.max(0, Math.min(59, parseInt(e.target.value, 10) || 0)))}
                      className="w-14 h-10 text-center font-mono font-extrabold text-lg bg-white border border-line-2 rounded-xl text-ink focus:outline-none focus:border-ink"
                    />
                    <button
                      type="button"
                      onClick={() => setPickerSeconds((s) => Math.min(59, s + 5))}
                      className="w-10 h-10 rounded-xl bg-surface-2 hover:bg-line text-ink font-mono font-bold text-lg flex items-center justify-center active:scale-95 transition cursor-pointer"
                    >
                      +
                    </button>
                  </div>
                  {/* Quick second chips */}
                  <div className="flex flex-wrap gap-1 justify-center mt-1">
                    {[0, 15, 30, 45].map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setPickerSeconds(s)}
                        className={`px-2 py-1 rounded-lg text-[11px] font-mono font-bold transition cursor-pointer ${
                          pickerSeconds === s
                            ? 'bg-ink text-white'
                            : 'bg-surface-2 text-slate-700 hover:bg-line'
                        }`}
                      >
                        {s.toString().padStart(2, '0')}s
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Sound Settings Card */}
              <div className="p-3 rounded-2xl bg-surface border border-line flex flex-col gap-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono font-bold text-slate-700 flex items-center gap-1.5">
                    <Volume2 className="w-3.5 h-3.5 text-ink-2" />
                    Sonidos de Cuenta Atrás (a los 5s)
                  </span>
                  <button
                    type="button"
                    onClick={() => GymAudioEngine.testPreview(soundMode)}
                    className="px-2 py-0.5 rounded-lg bg-surface-2 hover:bg-line text-[10px] font-mono text-ink-2 transition cursor-pointer border border-line-2"
                  >
                    🔊 Probar sonido
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  {[
                    { id: 'both', label: 'Pitidos + Voz' },
                    { id: 'beeps', label: 'Solo Pitidos' },
                    { id: 'voice', label: 'Solo Voz' },
                    { id: 'muted', label: 'Silenciado' },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        const m = opt.id as GymSoundMode;
                        setSoundMode(m);
                        saveGymSoundMode(m);
                      }}
                      className={`px-2 py-1.5 rounded-xl text-[10px] font-mono font-bold border transition cursor-pointer text-center ${
                        soundMode === opt.id
                          ? 'bg-ink border-ink text-white'
                          : 'bg-surface-2 border-line-2 text-slate-700 hover:text-ink'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                  Cuenta atrás a los 5 segundos (5, 4, 3, 2, 1) y pitido largo ("piiii") al finalizar.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-2 border-t border-line">
                <button
                  type="button"
                  onClick={() => setIsTimerPickerOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-surface-2 hover:bg-line text-slate-700 text-xs font-semibold transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const total = pickerMinutes * 60 + pickerSeconds;
                    if (total > 0) {
                      setTimerPreset(total);
                      setIsTimerPickerOpen(false);
                    }
                  }}
                  className="flex-1 px-3 py-2.5 rounded-xl bg-surface-2 hover:bg-line text-slate-800 text-xs font-bold border border-line-2 hover:border-line-3 transition cursor-pointer text-center"
                >
                  Fijar descanso ({pickerMinutes}m {pickerSeconds ? `${pickerSeconds}s` : ''})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const total = pickerMinutes * 60 + pickerSeconds;
                    if (total > 0) {
                      startRestTimer(total);
                      setIsTimerPickerOpen(false);
                    }
                  }}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-ink hover:bg-ink text-white text-xs font-bold shadow-lg transition cursor-pointer active:scale-95 flex items-center justify-center gap-1.5"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>Iniciar ahora</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
