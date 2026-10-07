import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Sparkles,
  Camera,
  Calendar,
  CheckCircle2,
  Bell,
  Clock,
  Zap,
  Info,
  ShieldCheck,
  Check,
  ArrowUp,
  PlusCircle,
  User,
  LogOut,
  Dumbbell,
  GraduationCap,
  CalendarDays,
  Menu,
} from 'lucide-react';
import { TaskItem } from './types';
import { DailyDashboard } from './components/DailyDashboard';
import { GoogleCalendarView } from './components/GoogleCalendarView';
import { GoogleCalendarSyncModal } from './components/GoogleCalendarSyncModal';
import { CalendarLinkModal } from './components/CalendarLinkModal';
import { NavigationDrawer } from './components/NavigationDrawer';
import { NextActivityCard } from './components/NextActivityCard';
import { GymModule } from './components/GymModule';
import { UniversityModule } from './components/UniversityModule';
import { MoodleDeliverablesView } from './components/MoodleDeliverablesView';
import { DailyWaterTracker } from './components/DailyWaterTracker';
import { OmniInputBar } from './components/OmniInputBar';
import { SmartApprovalModal } from './components/SmartApprovalModal';
import { VisionScannerModal } from './components/VisionScannerModal';
import { TaskEditModal } from './components/TaskEditModal';
import { PwaUpdatePrompt } from './components/PwaUpdatePrompt';
import { AuthScreen } from './components/AuthScreen';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { parseInputLocally, normalizeTimeString, computeEndTime } from './utils/localParser';
import { useRealTimeClock } from './hooks/useRealTimeClock';
import { syncLiveGoogleCalendar, getEffectiveCalendarUrl } from './services/googleCalendarService';
import {
  getLocalTasks,
  loadTasks,
  saveLocalTasks,
  upsertTasks,
  deleteTaskFromDb,
  toggleTaskCompleteInDb,
  subscribeToTaskChanges,
  isHydrationTask,
} from './services/taskService';
import { isSupabaseConfigured } from './lib/supabase';

