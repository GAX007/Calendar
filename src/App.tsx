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
} from 'lucide-react';
import { TaskItem } from './types';
import { DailyDashboard } from './components/DailyDashboard';
import { GymModule } from './components/GymModule';
import { DailyWaterTracker } from './components/DailyWaterTracker';
import { OmniInputBar } from './components/OmniInputBar';
import { SmartApprovalModal } from './components/SmartApprovalModal';
import { VisionScannerModal } from './components/VisionScannerModal';
import { TaskEditModal } from './components/TaskEditModal';
import { AuthScreen } from './components/AuthScreen';
import { AuthProvider, useAuth } from './context/AuthContext';
import { parseInputLocally, normalizeTimeString, computeEndTime } from './utils/localParser';
import { useRealTimeClock } from './hooks/useRealTimeClock';
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

  // Active module tab ('agenda' | 'gym')
  const [activeTab, setActiveTab] = useState<'agenda' | 'gym'>('agenda');
  const [selectedGymRoutineId, setSelectedGymRoutineId] = useState<string | undefined>(undefined);

  // Modal states
  const [isVisionModalOpen, setIsVisionModalOpen] = useState<boolean>(false);
  const [isApprovalModalOpen, setIsApprovalModalOpen] = useState<boolean>(false);
  const [editingTask, setEditingTask] = useState<TaskItem | null>(null);
  const [isNewTask, setIsNewTask] = useState<boolean>(false);

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
        showToast(
          `Se ${count === 1 ? 'ha eliminado 1 tarea' : `han eliminado ${count} tareas`} de hidratación del calendario para usar el nuevo widget de agua.`
        );
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

  const handleOpenNewTaskModal = (targetDate?: string) => {
    const newTask: TaskItem = {
      id: `manual-${Date.now()}`,
      title: '',
      category: 'Academics',
      date: targetDate || clock.dateStr,
      time: '12:00',
      endTime: '13:00',
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
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-400 gap-3 font-sans">
        <div className="w-10 h-10 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
        <span className="text-xs text-slate-500 font-medium">Iniciando CalendarAsist...</span>
      </div>
    );
  }

  if (!user && !isGuest) {
    return <AuthScreen />;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500/30 selection:text-indigo-200">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-30 bg-slate-950/85 backdrop-blur-md border-b border-slate-800/80">
        <div className="max-w-5xl mx-auto px-2.5 sm:px-6 h-14 flex items-center justify-between gap-1.5 sm:gap-2">
          <div className="flex items-center gap-1.5 sm:gap-3 min-w-0">
            <div className="flex items-center gap-2 shrink-0">
              <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-600/20">
                {activeTab === 'gym' ? (
                  <Dumbbell className="w-4 h-4 text-rose-200" />
                ) : (
                  <Calendar className="w-4 h-4" />
                )}
              </div>
              <span className="font-extrabold text-sm sm:text-base text-white tracking-tight hidden md:inline">
                CalendarAsist
              </span>
            </div>

            {/* Navigation Tabs Switcher */}
            <nav className="flex items-center p-0.5 sm:p-1 bg-slate-900 border border-slate-800 rounded-xl shrink-0">
              <button
                id="tab-btn-agenda"
                type="button"
                onClick={() => setActiveTab('agenda')}
                className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  activeTab === 'agenda'
                    ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>Agenda</span>
              </button>
              <button
                id="tab-btn-gym"
                type="button"
                onClick={() => setActiveTab('gym')}
                className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  activeTab === 'gym'
                    ? 'bg-rose-600 text-white shadow-sm shadow-rose-600/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Dumbbell className="w-3.5 h-3.5" />
                <span>Gym<span className="hidden sm:inline"> & Rutinas</span></span>
              </button>
            </nav>
          </div>

          {/* Quick actions, Hydration pill, Manual Add & User Avatar */}
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            {/* Quick Hydration Pill Widget */}
            <DailyWaterTracker dateStr={clock.dateStr} isCompact={true} />

            {/* Manual Task Creation Button (shown on Agenda tab) */}
            {activeTab === 'agenda' && (
              <>
                <button
                  id="header-btn-add-task"
                  onClick={() => handleOpenNewTaskModal()}
                  className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-sm shadow-indigo-600/30 transition cursor-pointer active:scale-95"
                  title="Añadir tarea manualmente"
                >
                  <PlusCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>Nueva tarea</span>
                </button>

                <button
                  id="header-btn-quick-vision-demo"
                  onClick={() => {
                    setIsVisionModalOpen(true);
                  }}
                  className="hidden md:flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900 border border-slate-700/80 text-xs text-slate-300 hover:text-white hover:border-slate-600 transition cursor-pointer"
                >
                  <Camera className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Foto</span>
                </button>
              </>
            )}

            {/* User Session Info & Sign Out */}
            {user ? (
              <div className="flex items-center gap-1 pl-1 sm:pl-1.5 border-l border-slate-800 shrink-0">
                <div
                  title={user.email}
                  className="flex items-center justify-center sm:justify-start gap-1.5 w-7 h-7 sm:w-auto sm:px-2.5 sm:py-1 rounded-full bg-slate-900 border border-slate-800 text-xs text-slate-300 shrink-0"
                >
                  <User className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                  <span className="hidden sm:inline truncate text-[11px] max-w-[140px]">{user.email}</span>
                </div>
                <button
                  onClick={() => signOut()}
                  title="Cerrar sesión"
                  className="w-7 h-7 sm:w-auto p-1.5 rounded-full text-slate-400 hover:text-red-400 hover:bg-slate-900 transition cursor-pointer flex items-center justify-center shrink-0"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => signOut()}
                title="Iniciar sesión con una cuenta privada"
                className="flex items-center gap-1 px-2 py-1 sm:px-2.5 rounded-full bg-indigo-600/20 border border-indigo-500/40 text-indigo-300 text-xs hover:bg-indigo-600/30 transition cursor-pointer shrink-0"
              >
                <User className="w-3 h-3" />
                <span>Login</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content: Daily Dashboard or Gym Module */}
      <main className="flex-1">
        {activeTab === 'agenda' ? (
          <DailyDashboard
            tasks={tasks}
            clock={clock}
            onToggleTaskComplete={handleToggleTaskComplete}
            onDeleteTask={handleDeleteTask}
            onEditTaskRequest={(task) => {
              setIsNewTask(false);
              setEditingTask(task);
            }}
            onOpenVisionModal={() => setIsVisionModalOpen(true)}
            onAddNewTask={(date) => handleOpenNewTaskModal(date)}
            onOpenGymRoutine={(routineId) => {
              setSelectedGymRoutineId(routineId);
              setActiveTab('gym');
            }}
          />
        ) : (
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
            } right-3.5 sm:right-8 z-50 p-2.5 sm:p-3 rounded-full bg-slate-900/95 hover:bg-indigo-600 text-slate-300 hover:text-white border border-slate-700/90 shadow-xl shadow-black/60 backdrop-blur-md transition-all cursor-pointer group active:scale-95`}
          >
            <ArrowUp className="w-4 h-4 transition-transform group-hover:-translate-y-0.5" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Floating Omni-Input Bar (Voice & Text) - only active on agenda */}
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

      {/* Vision Feature UI (Scanning a Schedule / Split-screen concept) */}
      <VisionScannerModal
        isOpen={isVisionModalOpen}
        onClose={() => setIsVisionModalOpen(false)}
        onApproveTasks={handleApproveVisionTasks}
        onSendToApprovalCard={handleSendVisionToApproval}
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
            className="fixed top-16 right-4 z-50 flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-slate-900 border border-emerald-500/40 text-emerald-200 text-xs font-semibold shadow-xl shadow-slate-950/80"
          >
            <Check className="w-4 h-4 text-emerald-400" />
            <span>{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <CalendarApp />
    </AuthProvider>
  );
}
