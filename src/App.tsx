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
} from 'lucide-react';
import { TaskItem } from './types';
import { DailyDashboard } from './components/DailyDashboard';
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
} from './services/taskService';
import { isSupabaseConfigured } from './lib/supabase';

function CalendarApp() {
  const { user, isGuest, signOut, loading: authLoading } = useAuth();
  const clock = useRealTimeClock();

  // Load tasks from Supabase or localStorage fallback
  const [tasks, setTasks] = useState<TaskItem[]>(() => getLocalTasks(user?.id));
  const [isCloudConnected, setIsCloudConnected] = useState<boolean>(false);
  const [isLoadingDb, setIsLoadingDb] = useState<boolean>(true);

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
      <header className="sticky top-0 z-30 bg-slate-950/80 backdrop-blur-md border-b border-slate-800/80">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-600/20">
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <span className="font-extrabold text-sm sm:text-base text-white tracking-tight">
                CalendarAsist
              </span>
              <span className="hidden sm:inline-block ml-2 text-[11px] text-slate-400 font-medium">
                Agenda Personal
              </span>
            </div>
          </div>

          {/* Quick actions, Manual Add & User Avatar */}
          <div className="flex items-center gap-2 sm:gap-2.5">
            {/* Manual Task Creation Button */}
            <button
              id="header-btn-add-task"
              onClick={() => handleOpenNewTaskModal()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-sm shadow-indigo-600/30 transition cursor-pointer active:scale-95"
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
              className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900 border border-slate-700/80 text-xs text-slate-300 hover:text-white hover:border-slate-600 transition cursor-pointer"
            >
              <Camera className="w-3.5 h-3.5 text-cyan-400" />
              <span className="hidden sm:inline">Escanear foto</span>
              <span className="sm:hidden">Foto</span>
            </button>

            {/* User Session Info & Sign Out */}
            {user ? (
              <div className="flex items-center gap-1 pl-1.5 border-l border-slate-800">
                <div
                  title={user.email}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-900 border border-slate-800 text-xs text-slate-300 max-w-[120px] sm:max-w-[180px]"
                >
                  <User className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                  <span className="truncate text-[11px]">{user.email}</span>
                </div>
                <button
                  onClick={() => signOut()}
                  title="Cerrar sesión"
                  className="p-1.5 rounded-full text-slate-400 hover:text-red-400 hover:bg-slate-900 transition cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => signOut()}
                title="Iniciar sesión con una cuenta privada"
                className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-indigo-600/20 border border-indigo-500/40 text-indigo-300 text-xs hover:bg-indigo-600/30 transition cursor-pointer"
              >
                <User className="w-3 h-3" />
                <span>Login</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content: Daily Dashboard */}
      <main className="flex-1">
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
        />
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
            className="fixed bottom-24 right-5 sm:right-8 z-40 p-2.5 rounded-full bg-slate-900/90 hover:bg-indigo-600 text-slate-400 hover:text-white border border-slate-700/80 shadow-lg shadow-black/50 backdrop-blur-sm transition-colors cursor-pointer group"
          >
            <ArrowUp className="w-4 h-4 transition-transform group-hover:-translate-y-0.5" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Floating Omni-Input Bar (Voice & Text) */}
      <OmniInputBar
        onOpenVisionModal={() => setIsVisionModalOpen(true)}
        onOpenNewTaskModal={() => handleOpenNewTaskModal()}
        onSubmitText={(text) => handleProcessInput(text, 'text')}
        onProcessInput={(text, source) => handleProcessInput(text, source || 'text')}
        isProcessing={isProcessing}
      />

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
