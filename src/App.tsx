import React, { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Calendar,
  Check,
  ArrowUp,
  PlusCircle,
  Dumbbell,
  GraduationCap,
  CalendarDays,
  Menu,
  Undo2,
} from 'lucide-react';
import { TaskItem } from './types';
import { GoogleCalendarView } from './components/GoogleCalendarView';
import { NavigationDrawer } from './components/NavigationDrawer';
import { NextActivityCard } from './components/NextActivityCard';
import { DailyWaterTracker } from './components/DailyWaterTracker';
import { OmniInputBar } from './components/OmniInputBar';
import { TaskEditModal } from './components/TaskEditModal';
import { PwaUpdatePrompt } from './components/PwaUpdatePrompt';
import { AuthScreen } from './components/AuthScreen';
import { BottomNav, type AppTab } from './components/BottomNav';
import { PullToRefresh } from './components/PullToRefresh';
import { ModuleSkeleton, AppShellSkeleton } from './components/ui/Skeletons';
import { ModuleErrorBoundary } from './components/ui/ModuleErrorBoundary';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { haptic } from './utils/haptics';
import { useRealTimeClock } from './hooks/useRealTimeClock';
import { syncLiveGoogleCalendar, getEffectiveCalendarUrl, applyLatestGoogleCalendarSnapshot } from './services/googleCalendarService';
import {
  getLocalTasks,
  loadTasks,
  saveLocalTasks,
  upsertTasks,
  deleteTaskFromDb,
  toggleTaskCompleteInDb,
  subscribeToTaskChanges,
  applyTaskChange,
  isHydrationTask,
} from './services/taskService';
import { mergeGoogleCalendarSnapshot } from './utils/googleCalendarSnapshot';

// Heavy modules and modals load on demand (separate chunks)
const GymModule = lazy(() => import('./components/GymModule').then((m) => ({ default: m.GymModule })));
const UniversityModule = lazy(() => import('./components/UniversityModule').then((m) => ({ default: m.UniversityModule })));
const MoodleDeliverablesView = lazy(() => import('./components/MoodleDeliverablesView').then((m) => ({ default: m.MoodleDeliverablesView })));
const PlannerView = lazy(() => import('./components/PlannerView').then((m) => ({ default: m.PlannerView })));
const SmartApprovalModal = lazy(() => import('./components/SmartApprovalModal').then((m) => ({ default: m.SmartApprovalModal })));
const VisionScannerModal = lazy(() => import('./components/VisionScannerModal').then((m) => ({ default: m.VisionScannerModal })));
const GoogleCalendarSyncModal = lazy(() => import('./components/GoogleCalendarSyncModal').then((m) => ({ default: m.GoogleCalendarSyncModal })));
const CalendarLinkModal = lazy(() => import('./components/CalendarLinkModal').then((m) => ({ default: m.CalendarLinkModal })));
const AsistentePanel = lazy(() => import('./components/AsistentePanel').then((m) => ({ default: m.AsistentePanel })));

// Warm the module chunks once the agenda is idle so tab switches are instant
function prefetchModules() {
  void import('./components/PlannerView');
  void import('./components/MoodleDeliverablesView');
  void import('./components/UniversityModule');
  void import('./components/GymModule');
  void import('./components/SmartApprovalModal');
  void import('./components/VisionScannerModal');
}

// Mount a lazy modal the first time it opens and keep it mounted (preserves exit animations)
function useMountOnce(open: boolean): boolean {
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) setMounted(true);
  }, [open]);
  return mounted || open;
}

const TEXT_PARSE_TIMEOUT_MS = 15000;
const RESYNC_AFTER_HIDDEN_MS = 5 * 60 * 1000;

interface ToastState {
  id: number;
  message: string;
  action?: { label: string; onClick: () => void };
}

