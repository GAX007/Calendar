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
} from 'lucide-react';
import { TaskItem } from './types';
import { INITIAL_TASKS } from './data/initialTasks';
import { DailyDashboard } from './components/DailyDashboard';
import { OmniInputBar } from './components/OmniInputBar';
import { SmartApprovalModal } from './components/SmartApprovalModal';
import { VisionScannerModal } from './components/VisionScannerModal';
import { TaskEditModal } from './components/TaskEditModal';
import { parseInputLocally, normalizeTimeString, computeEndTime } from './utils/localParser';
import { useRealTimeClock } from './hooks/useRealTimeClock';

export default function App() {
  const clock = useRealTimeClock();

  // Load tasks from localStorage or initial dataset
  const [tasks, setTasks] = useState<TaskItem[]>(() => {
    try {
      const saved = localStorage.getItem('calendarasist_tasks') || localStorage.getItem('omniagenda_tasks');
      if (saved) return JSON.parse(saved);
    } catch (_) {}
    return INITIAL_TASKS;
  });

  // Modal states
  const [isVisionModalOpen, setIsVisionModalOpen] = useState<boolean>(false);
  const [isApprovalModalOpen, setIsApprovalModalOpen] = useState<boolean>(false);
  const [editingTask, setEditingTask] = useState<TaskItem | null>(null);

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
      // Show button once user scrolls past 280px
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

  // Save tasks to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('calendarasist_tasks', JSON.stringify(tasks));
    } catch (_) {}
  }, [tasks]);

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
      // Resilient local extraction from user's actual prompt
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
    setIsApprovalModalOpen(false);
    showToast(
      `¡${approvedTasks.length} ${approvedTasks.length === 1 ? 'tarea añadida' : 'tareas añadidas'} al calendario exitosamente!`
    );
  };

  // Directly approve tasks from Vision Scanner
  const handleApproveVisionTasks = (visionTasks: TaskItem[]) => {
    setTasks((prev) => [...visionTasks, ...prev]);
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
      prev.map((t) => (t.id === taskId ? { ...t, completed: !t.completed } : t))
    );
  };

  const handleDeleteTask = (taskId: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    showToast('Tarea eliminada del calendario.');
  };

  const handleSaveUpdatedTask = (updated: TaskItem) => {
    setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    showToast('Tarea actualizada correctamente.');
  };

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

          {/* Quick actions */}
          <div className="flex items-center gap-2">
            <button
              id="header-btn-quick-vision-demo"
              onClick={() => {
                setIsVisionModalOpen(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900 border border-slate-700/80 text-xs text-slate-300 hover:text-white hover:border-slate-600 transition cursor-pointer"
            >
              <Camera className="w-3.5 h-3.5 text-cyan-400" />
              <span>Escanear foto</span>
            </button>
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
          onEditTaskRequest={(task) => setEditingTask(task)}
          onOpenVisionModal={() => setIsVisionModalOpen(true)}
        />
      </main>

      {/* Discreet Scroll-To-Top Floating Button */}
      <AnimatePresence>
        {showScrollTop && (
          <motion.button
            id="btn-scroll-to-top"
            initial={{ opacity: 0, scale: 0.8, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 10 }}
            transition={{ duration: 0.18 }}
            onClick={handleScrollToTop}
            className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] sm:bottom-20 right-3.5 sm:right-6 z-30 w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-slate-900/90 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-700/80 shadow-lg shadow-black/50 backdrop-blur-md flex items-center justify-center transition cursor-pointer active:scale-90 group"
            aria-label="Volver arriba"
            title="Volver arriba"
          >
            <ArrowUp className="w-4 h-4 sm:w-4.5 sm:h-4.5 transition-transform group-hover:-translate-y-0.5" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* The Omni-Input Floating Action Bar (Sticky at bottom, clean modern style) */}
      <OmniInputBar
        onOpenVisionModal={() => setIsVisionModalOpen(true)}
        onSubmitText={(text) => handleProcessInput(text, 'text')}
        isProcessing={isProcessing}
      />

      {/* Confirmation & Approval Modal */}
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
        onClose={() => setEditingTask(null)}
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