function CalendarApp() {
  const { user, isGuest, signOut, loading: authLoading } = useAuth();
  const clock = useRealTimeClock();

  // Load tasks from Supabase or localStorage fallback
  const [tasks, setTasks] = useState<TaskItem[]>(() => getLocalTasks(user?.id));
  const [isCloudConnected, setIsCloudConnected] = useState<boolean>(false);
  const [isLoadingDb, setIsLoadingDb] = useState<boolean>(true);

  // Active module tab ('agenda' | 'university' | 'gym' | 'moodle')
  const [activeTab, setActiveTab] = useState<'agenda' | 'university' | 'gym' | 'moodle'>('agenda');
  const [selectedGymRoutineId, setSelectedGymRoutineId] = useState<string | undefined>(undefined);

  // Modal states
  const [isVisionModalOpen, setIsVisionModalOpen] = useState<boolean>(false);
  const [isApprovalModalOpen, setIsApprovalModalOpen] = useState<boolean>(false);
  const [editingTask, setEditingTask] = useState<TaskItem | null>(null);
  const [isNewTask, setIsNewTask] = useState<boolean>(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState<boolean>(false);
  const [isLinkCalendarModalOpen, setIsLinkCalendarModalOpen] = useState<boolean>(false);

  // Staged tasks for Confirmation Card
  const [stagedApprovalTasks, setStagedApprovalTasks] = useState<TaskItem[]>([]);
  const [stagedApprovalSource, setStagedApprovalSource] = useState<'vision' | 'text'>('text');
  const [stagedOriginalInput, setStagedOriginalInput] = useState<string>('');

  // Processing state
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

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

  // Initial load from Supabase & Realtime subscription scoped to user
  useEffect(() => {
    let isMounted = true;

    async function initializeTasks() {
      try {
        const { tasks: loadedTasks, isCloud } = await loadTasks(user?.id);
        if (isMounted) {
          setTasks(loadedTasks);
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

    // Subscribe to realtime updates from Supabase if connected
    const unsubscribe = subscribeToTaskChanges(async () => {
      const { tasks: freshTasks, isCloud } = await loadTasks(user?.id);
      if (isMounted) {
        setTasks(freshTasks);
        setIsCloudConnected(isCloud);
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [user?.id, isGuest]);

  // Save tasks to local cache
  useEffect(() => {
    saveLocalTasks(tasks, user?.id);
  }, [tasks, user?.id]);

  // Purge any legacy/routine hydration tasks from memory, localStorage and Supabase
  useEffect(() => {
    setTasks((prev) => {
      const filtered = prev.filter((t) => !isHydrationTask(t));
      if (filtered.length !== prev.length) {
        const count = prev.length - filtered.length;
        saveLocalTasks(filtered, user?.id);
        const removed = prev.filter(isHydrationTask);
        removed.forEach((t) => deleteTaskFromDb(t.id));
      }
      return filtered;
    });
  }, [user?.id]);

  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  // Auto-sync Google Calendar feed on startup, when focusing tab, and periodically
  useEffect(() => {
    let isMounted = true;

    const performAutoSync = async (silent = true) => {
      // Security and privacy isolation:
      // Only sync if user has an effective calendar configured (or Xavier's university calendar)
      const userEmail = (user?.email || '').toLowerCase().trim();
      const effectiveUrl = getEffectiveCalendarUrl(user?.id, userEmail);

      if (!effectiveUrl) {
        return;
      }

      try {
        const res = await syncLiveGoogleCalendar(user?.id, userEmail);
        if (res.success && res.tasks.length > 0 && isMounted) {
          setTasks((prev) => {
            const newIds = new Set(res.tasks.map((t) => t.id));
            const retained = prev.filter((t) => !newIds.has(t.id));
            return [...res.tasks, ...retained];
          });
          upsertTasks(res.tasks, user?.id);
          if (!silent) {
            showToast(`✓ Google Calendar sincronizado (${res.tasks.length} eventos)`);
          }
        }
      } catch (err) {
        console.warn('Auto-sync Google Calendar warning:', err);
      }
    };

    // 1. Initial sync upon entering the app
    performAutoSync(true);

    // 2. Sync on window focus (when user returns to the tab)
    const handleFocus = () => {
      performAutoSync(true);
    };
    window.addEventListener('focus', handleFocus);

    // 3. Periodic recurring sync every 15 minutes
    const interval = setInterval(() => {
      performAutoSync(true);
    }, 15 * 60 * 1000);

    return () => {
      isMounted = false;
      window.removeEventListener('focus', handleFocus);
      clearInterval(interval);
    };
  }, [user?.id]);

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
    try {
      const response = await fetch('/api/parse-multimodal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      const fallbackExtracted = parseInputLocally(text, sourceType);
      setStagedApprovalTasks(fallbackExtracted);
      setStagedApprovalSource(sourceType);
      setStagedOriginalInput(text);
      setIsApprovalModalOpen(true);
    } finally {
      setIsProcessing(false);
    }
  };

  // Approve and add tasks from the Smart Approval Card
  const handleApproveAndAddTasks = (approvedTasks: TaskItem[]) => {
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
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id === taskId) {
          const updated = !t.completed;
          toggleTaskCompleteInDb(taskId, updated);
          return { ...t, completed: updated };
        }
        return t;
      })
    );
  };

  const handleDeleteTask = (taskId: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    deleteTaskFromDb(taskId);
    showToast('Tarea eliminada del calendario.');
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
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center text-slate-500 gap-3 font-sans">
        <div className="w-10 h-10 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin" />
        <span className="text-xs text-slate-600 dark:text-slate-400 font-medium">Iniciando CalendarAsist...</span>
      </div>
    );
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
        setActiveTab={setActiveTab}
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
            <button
              type="button"
              onClick={() => setActiveTab('agenda')}
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
              onClick={() => setActiveTab('moodle')}
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
              onClick={() => setActiveTab('university')}
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
              onClick={() => setActiveTab('gym')}
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
      <main className="flex-1 pt-3 sm:pt-5 pb-36 sm:pb-40">
        {activeTab === 'agenda' ? (
          <div className="max-w-6xl mx-auto px-2.5 sm:px-6 pb-28 flex flex-col gap-4">
            {/* Top Cards: Next activity reminder & Daily Hydration Tracker */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <NextActivityCard
                tasks={tasks}
                clock={clock}
                onToggleTaskComplete={handleToggleTaskComplete}
                onOpenNewTaskModal={() => handleOpenNewTaskModal()}
                onOpenGymRoutine={(routineId) => {
                  setSelectedGymRoutineId(routineId);
                  setActiveTab('gym');
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
                setActiveTab('gym');
              }}
              onLiveSyncSuccess={(newTasks) => {
                setTasks((prev) => {
                  const newIds = new Set(newTasks.map((t) => t.id));
                  const retained = prev.filter((t) => !newIds.has(t.id));
                  return [...newTasks, ...retained];
                });
                upsertTasks(newTasks, user?.id);
                showToast(`¡${newTasks.length} eventos sincronizados en directo desde Google Calendar!`);
              }}
              showToast={showToast}
            />
          </div>
        ) : activeTab === 'moodle' ? (
          <div className="pb-28">
            <MoodleDeliverablesView showToast={showToast} />
          </div>
        ) : activeTab === 'university' ? (
          <div className="pb-28">
            <UniversityModule
              clock={clock}
              userId={user?.id}
              onScheduleHomeworkInCalendar={(task) => handleApproveAndAddTasks([task])}
              showToast={showToast}
              onNavigateToMoodle={() => setActiveTab('moodle')}
            />
          </div>
        ) : (
          <div className="pb-28">
            <GymModule
              clock={clock}
              userId={user?.id}
              userEmail={user?.email}
              initialRoutineId={selectedGymRoutineId}
              onClose={() => setActiveTab('agenda')}
              onScheduleRoutineInCalendar={(task) => {
                handleApproveAndAddTasks([task]);
                setActiveTab('agenda');
              }}
            />
          </div>
        )}
      </main>

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
                ? 'bottom-[calc(9.5rem+env(safe-area-inset-bottom,0px))] sm:bottom-28'
                : 'bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] sm:bottom-24'
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

      {/* Smart Approval Confirmation Card */}
      <SmartApprovalModal
        isOpen={isApprovalModalOpen}
        tasks={stagedApprovalTasks}
        sourceType={stagedApprovalSource}
        originalInput={stagedOriginalInput}
        onClose={() => setIsApprovalModalOpen(false)}
        onApproveAndAdd={handleApproveAndAddTasks}
      />

      {/* Vision Scanner Modal */}
      <VisionScannerModal
        isOpen={isVisionModalOpen}
        onClose={() => setIsVisionModalOpen(false)}
        onApproveTasks={handleApproveVisionTasks}
        onSendToApprovalCard={handleSendVisionToApproval}
      />

      {/* Google Calendar Sync & Import/Export Modal */}
      <GoogleCalendarSyncModal
        isOpen={isSyncModalOpen}
        onClose={() => setIsSyncModalOpen(false)}
        tasks={tasks}
        onImportTasks={(importedTasks) => {
          setTasks((prev) => [...importedTasks, ...prev]);
          upsertTasks(importedTasks, user?.id);
          showToast(`¡${importedTasks.length} eventos sincronizados exitosamente!`);
        }}
        showToast={showToast}
      />

      {/* User Personal Google Calendar (.ics) Link Modal */}
      <CalendarLinkModal
        isOpen={isLinkCalendarModalOpen}
        onClose={() => setIsLinkCalendarModalOpen(false)}
        userId={user?.id}
        userEmail={user?.email}
        onSyncSuccess={(newTasks) => {
          setTasks((prev) => {
            const newIds = new Set(newTasks.map((t) => t.id));
            const retained = prev.filter((t) => !newIds.has(t.id));
            return [...newTasks, ...retained];
          });
          upsertTasks(newTasks, user?.id);
        }}
        showToast={showToast}
      />

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

      {/* Toast Notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed top-16 right-4 z-50 flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold shadow-xl border border-slate-800 dark:border-slate-200"
          >
            <Check className="w-4 h-4 text-emerald-400 dark:text-emerald-600" />
            <span>{toastMessage}</span>
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