function CalendarApp() {
  const { user, isGuest, signOut, loading: authLoading } = useAuth();
  const clock = useRealTimeClock();

  // Load tasks from Supabase or localStorage fallback
  const [tasks, setTasks] = useState<TaskItem[]>(() => getLocalTasks(user?.id));
  const [isCloudConnected, setIsCloudConnected] = useState<boolean>(false);
  const [isLoadingDb, setIsLoadingDb] = useState<boolean>(true);

  // Active module tab
  // Notifications open the app on a tab: /?tab=planner
  const [activeTab, setActiveTab] = useState<AppTab>(() => {
    const tab = new URLSearchParams(window.location.search).get('tab');
    return tab === 'planner' || tab === 'moodle' || tab === 'university' || tab === 'gym' ? tab : 'agenda';
  });
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has('tab')) return;
    params.delete('tab');
    window.history.replaceState(null, '', window.location.pathname + (params.toString() ? `?${params}` : ''));
  }, []);
  const [selectedMoodleUid, setSelectedMoodleUid] = useState<string | null>(null);
  const [selectedUniversityHomeworkId, setSelectedUniversityHomeworkId] = useState<string | null>(null);
  const [selectedGymRoutineId, setSelectedGymRoutineId] = useState<string | undefined>(undefined);

  // Modal states
  const [isVisionModalOpen, setIsVisionModalOpen] = useState<boolean>(false);
  const [isApprovalModalOpen, setIsApprovalModalOpen] = useState<boolean>(false);
  const [editingTask, setEditingTask] = useState<TaskItem | null>(null);
  const [isNewTask, setIsNewTask] = useState<boolean>(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState<boolean>(false);
  const [isLinkCalendarModalOpen, setIsLinkCalendarModalOpen] = useState<boolean>(false);
  const visionModalMounted = useMountOnce(isVisionModalOpen);
  const approvalModalMounted = useMountOnce(isApprovalModalOpen);
  const syncModalMounted = useMountOnce(isSyncModalOpen);
  const linkModalMounted = useMountOnce(isLinkCalendarModalOpen);

  // Staged tasks for Confirmation Card
  const [stagedApprovalTasks, setStagedApprovalTasks] = useState<TaskItem[]>([]);
  const [stagedApprovalSource, setStagedApprovalSource] = useState<'vision' | 'text'>('text');
  const [stagedOriginalInput, setStagedOriginalInput] = useState<string>('');

  // Processing state
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Latest values for event handlers that must not re-subscribe
  const tasksRef = useRef<TaskItem[]>(tasks);
  tasksRef.current = tasks;
  const userIdRef = useRef<string | undefined>(user?.id);
  userIdRef.current = user?.id;

  // Discreet scroll-to-top button state
  const [showScrollTop, setShowScrollTop] = useState<boolean>(false);

  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 280);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleScrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  };

  const changeTab = (tab: AppTab) => {
    if (tab !== activeTab) {
      setActiveTab(tab);
      window.scrollTo({ top: 0 });
    }
  };

  // Initial load from Supabase & Realtime subscription scoped to user
  useEffect(() => {
    let isMounted = true;

    async function initializeTasks() {
      try {
        const { tasks: loadedTasks, isCloud } = await loadTasks(user?.id);
        if (isMounted) {
          setTasks(applyLatestGoogleCalendarSnapshot(loadedTasks, user?.id));
          setIsCloudConnected(isCloud);
        }
      } catch (err) {
        console.warn('Error during initial task load:', err);
      } finally {
        if (isMounted) {
          setIsLoadingDb(false);
        }
      }
    }

    if (user || isGuest) {
      initializeTasks();
    }

    // Realtime: apply each row change instead of reloading the whole table
    const unsubscribe = subscribeToTaskChanges(user?.id, (change) => {
      if (isMounted) {
        setTasks((prev) => applyTaskChange(prev, change));
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [user?.id, isGuest]);

  // Realtime does not replay events missed while the app was in background: reload after a long pause
  useEffect(() => {
    if (!user && !isGuest) return;
    let hiddenAt = 0;
    const handleVisibility = async () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
        return;
      }
      if (!hiddenAt || Date.now() - hiddenAt < RESYNC_AFTER_HIDDEN_MS) return;
      hiddenAt = 0;
      const { tasks: freshTasks, isCloud } = await loadTasks(user?.id);
      if (!isCloud) return;
      setTasks(applyLatestGoogleCalendarSnapshot(freshTasks, user?.id));
      setIsCloudConnected(true);
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [user?.id, isGuest]);

  // Save tasks to local cache (debounced: serializing every task on each change is costly on phones)
  const pendingSaveRef = useRef<{ tasks: TaskItem[]; userId?: string } | null>(null);
  const flushLocalSave = useCallback(() => {
    const pending = pendingSaveRef.current;
    if (pending) {
      pendingSaveRef.current = null;
      saveLocalTasks(pending.tasks, pending.userId);
    }
  }, []);

  useEffect(() => {
    if (pendingSaveRef.current && pendingSaveRef.current.userId !== user?.id) {
      flushLocalSave();
    }
    pendingSaveRef.current = { tasks, userId: user?.id };
    const timeoutId = setTimeout(flushLocalSave, 400);
    return () => clearTimeout(timeoutId);
  }, [tasks, user?.id, flushLocalSave]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') flushLocalSave();
    };
    window.addEventListener('pagehide', flushLocalSave);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      flushLocalSave();
      window.removeEventListener('pagehide', flushLocalSave);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [flushLocalSave]);

  // Purge any legacy/routine hydration tasks from memory, localStorage and Supabase
  useEffect(() => {
    setTasks((prev) => {
      const filtered = prev.filter((t) => !isHydrationTask(t));
      if (filtered.length !== prev.length) {
        saveLocalTasks(filtered, user?.id);
        const removed = prev.filter(isHydrationTask);
        removed.forEach((t) => deleteTaskFromDb(t.id));
      }
      return filtered;
    });
  }, [user?.id]);

  const showToast = useCallback((message: string, action?: ToastState['action']) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ id: Date.now(), message, action });
    toastTimerRef.current = setTimeout(() => setToast(null), action ? 6000 : 3500);
  }, []);

  // Preload the other modules once the agenda is ready and the main thread is idle
  useEffect(() => {
    if (isLoadingDb) return;
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    if (connection?.saveData) return;
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(prefetchModules, { timeout: 5000 });
      return () => w.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(prefetchModules, 2500);
    return () => window.clearTimeout(id);
  }, [isLoadingDb]);

  // Google Calendar feed sync (shared by auto-sync and pull-to-refresh)
  const lastAutoSyncRef = useRef<number>(0);
  const syncGoogleCalendar = useCallback(
    async (silent = true) => {
      // Security and privacy isolation:
      // Only sync if user has an effective calendar configured (or Xavier's university calendar)
      const userEmail = (user?.email || '').toLowerCase().trim();
      const effectiveUrl = getEffectiveCalendarUrl(user?.id, userEmail);

      if (!effectiveUrl) {
        return;
      }

      lastAutoSyncRef.current = Date.now();
      try {
        const res = await syncLiveGoogleCalendar(user?.id, userEmail);
        if (userIdRef.current !== user?.id) return;
        if (res.success) {
          setTasks((prev) => mergeGoogleCalendarSnapshot(prev, res.tasks));
          if (res.plannerError) {
            showToast(`Calendar actualizado; los fijos del planificador no se han podido actualizar.`);
          } else if (!silent) {
            showToast(`✓ Google Calendar sincronizado (${res.tasks.length} eventos)`);
          }
        } else if (!silent) {
          showToast(res.error || 'No se pudo sincronizar Google Calendar');
        }
      } catch (err) {
        console.warn('Auto-sync Google Calendar warning:', err);
        if (!silent) showToast('Sin conexión: se mantiene tu agenda guardada');
      }
    },
    [user?.id, user?.email, showToast]
  );

  const handlePullToRefresh = useCallback(async () => {
    const userEmail = (user?.email || '').toLowerCase().trim();
    if (getEffectiveCalendarUrl(user?.id, userEmail)) {
      await syncGoogleCalendar(false);
      return;
    }
    const { tasks: freshTasks, isCloud } = await loadTasks(user?.id);
    if (isCloud) {
      setTasks(applyLatestGoogleCalendarSnapshot(freshTasks, user?.id));
      setIsCloudConnected(true);
      showToast('✓ Agenda actualizada');
    } else {
      showToast('Sin conexión: se mantiene tu agenda guardada');
    }
  }, [user?.id, user?.email, syncGoogleCalendar, showToast]);

  // Auto-sync Google Calendar feed on startup, when returning to the app, and periodically
  useEffect(() => {
    // Wait for the initial task load before reconciling the source calendar.
    if (isLoadingDb) return;
    syncGoogleCalendar(true);

    // Sync when the user comes back (focus is unreliable in iOS standalone PWAs, so also visibilitychange)
    const handleReturn = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastAutoSyncRef.current < 60 * 1000) return;
      syncGoogleCalendar(true);
    };
    window.addEventListener('focus', handleReturn);
    document.addEventListener('visibilitychange', handleReturn);

    // Periodic recurring sync every 15 minutes (only while visible)
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') syncGoogleCalendar(true);
    }, 15 * 60 * 1000);

    return () => {
      window.removeEventListener('focus', handleReturn);
      document.removeEventListener('visibilitychange', handleReturn);
      clearInterval(interval);
    };
  }, [syncGoogleCalendar, isLoadingDb]);

  // PWA manual update check handler
  const [manualCheckFn, setManualCheckFn] = useState<(() => Promise<boolean>) | null>(null);
  const handleCheckUpdates = async () => {
    showToast('Buscando actualizaciones...');
    try {
      if (manualCheckFn) {
        const hasUpdate = await manualCheckFn();
        if (!hasUpdate) {
          setTimeout(() => {
            showToast('✓ CalendarAsist está al día');
          }, 500);
        }
      } else {
        setTimeout(() => {
          showToast('✓ CalendarAsist está al día');
        }, 500);
      }
    } catch {
      setTimeout(() => {
        showToast('✓ CalendarAsist está al día');
      }, 500);
    }
  };

  // Process text or voice transcript via multimodal endpoint
  const handleProcessInput = async (
    text: string,
    sourceType: 'voice' | 'text' = 'voice'
  ) => {
    setIsProcessing(true);
    // On a weak mobile connection, fall back to the local parser instead of waiting indefinitely
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TEXT_PARSE_TIMEOUT_MS);
    try {
      const response = await fetch('/api/parse-multimodal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          type: sourceType,
          text,
        }),
      });

      if (!response.ok) {
        throw new Error('Fallo al procesar las tareas');
      }

      const data = await response.json();
      let extracted: TaskItem[] = data.extractedTasks || [];
      // The local parser (~30 KB) is only loaded when text input is actually used
      const { normalizeTimeString, computeEndTime } = await import('./utils/localParser');

      // Ensure every task has valid time, endTime, and durationMinutes
      extracted = extracted.map((t) => {
        const time = normalizeTimeString(t.time, '12:00');
        const durationMinutes = Number(t.durationMinutes) || 60;
        const endTime = t.endTime
          ? normalizeTimeString(t.endTime)
          : computeEndTime(time, durationMinutes);
        return {
          ...t,
          time,
          endTime,
          durationMinutes,
        };
      });

      // Open the Smart Confirmation Card
      setStagedApprovalTasks(extracted);
      setStagedApprovalSource(sourceType);
      setStagedOriginalInput(text);
      setIsApprovalModalOpen(true);
    } catch (err) {
      console.warn('Usando parsing inteligente local de respaldo:', err);
      const { parseInputLocally } = await import('./utils/localParser');
      const fallbackExtracted = parseInputLocally(text, sourceType);
      setStagedApprovalTasks(fallbackExtracted);
      setStagedApprovalSource(sourceType);
      setStagedOriginalInput(text);
      setIsApprovalModalOpen(true);
    } finally {
      clearTimeout(timeoutId);
      setIsProcessing(false);
    }
  };

  // Approve and add tasks from the Smart Approval Card
  const handleApproveAndAddTasks = (approvedTasks: TaskItem[]) => {
    haptic(15);
    setTasks((prev) => [...approvedTasks, ...prev]);
    upsertTasks(approvedTasks, user?.id);
    setIsApprovalModalOpen(false);
    showToast(
      `¡${approvedTasks.length} ${approvedTasks.length === 1 ? 'tarea añadida' : 'tareas añadidas'} al calendario exitosamente!`
    );
  };

  // Directly approve tasks from Vision Scanner
  const handleApproveVisionTasks = (visionTasks: TaskItem[]) => {
    setTasks((prev) => [...visionTasks, ...prev]);
    upsertTasks(visionTasks, user?.id);
    setIsVisionModalOpen(false);
    showToast(
      `¡${visionTasks.length} bloques de calendario extraídos de la imagen y sincronizados!`
    );
  };

  // Send tasks from Vision to Approval Card for review
  const handleSendVisionToApproval = (visionTasks: TaskItem[], summary: string) => {
    setStagedApprovalTasks(visionTasks);
    setStagedApprovalSource('vision');
    setStagedOriginalInput(summary);
    setIsVisionModalOpen(false);
    setIsApprovalModalOpen(true);
  };

  // Task actions in dashboard
  const handleToggleTaskComplete = (taskId: string) => {
    const target = tasksRef.current.find((t) => t.id === taskId);
    if (!target) return;
    const updated = !target.completed;
    if (updated) haptic(12);
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, completed: updated } : t)));
    toggleTaskCompleteInDb(taskId, updated);
  };

  const handleDeleteTask = (taskId: string) => {
    const removed = tasksRef.current.find((t) => t.id === taskId);
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    deleteTaskFromDb(taskId);
    showToast(
      'Tarea eliminada del calendario.',
      removed
        ? {
            label: 'Deshacer',
            onClick: () => {
              setTasks((prev) => (prev.some((t) => t.id === removed.id) ? prev : [removed, ...prev]));
              upsertTasks([removed], userIdRef.current);
              showToast('Tarea restaurada.');
            },
          }
        : undefined
    );
  };

  const handleOpenNewTaskModal = (targetDate?: string, targetTime?: string) => {
    const time = targetTime || '12:00';
    const [h, m] = time.split(':').map(Number);
    const endH = ((h + 1) % 24).toString().padStart(2, '0');
    const endTime = `${endH}:${(m || 0).toString().padStart(2, '0')}`;

    const newTask: TaskItem = {
      id: `manual-${Date.now()}`,
      title: '',
      category: 'Academics',
      date: targetDate || clock.dateStr,
      time,
      endTime,
      durationMinutes: 60,
      priority: 'media',
      notes: '',
      sourceType: 'manual',
      confidence: 1.0,
      completed: false,
    };
    setIsNewTask(true);
    setEditingTask(newTask);
  };

  const handleSaveUpdatedTask = (updated: TaskItem) => {
    if (isNewTask) {
      setTasks((prev) => [updated, ...prev]);
      upsertTasks([updated], user?.id);
      showToast('Nueva tarea añadida correctamente.');
      setIsNewTask(false);
    } else {
      setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      upsertTasks([updated], user?.id);
      showToast('Tarea actualizada correctamente.');
    }
  };

  if (authLoading) {
    return <AppShellSkeleton />;
  }

  if (!user && !isGuest) {
    return <AuthScreen />;
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans transition-colors duration-200">
      {/* Collapsible Left Navigation Drawer (Opens and closes to maximize space) */}
      <NavigationDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        activeTab={activeTab}
        setActiveTab={changeTab}
        clock={clock}
        user={user}
        signOut={signOut}
        onOpenNewTaskModal={() => handleOpenNewTaskModal()}
        onOpenVisionModal={() => setIsVisionModalOpen(true)}
        onOpenLinkCalendarModal={() => setIsLinkCalendarModalOpen(true)}
        onCheckUpdates={handleCheckUpdates}
      />

      {/* Top Mobile-First Header Bar: Sticky, respects notch safe-area, 44px+ touch targets */}
      <header className="sticky top-0 z-40 w-full bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800 pt-[max(env(safe-area-inset-top,0px),0.5rem)] pb-2 px-3 sm:px-6 transition-colors shadow-2xs">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
          {/* Left: 44x44px touch-friendly hamburger button & page title */}
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              id="btn-open-navigation-drawer"
              type="button"
              onClick={() => setIsDrawerOpen(true)}
              className="w-11 h-11 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-200 flex items-center justify-center transition cursor-pointer active:scale-95 border border-slate-200/60 dark:border-slate-700/60 shadow-2xs touch-manipulation shrink-0"
              title="Menú de navegación"
              aria-label="Abrir menú"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Current Context / Date Indicator on Mobile */}
            <div className="flex flex-col min-w-0">
              <span className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white truncate leading-tight">
                {activeTab === 'agenda'
                  ? 'Agenda & Horarios'
                  : activeTab === 'planner'
                  ? 'Plan de estudio'
                  : activeTab === 'moodle'
                  ? 'Entregas Moodle'
                  : activeTab === 'university'
                  ? 'Deberes & Asignaturas'
                  : 'Gym & Rutinas'}
              </span>
              <span className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 capitalize truncate">
                {clock.dayName}, {clock.dayNumber} {clock.monthName}
              </span>
            </div>
          </div>

          {/* Center: Desktop Navigation Tabs */}
          <nav className="hidden md:flex items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-2xl border border-slate-200/60 dark:border-slate-750">
            <button type="button" onClick={() => changeTab('planner')} className={`px-3 py-1.5 rounded-xl font-bold text-xs transition cursor-pointer ${activeTab === 'planner' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300' : 'text-slate-600 dark:text-slate-400'}`}>Plan de estudio</button>
            <button
              type="button"
              onClick={() => changeTab('agenda')}
              className={`px-3 py-1.5 rounded-xl font-bold text-xs transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'agenda'
                  ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Agenda</span>
            </button>
            <button
              type="button"
              onClick={() => changeTab('moodle')}
              className={`px-3 py-1.5 rounded-xl font-bold text-xs transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'moodle'
                  ? 'bg-white dark:bg-slate-700 text-amber-600 dark:text-amber-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <CalendarDays className="w-3.5 h-3.5" />
              <span>Entregas Moodle</span>
            </button>
            <button
              type="button"
              onClick={() => changeTab('university')}
              className={`px-3 py-1.5 rounded-xl font-bold text-xs transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'university'
                  ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <GraduationCap className="w-3.5 h-3.5" />
              <span>Universidad</span>
            </button>
            <button
              type="button"
              onClick={() => changeTab('gym')}
              className={`px-3 py-1.5 rounded-xl font-bold text-xs transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'gym'
                  ? 'bg-white dark:bg-slate-700 text-rose-600 dark:text-rose-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Dumbbell className="w-3.5 h-3.5" />
              <span>Gym</span>
            </button>
          </nav>

          {/* Right: Quick Action Nueva Tarea */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => handleOpenNewTaskModal()}
              className="h-10 sm:h-11 px-3 sm:px-4 rounded-2xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs sm:text-sm font-bold shadow-xs hover:shadow-md transition cursor-pointer active:scale-95 flex items-center gap-1.5 touch-manipulation"
              title="Crear nueva tarea o actividad"
            >
              <PlusCircle className="w-4 h-4 shrink-0" />
              <span>Nueva Tarea</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content: Google Calendar View, University Module, or Gym Module */}
      <main className="flex-1 pt-3 sm:pt-5 pb-[calc(var(--bottom-nav-h)+9rem)] md:pb-40">
        {activeTab === 'agenda' ? (
          <div className="max-w-6xl mx-auto px-2.5 sm:px-6 pb-28 flex flex-col gap-4">
            {/* Nightly assistant: morning summary, notices and weekly review */}
            {user && (
              <Suspense fallback={null}>
                <AsistentePanel userId={user.id} onOpenPlanner={() => changeTab('planner')} showToast={showToast} />
              </Suspense>
            )}

            {/* Top Cards: Next activity reminder & Daily Hydration Tracker */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <NextActivityCard
                tasks={tasks}
                clock={clock}
                onToggleTaskComplete={handleToggleTaskComplete}
                onOpenNewTaskModal={() => handleOpenNewTaskModal()}
                onOpenGymRoutine={(routineId) => {
                  setSelectedGymRoutineId(routineId);
                  changeTab('gym');
                }}
              />

              <DailyWaterTracker dateStr={clock.dateStr} />
            </div>

            {/* Google Calendar Time-Grid System */}
            <GoogleCalendarView
              tasks={tasks}
              clock={clock}
              userId={user?.id}
              userEmail={user?.email}
              onToggleTaskComplete={handleToggleTaskComplete}
              onDeleteTask={handleDeleteTask}
              onEditTaskRequest={(task) => {
                setIsNewTask(false);
                setEditingTask(task);
              }}
              onAddNewTask={(date, time) => handleOpenNewTaskModal(date, time)}
              onOpenLinkCalendarModal={() => setIsLinkCalendarModalOpen(true)}
              onOpenGymRoutine={(routineId) => {
                setSelectedGymRoutineId(routineId);
                changeTab('gym');
              }}
              onLiveSyncSuccess={(newTasks) => {
                setTasks((prev) => mergeGoogleCalendarSnapshot(prev, newTasks));
                showToast(`¡${newTasks.length} eventos sincronizados en directo desde Google Calendar!`);
              }}
              showToast={showToast}
            />
          </div>
        ) : (
          <ModuleErrorBoundary key={activeTab}>
          <Suspense fallback={<ModuleSkeleton />}>
            {activeTab === 'planner' ? (
              <PlannerView onOpenEntrega={(uid) => {
                if (uid.startsWith('uni:')) { setSelectedUniversityHomeworkId(uid.slice(4)); changeTab('university'); }
                else { setSelectedMoodleUid(uid); changeTab('moodle'); }
              }} />
            ) : activeTab === 'moodle' ? (
              <div className="pb-28">
                <MoodleDeliverablesView showToast={showToast} selectedEntregaUid={selectedMoodleUid} onClearSelection={() => setSelectedMoodleUid(null)} />
              </div>
            ) : activeTab === 'university' ? (
              <div className="pb-28">
                <UniversityModule
                  clock={clock}
                  calendarTasks={tasks}
                  userId={user?.id}
                  selectedHomeworkId={selectedUniversityHomeworkId}
                  onHomeworkOpened={() => setSelectedUniversityHomeworkId(null)}
                  onScheduleHomeworkInCalendar={(task) => handleApproveAndAddTasks([task])}
                  showToast={showToast}
                  onNavigateToMoodle={() => changeTab('moodle')}
                />
              </div>
            ) : (
              <div className="pb-28">
                <GymModule
                  clock={clock}
                  userId={user?.id}
                  userEmail={user?.email}
                  initialRoutineId={selectedGymRoutineId}
                  onClose={() => changeTab('agenda')}
                  onScheduleRoutineInCalendar={(task) => {
                    handleApproveAndAddTasks([task]);
                    changeTab('agenda');
                  }}
                />
              </div>
            )}
          </Suspense>
          </ModuleErrorBoundary>
        )}
      </main>

      {/* Pull down at the top of the agenda to sync */}
      <PullToRefresh enabled={activeTab === 'agenda'} onRefresh={handlePullToRefresh} />

      {/* Discreet Scroll-To-Top Floating Button */}
      <AnimatePresence>
        {showScrollTop && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 10 }}
            transition={{ duration: 0.2 }}
            onClick={handleScrollToTop}
            title="Volver arriba"
            aria-label="Volver arriba"
            className={`fixed ${
              activeTab === 'agenda'
                ? 'bottom-[calc(var(--bottom-nav-h)+8.5rem)] md:bottom-28'
                : 'bottom-[calc(var(--bottom-nav-h)+1rem)] md:bottom-24'
            } right-3.5 sm:right-8 z-50 p-2.5 sm:p-3 rounded-full bg-white dark:bg-slate-900 hover:bg-indigo-600 hover:text-white text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 shadow-lg backdrop-blur-md transition-all cursor-pointer group active:scale-95`}
          >
            <ArrowUp className="w-4 h-4 transition-transform group-hover:-translate-y-0.5" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Floating Omni-Input Bar (only on agenda) */}
      {activeTab === 'agenda' && (
        <OmniInputBar
          onOpenVisionModal={() => setIsVisionModalOpen(true)}
          onOpenNewTaskModal={() => handleOpenNewTaskModal()}
          onSubmitText={(text) => handleProcessInput(text, 'text')}
          onProcessInput={(text, source) => handleProcessInput(text, source || 'text')}
          isProcessing={isProcessing}
        />
      )}

      {/* Mobile tab bar */}
      <BottomNav activeTab={activeTab} onChange={changeTab} />

      {/* Smart Approval Confirmation Card */}
      {approvalModalMounted && (
        <Suspense fallback={null}>
          <SmartApprovalModal
            isOpen={isApprovalModalOpen}
            tasks={stagedApprovalTasks}
            sourceType={stagedApprovalSource}
            originalInput={stagedOriginalInput}
            onClose={() => setIsApprovalModalOpen(false)}
            onApproveAndAdd={handleApproveAndAddTasks}
          />
        </Suspense>
      )}

      {/* Vision Scanner Modal */}
      {visionModalMounted && (
        <Suspense fallback={null}>
          <VisionScannerModal
            isOpen={isVisionModalOpen}
            onClose={() => setIsVisionModalOpen(false)}
            onApproveTasks={handleApproveVisionTasks}
            onSendToApprovalCard={handleSendVisionToApproval}
          />
        </Suspense>
      )}

      {/* Google Calendar Sync & Import/Export Modal */}
      {syncModalMounted && (
        <Suspense fallback={null}>
          <GoogleCalendarSyncModal
            userId={user?.id}
            userEmail={user?.email}
            onLiveSyncSuccess={(newTasks) => setTasks((prev) => mergeGoogleCalendarSnapshot(prev, newTasks))}
            isOpen={isSyncModalOpen}
            onClose={() => setIsSyncModalOpen(false)}
            tasks={tasks}
            onImportTasks={(importedTasks) => {
              setTasks((prev) => [...new Map([...prev, ...importedTasks].map(task => [task.id, task])).values()]);
              upsertTasks(importedTasks, user?.id);
              showToast(`¡${importedTasks.length} eventos sincronizados exitosamente!`);
            }}
            showToast={showToast}
          />
        </Suspense>
      )}

      {/* User Personal Google Calendar (.ics) Link Modal */}
      {linkModalMounted && (
        <Suspense fallback={null}>
          <CalendarLinkModal
            isOpen={isLinkCalendarModalOpen}
            onClose={() => setIsLinkCalendarModalOpen(false)}
            userId={user?.id}
            userEmail={user?.email}
            onSyncSuccess={(newTasks) => {
              setTasks((prev) => mergeGoogleCalendarSnapshot(prev, newTasks));
            }}
            showToast={showToast}
          />
        </Suspense>
      )}

      {/* Task Edit Modal for Dashboard items */}
      <TaskEditModal
        isOpen={Boolean(editingTask)}
        task={editingTask}
        isNew={isNewTask}
        onClose={() => {
          setEditingTask(null);
          setIsNewTask(false);
        }}
        onSave={handleSaveUpdatedTask}
        onDelete={handleDeleteTask}
      />

      {/* Toast Notification: bottom, within thumb reach and above the floating bars */}
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            role="status"
            aria-live="polite"
            initial={{ opacity: 0, y: 20, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.97 }}
            transition={{ duration: 0.18 }}
            className={`fixed left-1/2 -translate-x-1/2 z-[110] w-[calc(100%-1.5rem)] max-w-sm flex items-center gap-2.5 pl-4 pr-2 py-2 min-h-11 rounded-2xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold shadow-xl border border-slate-800 dark:border-slate-200 ${
              activeTab === 'agenda'
                ? 'bottom-[calc(var(--bottom-nav-h)+7.25rem)] md:bottom-32'
                : 'bottom-[calc(var(--bottom-nav-h)+0.75rem)] md:bottom-6'
            }`}
          >
            <Check className="w-4 h-4 shrink-0 text-emerald-400 dark:text-emerald-600" />
            <span className="flex-1 min-w-0">{toast.message}</span>
            {toast.action && (
              <button
                type="button"
                onClick={() => {
                  const action = toast.action;
                  if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
                  setToast(null);
                  action?.onClick();
                }}
                className="shrink-0 flex items-center gap-1 px-3 py-2 rounded-xl text-indigo-300 dark:text-indigo-600 font-bold hover:bg-white/10 dark:hover:bg-slate-100 touch-manipulation"
              >
                <Undo2 className="w-3.5 h-3.5" />
                {toast.action.label}
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* PWA Service Worker Auto-Updater */}
      <PwaUpdatePrompt onManualCheckReady={setManualCheckFn} />
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <CalendarApp />
      </AuthProvider>
    </ThemeProvider>
  );
}
