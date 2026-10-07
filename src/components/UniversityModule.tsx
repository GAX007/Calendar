import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  GraduationCap,
  BookOpen,
  Calendar,
  Clock,
  CheckCircle2,
  Circle,
  PlusCircle,
  Trash2,
  Edit2,
  CalendarDays,
  AlertCircle,
  Check,
  Tag,
  Search,
  Filter,
  School,
  FileText,
  Layers,
  Award,
  CalendarCheck,
  X,
  ChevronRight,
  ListOrdered,
  Sparkles,
  Flame,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import {
  UniversitySubject,
  UniversityHomework,
  HomeworkStatus,
  HomeworkType,
  HomeworkPriority,
  TaskItem,
} from '../types';
import {
  getUniversitySubjects,
  getUniversityHomework,
  addSubject,
  updateSubject,
  deleteSubject,
  addHomework,
  updateHomework,
  deleteHomework,
  toggleHomeworkStatus,
  syncHomeworkToCalendar,
} from '../services/universityService';
import { RealTimeClockState } from '../hooks/useRealTimeClock';

interface UniversityModuleProps {
  clock: RealTimeClockState;
  userId?: string;
  onScheduleHomeworkInCalendar?: (task: TaskItem) => void;
  showToast?: (message: string) => void;
  onNavigateToMoodle?: () => void;
}

const COLOR_PALETTES: Record<
  string,
  {
    bg: string;
    text: string;
    border: string;
    dot: string;
    label: string;
    cardBg: string;
    cardBorder: string;
    leftBar: string;
    hoverBg: string;
  }
> = {
  indigo: {
    bg: 'bg-indigo-50 dark:bg-indigo-950/40',
    text: 'text-indigo-700 dark:text-indigo-300',
    border: 'border-indigo-200 dark:border-indigo-800/80',
    dot: 'bg-indigo-500',
    label: 'Índigo',
    cardBg: 'bg-indigo-50/70 dark:bg-indigo-950/35',
    cardBorder: 'border-indigo-200/90 dark:border-indigo-800/70',
    leftBar: 'border-l-indigo-500',
    hoverBg: 'hover:bg-indigo-100/60 dark:hover:bg-indigo-950/60',
  },
  blue: {
    bg: 'bg-blue-50 dark:bg-blue-950/40',
    text: 'text-blue-700 dark:text-blue-300',
    border: 'border-blue-200 dark:border-blue-800/80',
    dot: 'bg-blue-500',
    label: 'Azul',
    cardBg: 'bg-blue-50/70 dark:bg-blue-950/35',
    cardBorder: 'border-blue-200/90 dark:border-blue-800/70',
    leftBar: 'border-l-blue-500',
    hoverBg: 'hover:bg-blue-100/60 dark:hover:bg-blue-950/60',
  },
  purple: {
    bg: 'bg-purple-50 dark:bg-purple-950/40',
    text: 'text-purple-700 dark:text-purple-300',
    border: 'border-purple-200 dark:border-purple-800/80',
    dot: 'bg-purple-500',
    label: 'Púrpura',
    cardBg: 'bg-purple-50/70 dark:bg-purple-950/35',
    cardBorder: 'border-purple-200/90 dark:border-purple-800/70',
    leftBar: 'border-l-purple-500',
    hoverBg: 'hover:bg-purple-100/60 dark:hover:bg-purple-950/60',
  },
  emerald: {
    bg: 'bg-emerald-50 dark:bg-emerald-950/40',
    text: 'text-emerald-700 dark:text-emerald-300',
    border: 'border-emerald-200 dark:border-emerald-800/80',
    dot: 'bg-emerald-500',
    label: 'Esmeralda',
    cardBg: 'bg-emerald-50/70 dark:bg-emerald-950/35',
    cardBorder: 'border-emerald-200/90 dark:border-emerald-800/70',
    leftBar: 'border-l-emerald-500',
    hoverBg: 'hover:bg-emerald-100/60 dark:hover:bg-emerald-950/60',
  },
  amber: {
    bg: 'bg-amber-50 dark:bg-amber-950/40',
    text: 'text-amber-800 dark:text-amber-300',
    border: 'border-amber-200 dark:border-amber-800/80',
    dot: 'bg-amber-500',
    label: 'Ámbar',
    cardBg: 'bg-amber-50/70 dark:bg-amber-950/35',
    cardBorder: 'border-amber-200/90 dark:border-amber-800/70',
    leftBar: 'border-l-amber-500',
    hoverBg: 'hover:bg-amber-100/60 dark:hover:bg-amber-950/60',
  },
  rose: {
    bg: 'bg-rose-50 dark:bg-rose-950/40',
    text: 'text-rose-700 dark:text-rose-300',
    border: 'border-rose-200 dark:border-rose-800/80',
    dot: 'bg-rose-500',
    label: 'Rosa / Coral',
    cardBg: 'bg-rose-50/70 dark:bg-rose-950/35',
    cardBorder: 'border-rose-200/90 dark:border-rose-800/70',
    leftBar: 'border-l-rose-500',
    hoverBg: 'hover:bg-rose-100/60 dark:hover:bg-rose-950/60',
  },
  cyan: {
    bg: 'bg-cyan-50 dark:bg-cyan-950/40',
    text: 'text-cyan-700 dark:text-cyan-300',
    border: 'border-cyan-200 dark:border-cyan-800/80',
    dot: 'bg-cyan-500',
    label: 'Cian',
    cardBg: 'bg-cyan-50/70 dark:bg-cyan-950/35',
    cardBorder: 'border-cyan-200/90 dark:border-cyan-800/70',
    leftBar: 'border-l-cyan-500',
    hoverBg: 'hover:bg-cyan-100/60 dark:hover:bg-cyan-950/60',
  },
};

const HOMEWORK_TYPE_LABELS: Record<HomeworkType, { label: string; icon: string }> = {
  practica: { label: 'Práctica', icon: '💻' },
  ejercicios: { label: 'Ejercicios', icon: '📝' },
  proyecto: { label: 'Proyecto', icon: '🚀' },
  examen: { label: 'Examen', icon: '📚' },
  lectura: { label: 'Lectura', icon: '📖' },
  otro: { label: 'Otro', icon: '📌' },
};

export const UniversityModule: React.FC<UniversityModuleProps> = ({
  clock,
  userId,
  onScheduleHomeworkInCalendar,
  showToast = (_msg: string) => {},
  onNavigateToMoodle,
}) => {
  const [subjects, setSubjects] = useState<UniversitySubject[]>(() => getUniversitySubjects());
  const [homeworkList, setHomeworkList] = useState<UniversityHomework[]>(() => getUniversityHomework());

  // Selected navigation: either a subject ID, or a special view: 'all' | 'urgent' | 'completed'
  const [selectedNav, setSelectedNav] = useState<string>(() => subjects[0]?.id || 'all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'completed'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Mobile sidebar visibility toggle
  const [isSidebarOpenMobile, setIsSidebarOpenMobile] = useState<boolean>(false);

  // Modals
  const [isSubjectModalOpen, setIsSubjectModalOpen] = useState(false);
  const [editingSubject, setEditingSubject] = useState<UniversitySubject | null>(null);

  const [isHomeworkModalOpen, setIsHomeworkModalOpen] = useState(false);
  const [editingHomework, setEditingHomework] = useState<UniversityHomework | null>(null);
  const [preselectedSubjectId, setPreselectedSubjectId] = useState<string | undefined>(undefined);

  // Subject deletion confirmation
  const [confirmDeleteSubjectId, setConfirmDeleteSubjectId] = useState<string | null>(null);

  // Active Subject if selectedNav is a subject ID
  const activeSubject = useMemo(() => {
    return subjects.find((s) => s.id === selectedNav) || null;
  }, [subjects, selectedNav]);

  // Statistics
  const stats = useMemo(() => {
    const totalSubjects = subjects.length;
    const totalHomework = homeworkList.length;
    const pendingHomework = homeworkList.filter((h) => h.status !== 'entregado').length;
    const completedHomework = homeworkList.filter((h) => h.status === 'entregado').length;
    const completionRate = totalHomework > 0 ? Math.round((completedHomework / totalHomework) * 100) : 0;

    const urgentCount = homeworkList.filter((h) => {
      if (h.status === 'entregado') return false;
      const diffDays = Math.ceil(
        (new Date(h.dueDate).getTime() - new Date(clock.dateStr).getTime()) / (1000 * 60 * 60 * 24)
      );
      return diffDays <= 3;
    }).length;

    return {
      totalSubjects,
      totalHomework,
      pendingHomework,
      completedHomework,
      completionRate,
      urgentCount,
    };
  }, [subjects, homeworkList, clock.dateStr]);

  // Filtered homework list for the current active view
  const currentViewHomework = useMemo(() => {
    let list = [...homeworkList];

    // Filter by selected navigation
    if (selectedNav === 'urgent') {
      list = list.filter((h) => {
        if (h.status === 'entregado') return false;
        const diffDays = Math.ceil(
          (new Date(h.dueDate).getTime() - new Date(clock.dateStr).getTime()) / (1000 * 60 * 60 * 24)
        );
        return diffDays <= 3;
      });
    } else if (selectedNav === 'completed') {
      list = list.filter((h) => h.status === 'entregado');
    } else if (selectedNav !== 'all') {
      // Specific subject selected
      list = list.filter((h) => h.subjectId === selectedNav);
    }

    // Status filter
    if (statusFilter === 'pending') {
      list = list.filter((h) => h.status !== 'entregado');
    } else if (statusFilter === 'completed') {
      list = list.filter((h) => h.status === 'entregado');
    }

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((h) => {
        const subject = subjects.find((s) => s.id === h.subjectId);
        const matchTitle = h.title.toLowerCase().includes(q);
        const matchDesc = (h.description || '').toLowerCase().includes(q);
        const matchSubject = (subject?.name || '').toLowerCase().includes(q) || (subject?.code || '').toLowerCase().includes(q);
        return matchTitle || matchDesc || matchSubject;
      });
    }

    // Sort: pending first, then by dueDate ascending
    return list.sort((a, b) => {
      if (a.status === 'entregado' && b.status !== 'entregado') return 1;
      if (a.status !== 'entregado' && b.status === 'entregado') return -1;
      return a.dueDate.localeCompare(b.dueDate);
    });
  }, [homeworkList, selectedNav, statusFilter, searchQuery, subjects, clock.dateStr]);

  // Handlers
  const handleToggleHomework = (hwId: string) => {
    const updated = toggleHomeworkStatus(hwId);
    if (updated) {
      setHomeworkList((prev) => prev.map((h) => (h.id === hwId ? updated : h)));
      showToast(
        updated.status === 'entregado'
          ? '🎉 ¡Entrega marcada como realizada!'
          : 'Entrega marcada como pendiente.'
      );
    }
  };

  const handleDeleteHomework = (hwId: string) => {
    deleteHomework(hwId);
    setHomeworkList((prev) => prev.filter((h) => h.id !== hwId));
    showToast('Entrega eliminada.');
  };

  const handleSyncToCalendar = (hw: UniversityHomework) => {
    const { task, updatedHomework } = syncHomeworkToCalendar(hw, subjects, userId);
    setHomeworkList((prev) => prev.map((h) => (h.id === hw.id ? updatedHomework : h)));
    if (onScheduleHomeworkInCalendar) {
      onScheduleHomeworkInCalendar(task);
    }
    showToast(`✓ "${hw.title}" añadida a la Agenda del ${hw.dueDate}`);
  };

  const handleSaveSubject = (subjectData: Partial<UniversitySubject>) => {
    if (editingSubject) {
      const updated: UniversitySubject = { ...editingSubject, ...subjectData } as UniversitySubject;
      updateSubject(updated);
      setSubjects((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      showToast('Asignatura actualizada.');
    } else {
      const created = addSubject({
        name: subjectData.name || 'Nueva Asignatura',
        code: subjectData.code || 'ASIG',
        color: subjectData.color || 'indigo',
        professor: subjectData.professor,
        classroom: subjectData.classroom,
        credits: subjectData.credits || 6,
        semester: subjectData.semester,
        notes: subjectData.notes,
      });
      setSubjects((prev) => [...prev, created]);
      setSelectedNav(created.id);
      showToast('Nueva asignatura añadida.');
    }
    setIsSubjectModalOpen(false);
    setEditingSubject(null);
  };

  const handleDeleteSubject = (subjectId: string) => {
    deleteSubject(subjectId);
    setSubjects((prev) => prev.filter((s) => s.id !== subjectId));
    setHomeworkList((prev) => prev.filter((h) => h.subjectId !== subjectId));
    if (selectedNav === subjectId) {
      setSelectedNav('all');
    }
    setConfirmDeleteSubjectId(null);
    showToast('Asignatura eliminada.');
  };

  const handleSaveHomework = (hwData: Partial<UniversityHomework>) => {
    if (editingHomework) {
      const updated: UniversityHomework = { ...editingHomework, ...hwData } as UniversityHomework;
      updateHomework(updated);
      setHomeworkList((prev) => prev.map((h) => (h.id === updated.id ? updated : h)));
      showToast('Entrega actualizada.');
    } else {
      const targetSubjId = hwData.subjectId || activeSubject?.id || subjects[0]?.id || 'subj-alg';
      const created = addHomework({
        subjectId: targetSubjId,
        title: hwData.title || 'Nueva Entrega',
        dueDate: hwData.dueDate || clock.dateStr,
        dueTime: hwData.dueTime || '23:59',
        type: hwData.type || 'practica',
        priority: hwData.priority || 'alta',
        status: hwData.status || 'pendiente',
        description: hwData.description,
        weightPercentage: hwData.weightPercentage,
        estimatedHours: hwData.estimatedHours,
      });
      setHomeworkList((prev) => [created, ...prev]);

      if (hwData.calendarTaskId) {
        handleSyncToCalendar(created);
      }
      showToast('Nueva entrega programada correctamente.');
    }
    setIsHomeworkModalOpen(false);
    setEditingHomework(null);
  };

  const getUrgencyBadge = (dueDateStr: string, isCompleted: boolean) => {
    if (isCompleted) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
          <Check className="w-3 h-3 text-emerald-600" />
          Entregado
        </span>
      );
    }

    const today = new Date(clock.dateStr);
    const due = new Date(dueDateStr);
    const diffDays = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 animate-pulse">
          <AlertCircle className="w-3 h-3 text-rose-600" />
          Atrasada ({Math.abs(diffDays)}d)
        </span>
      );
    }
    if (diffDays === 0) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 animate-pulse">
          <Clock className="w-3 h-3 text-rose-600" />
          ¡Vence Hoy!
        </span>
      );
    }
    if (diffDays === 1) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
          <Clock className="w-3 h-3 text-amber-600" />
          Mañana
        </span>
      );
    }
    if (diffDays <= 3) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
          En {diffDays} días
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
        En {diffDays} días
      </span>
    );
  };

  const formatDueDateSpanish = (dateStr: string) => {
    try {
      const [y, m, d] = dateStr.split('-').map(Number);
      const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
      const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
      const dObj = new Date(y, m - 1, d);
      return `${days[dObj.getDay()]} ${d} de ${months[m - 1]}`;
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="w-full max-w-6xl mx-auto px-3 sm:px-6 py-4 sm:py-6 flex flex-col gap-5">
      {/* Top Banner (Compact & Modern) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs shrink-0">
            <GraduationCap className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              Universidad & Seguimiento de Deberes
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Panel organizado por asignaturas: tareas, entregas de prácticas y fechas límite.
            </p>
          </div>
        </div>

        {/* Mobile Toggle Button for Left Sidebar */}
        <div className="flex items-center gap-2 md:hidden">
          <button
            type="button"
            onClick={() => setIsSidebarOpenMobile((p) => !p)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold border border-slate-200 dark:border-slate-700 cursor-pointer"
          >
            {isSidebarOpenMobile ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
            <span>{isSidebarOpenMobile ? 'Ocultar Asignaturas' : 'Ver Asignaturas'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setEditingHomework(null);
              setPreselectedSubjectId(activeSubject?.id);
              setIsHomeworkModalOpen(true);
            }}
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-indigo-600 text-white text-xs font-bold shadow-xs ml-auto"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>+ Tarea</span>
          </button>
        </div>
      </div>

      {/* Banner de acceso directo a Entregas Moodle */}
      {onNavigateToMoodle && (
        <div className="bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-300/80 dark:border-amber-800/80 rounded-2xl p-3.5 flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-700 dark:text-amber-400">
              <CalendarDays className="w-4 h-4" />
            </div>
            <div>
              <p className="font-extrabold text-slate-900 dark:text-white">
                Sincronización oficial de Moodle (ICS) activa
              </p>
              <p className="text-slate-500 dark:text-slate-400 text-[11px]">
                Consulta todas las entregas y cuestionarios importados automáticamente desde el calendario.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onNavigateToMoodle}
            className="px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold transition shadow-xs flex items-center gap-1 cursor-pointer shrink-0"
          >
            <span>Ver Entregas Moodle</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main Two-Column Layout (Sidebar on Left like Gemini, Content on Right) */}
      <div className="flex flex-col md:flex-row gap-5 items-start w-full">
        {/* ========================================================================= */}
        {/* LEFT SIDEBAR: Gemini-style Asignaturas Navigation                         */}
        {/* ========================================================================= */}
        <aside
          className={`w-full md:w-72 lg:w-80 shrink-0 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-3.5 flex flex-col gap-4 shadow-xs md:sticky md:top-20 ${
            isSidebarOpenMobile ? 'block' : 'hidden md:flex'
          }`}
        >
          {/* Action button: "+ Nueva Asignatura" (Gemini "+ New Chat" style) */}
          <div className="flex flex-col gap-2">
            <button
              id="sidebar-btn-add-subject"
              type="button"
              onClick={() => {
                setEditingSubject(null);
                setIsSubjectModalOpen(true);
              }}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-900 dark:text-slate-100 font-bold text-xs border border-slate-200 dark:border-slate-700 transition cursor-pointer active:scale-95 shadow-2xs"
            >
              <PlusCircle className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span>Nueva Asignatura</span>
            </button>

            <button
              id="sidebar-btn-add-homework"
              type="button"
              onClick={() => {
                setEditingHomework(null);
                setPreselectedSubjectId(activeSubject?.id);
                setIsHomeworkModalOpen(true);
              }}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-xs transition cursor-pointer active:scale-95"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Añadir Entrega / Deber</span>
            </button>
          </div>

          {/* Global Views Section */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 px-2 py-1">
              Vistas Generales
            </span>

            <button
              type="button"
              onClick={() => {
                setSelectedNav('all');
                setIsSidebarOpenMobile(false);
              }}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition cursor-pointer ${
                selectedNav === 'all'
                  ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/80 shadow-2xs'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60'
              }`}
            >
              <div className="flex items-center gap-2">
                <ListOrdered className="w-3.5 h-3.5 text-indigo-500" />
                <span>Todas las Entregas</span>
              </div>
              <span className="text-[11px] font-mono px-1.5 py-0.2 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                {stats.totalHomework}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setSelectedNav('urgent');
                setIsSidebarOpenMobile(false);
              }}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition cursor-pointer ${
                selectedNav === 'urgent'
                  ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/80 shadow-2xs'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60'
              }`}
            >
              <div className="flex items-center gap-2">
                <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
                <span>Próximas Urgentes (&le; 3d)</span>
              </div>
              {stats.urgentCount > 0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-rose-500 text-white animate-pulse">
                  {stats.urgentCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setSelectedNav('completed');
                setIsSidebarOpenMobile(false);
              }}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition cursor-pointer ${
                selectedNav === 'completed'
                  ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/80 shadow-2xs'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60'
              }`}
            >
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                <span>Entregadas / Historial</span>
              </div>
              <span className="text-[11px] font-mono px-1.5 py-0.2 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                {stats.completedHomework}
              </span>
            </button>
          </div>

          {/* MIS ASIGNATURAS LIST (Like conversation history in Gemini) */}
          <div className="flex flex-col gap-1 border-t border-slate-100 dark:border-slate-800 pt-3">
            <div className="flex items-center justify-between px-2 py-1">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Mis Asignaturas ({subjects.length})
              </span>
            </div>

            {subjects.length === 0 ? (
              <p className="text-xs text-slate-400 italic px-2 py-3 text-center">
                No hay asignaturas. Pulsa "+ Nueva Asignatura" para añadir tu primera materia.
              </p>
            ) : (
              <div className="flex flex-col gap-1 max-h-[50vh] overflow-y-auto no-scrollbar pr-0.5">
                {subjects.map((s) => {
                  const isSelected = selectedNav === s.id;
                  const palette = COLOR_PALETTES[s.color] || COLOR_PALETTES.indigo;
                  const subjTasks = homeworkList.filter((h) => h.subjectId === s.id);
                  const pendingCount = subjTasks.filter((h) => h.status !== 'entregado').length;

                  return (
                    <div
                      key={s.id}
                      className={`group relative flex items-center justify-between px-3 py-2 rounded-xl text-xs transition cursor-pointer ${
                        isSelected
                          ? `${palette.bg} ${palette.text} ${palette.border} border font-bold shadow-2xs`
                          : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60 font-medium'
                      }`}
                      onClick={() => {
                        setSelectedNav(s.id);
                        setIsSidebarOpenMobile(false);
                      }}
                    >
                      {/* Left: Code badge & Name */}
                      <div className="flex items-center gap-2.5 min-w-0 pr-1">
                        <span
                          className={`w-6 h-6 rounded-lg text-[10px] font-extrabold flex items-center justify-center shrink-0 border ${palette.bg} ${palette.text} ${palette.border}`}
                        >
                          {s.code.substring(0, 3)}
                        </span>
                        <span className="truncate">{s.name}</span>
                      </div>

                      {/* Right: Pending badge & Hover action buttons */}
                      <div className="flex items-center gap-1 shrink-0">
                        {pendingCount > 0 ? (
                          <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 group-hover:hidden">
                            {pendingCount}
                          </span>
                        ) : (
                          <Check className="w-3.5 h-3.5 text-emerald-500 opacity-80 group-hover:hidden" />
                        )}

                        {/* Hover actions (Edit / Delete) */}
                        <div className="hidden group-hover:flex items-center gap-0.5">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingSubject(s);
                              setIsSubjectModalOpen(true);
                            }}
                            className="p-1 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-700"
                            title="Editar asignatura"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmDeleteSubjectId(s.id);
                            }}
                            className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                            title="Eliminar asignatura"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Quick Footer Stats */}
          <div className="mt-auto border-t border-slate-100 dark:border-slate-800 pt-3 flex items-center justify-between text-[11px] text-slate-400">
            <span>Tasa de entrega: <strong className="text-emerald-600 font-bold">{stats.completionRate}%</strong></span>
            <span>{stats.completedHomework}/{stats.totalHomework} hechas</span>
          </div>
        </aside>

        {/* ========================================================================= */}
        {/* RIGHT MAIN PANEL: Active Subject / View Content & Linear Task List        */}
        {/* ========================================================================= */}
        <section className="flex-1 min-w-0 w-full flex flex-col gap-4">
          {/* Header Card for Active View / Selected Subject */}
          {activeSubject ? (
            (() => {
              const palette = COLOR_PALETTES[activeSubject.color] || COLOR_PALETTES.indigo;
              const subjTasks = homeworkList.filter((h) => h.subjectId === activeSubject.id);
              const totalSubj = subjTasks.length;
              const doneSubj = subjTasks.filter((h) => h.status === 'entregado').length;
              const pendingSubj = totalSubj - doneSubj;
              const progressPct = totalSubj > 0 ? Math.round((doneSubj / totalSubj) * 100) : 0;

              return (
                <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-xs flex flex-col gap-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-11 h-11 rounded-xl ${palette.bg} ${palette.border} border flex items-center justify-center font-extrabold text-sm ${palette.text} shrink-0`}
                      >
                        {activeSubject.code}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                            {activeSubject.name}
                          </h2>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${palette.bg} ${palette.text} ${palette.border}`}
                          >
                            {activeSubject.credits || 6} ECTS
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          {activeSubject.professor && `Prof. ${activeSubject.professor}`}
                          {activeSubject.classroom && ` • Aula: ${activeSubject.classroom}`}
                          {activeSubject.semester && ` • ${activeSubject.semester}`}
                        </p>
                      </div>
                    </div>

                    {/* Quick Subject Actions */}
                    <div className="flex items-center gap-2 self-start sm:self-center">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingHomework(null);
                          setPreselectedSubjectId(activeSubject.id);
                          setIsHomeworkModalOpen(true);
                        }}
                        className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold border transition cursor-pointer active:scale-95 ${palette.bg} ${palette.text} ${palette.border} hover:brightness-95`}
                      >
                        <PlusCircle className="w-3.5 h-3.5" />
                        <span>+ Nueva Entrega</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setEditingSubject(activeSubject);
                          setIsSubjectModalOpen(true);
                        }}
                        className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 transition"
                        title="Editar asignatura"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Progress Bar for this subject */}
                  <div className="flex flex-col gap-1.5 pt-1">
                    <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                      <span>Progreso de entregas: <strong className="text-slate-800 dark:text-slate-200">{doneSubj} de {totalSubj} realizadas</strong></span>
                      <span className="font-semibold font-mono text-indigo-600 dark:text-indigo-400">{progressPct}%</span>
                    </div>
                    <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          progressPct === 100
                            ? 'bg-emerald-500'
                            : progressPct >= 50
                            ? 'bg-indigo-600'
                            : 'bg-amber-500'
                        }`}
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })()
          ) : (
            /* Header for Global Views */
            <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                    {selectedNav === 'urgent'
                      ? '🚨 Entregas Urgentes (Próximos 3 días)'
                      : selectedNav === 'completed'
                      ? '✅ Entregas Completadas'
                      : '📋 Todas las Asignaturas y Entregas'}
                  </h2>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {selectedNav === 'urgent'
                    ? 'Tareas prioritarias que requieren tu atención inmediata'
                    : selectedNav === 'completed'
                    ? 'Historial de trabajos y prácticas ya entregadas'
                    : 'Listado global de todos tus deberes y proyectos universitarios'}
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setEditingHomework(null);
                  setPreselectedSubjectId(undefined);
                  setIsHomeworkModalOpen(true);
                }}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-xs transition cursor-pointer self-start sm:self-center active:scale-95"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>+ Nueva Entrega</span>
              </button>
            </div>
          )}

          {/* Search Bar & Status Filter */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 p-2 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl shadow-xs">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar por título, práctica, descripción..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Status Filter Pills */}
            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl shrink-0">
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  statusFilter === 'all'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs font-bold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Todas
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('pending')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  statusFilter === 'pending'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs font-bold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Pendientes
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('completed')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  statusFilter === 'completed'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs font-bold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Entregadas
              </button>
            </div>
          </div>

          {/* Homework Items (Linear List, NOT disjointed grid blocks) */}
          <div className="flex flex-col gap-2.5">
            {currentViewHomework.length === 0 ? (
              <div className="p-10 text-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl flex flex-col items-center gap-2">
                <CheckCircle2 className="w-10 h-10 text-emerald-500" />
                <h3 className="font-bold text-slate-800 dark:text-slate-200">
                  {statusFilter === 'completed'
                    ? 'No hay entregas completadas en este filtro'
                    : '¡No hay entregas pendientes! Todo está al día'}
                </h3>
                <p className="text-xs text-slate-400 max-w-sm">
                  {activeSubject
                    ? `No tienes tareas pendientes para ${activeSubject.name}. Puedes añadir una nueva cuando el profesor asigne trabajo.`
                    : 'Excelente seguimiento. Todas tus obligaciones académicas están completas.'}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setEditingHomework(null);
                    setPreselectedSubjectId(activeSubject?.id);
                    setIsHomeworkModalOpen(true);
                  }}
                  className="mt-2 px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold text-xs shadow-xs"
                >
                  + Añadir Tarea o Entrega
                </button>
              </div>
            ) : (
              currentViewHomework.map((hw) => {
                const subject = subjects.find((s) => s.id === hw.subjectId);
                const palette = COLOR_PALETTES[subject?.color || 'indigo'] || COLOR_PALETTES.indigo;
                const typeInfo = HOMEWORK_TYPE_LABELS[hw.type] || HOMEWORK_TYPE_LABELS.otro;
                const isDone = hw.status === 'entregado';

                return (
                  <div
                    key={hw.id}
                    className={`p-3.5 sm:p-4 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 ${
                      isDone
                        ? 'bg-slate-100/70 dark:bg-slate-850/40 border-slate-200 dark:border-slate-800 border-l-4 border-l-slate-300 dark:border-l-slate-700 opacity-75'
                        : `${palette.cardBg} ${palette.cardBorder} border-l-4 ${palette.leftBar} ${palette.hoverBg} shadow-xs hover:shadow-sm`
                    }`}
                  >
                    {/* Left: Checkbox & Info */}
                    <div className="flex items-start gap-3 min-w-0">
                      <button
                        type="button"
                        onClick={() => handleToggleHomework(hw.id)}
                        className="mt-1 text-slate-400 hover:text-emerald-500 transition cursor-pointer shrink-0"
                        title={isDone ? 'Marcar como pendiente' : 'Marcar como entregado'}
                      >
                        {isDone ? (
                          <CheckCircle2 className="w-5 h-5 text-emerald-500 fill-emerald-500/20" />
                        ) : (
                          <Circle className="w-5 h-5 text-slate-300 dark:text-slate-600 hover:text-emerald-500" />
                        )}
                      </button>

                      <div className="flex flex-col gap-1 min-w-0">
                        {/* Tags Row */}
                        <div className="flex flex-wrap items-center gap-1.5">
                          {/* Subject Pill (shown if viewing all or global views) */}
                          {(!activeSubject || selectedNav === 'all' || selectedNav === 'urgent' || selectedNav === 'completed') && subject && (
                            <button
                              type="button"
                              onClick={() => setSelectedNav(subject.id)}
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full border transition cursor-pointer ${palette.bg} ${palette.text} ${palette.border} hover:brightness-95`}
                              title={`Filtrar por ${subject.name}`}
                            >
                              {subject.code} &bull; {subject.name}
                            </button>
                          )}

                          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                            {typeInfo.icon} {typeInfo.label}
                          </span>

                          {getUrgencyBadge(hw.dueDate, isDone)}

                          {hw.weightPercentage && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                              {hw.weightPercentage}% nota
                            </span>
                          )}

                          {hw.priority === 'alta' && !isDone && (
                            <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400">
                              Alta Prioridad
                            </span>
                          )}
                        </div>

                        {/* Title */}
                        <h4
                          className={`text-sm sm:text-base font-bold tracking-tight ${
                            isDone
                              ? 'line-through text-slate-400 dark:text-slate-500'
                              : 'text-slate-900 dark:text-white'
                          }`}
                        >
                          {hw.title}
                        </h4>

                        {/* Description */}
                        {hw.description && (
                          <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                            {hw.description}
                          </p>
                        )}

                        {/* Date info */}
                        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          <Calendar className="w-3.5 h-3.5 text-indigo-500" />
                          <span>
                            Límite: <strong className="text-slate-800 dark:text-slate-200">{formatDueDateSpanish(hw.dueDate)}</strong> a las {hw.dueTime || '23:59'}
                          </span>
                          {hw.estimatedHours && (
                            <span className="hidden sm:inline text-slate-400">
                              &bull; ~{hw.estimatedHours}h dedicación
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right: Actions */}
                    <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
                      <button
                        type="button"
                        onClick={() => handleSyncToCalendar(hw)}
                        className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                          hw.calendarTaskId
                            ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                            : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                        }`}
                        title="Añadir esta fecha límite a la Agenda diaria"
                      >
                        <CalendarCheck className="w-3.5 h-3.5 text-indigo-500" />
                        <span>{hw.calendarTaskId ? 'En Agenda' : 'Agendar'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setEditingHomework(hw);
                          setIsHomeworkModalOpen(true);
                        }}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                        title="Editar tarea"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteHomework(hw.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition"
                        title="Eliminar tarea"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>

      {/* MODAL: ADD / EDIT SUBJECT */}
      <AnimatePresence>
        {isSubjectModalOpen && (
          <SubjectFormModal
            isOpen={isSubjectModalOpen}
            subject={editingSubject}
            onClose={() => {
              setIsSubjectModalOpen(false);
              setEditingSubject(null);
            }}
            onSave={handleSaveSubject}
          />
        )}
      </AnimatePresence>

      {/* MODAL: ADD / EDIT HOMEWORK */}
      <AnimatePresence>
        {isHomeworkModalOpen && (
          <HomeworkFormModal
            isOpen={isHomeworkModalOpen}
            homework={editingHomework}
            subjects={subjects}
            preselectedSubjectId={preselectedSubjectId}
            clock={clock}
            onClose={() => {
              setIsHomeworkModalOpen(false);
              setEditingHomework(null);
              setPreselectedSubjectId(undefined);
            }}
            onSave={handleSaveHomework}
          />
        )}
      </AnimatePresence>

      {/* MODAL: CONFIRM DELETE SUBJECT */}
      <AnimatePresence>
        {confirmDeleteSubjectId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 max-w-sm w-full shadow-2xl flex flex-col gap-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                ¿Eliminar esta asignatura?
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Se eliminará la asignatura y todas sus entregas asociadas. Esta acción no se puede deshacer.
              </p>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setConfirmDeleteSubjectId(null)}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteSubject(confirmDeleteSubjectId)}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-rose-600 text-white hover:bg-rose-700 shadow-xs"
                >
                  Sí, eliminar
                </button>
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

// -------------------------------------------------------------
// SUB-MODAL: SUBJECT FORM MODAL
// -------------------------------------------------------------

interface SubjectFormModalProps {
  isOpen: boolean;
  subject: UniversitySubject | null;
  onClose: () => void;
  onSave: (data: Partial<UniversitySubject>) => void;
}

const SubjectFormModal: React.FC<SubjectFormModalProps> = ({
  isOpen,
  subject,
  onClose,
  onSave,
}) => {
  const [name, setName] = useState(subject?.name || '');
  const [code, setCode] = useState(subject?.code || '');
  const [color, setColor] = useState(subject?.color || 'indigo');
  const [professor, setProfessor] = useState(subject?.professor || '');
  const [classroom, setClassroom] = useState(subject?.classroom || '');
  const [credits, setCredits] = useState(subject?.credits ? String(subject.credits) : '6');
  const [semester, setSemester] = useState(subject?.semester || '1º Cuatrimestre');
  const [notes, setNotes] = useState(subject?.notes || '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({
      name: name.trim(),
      code: code.trim().toUpperCase() || name.substring(0, 3).toUpperCase(),
      color,
      professor: professor.trim() || undefined,
      classroom: classroom.trim() || undefined,
      credits: parseInt(credits, 10) || 6,
      semester: semester.trim() || undefined,
      notes: notes.trim() || undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <School className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
              {subject ? 'Editar Asignatura' : 'Añadir Nueva Asignatura'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-5 flex flex-col gap-4 overflow-y-auto">
          {/* Nombre y Siglas */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Nombre de la Asignatura *
              </label>
              <input
                type="text"
                required
                placeholder="ej. Inteligencia Artificial"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Siglas / Código
              </label>
              <input
                type="text"
                maxLength={6}
                placeholder="ej. IA"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-xl text-xs uppercase bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-bold"
              />
            </div>
          </div>

          {/* Color temático */}
          <div>
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Color Temático
            </label>
            <div className="flex flex-wrap gap-2 mt-1.5">
              {Object.keys(COLOR_PALETTES).map((colorKey) => {
                const pal = COLOR_PALETTES[colorKey];
                const isSelected = color === colorKey;
                return (
                  <button
                    key={colorKey}
                    type="button"
                    onClick={() => setColor(colorKey)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                      isSelected
                        ? `${pal.bg} ${pal.text} ${pal.border} ring-2 ring-indigo-500`
                        : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    <span className={`w-2.5 h-2.5 rounded-full ${pal.dot}`} />
                    <span>{pal.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Profesor y Aula */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Profesor / Contacto
              </label>
              <input
                type="text"
                placeholder="ej. Dra. Martínez"
                value={professor}
                onChange={(e) => setProfessor(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Aula / Laboratorio
              </label>
              <input
                type="text"
                placeholder="ej. Lab 2.4 - Módulo C"
                value={classroom}
                onChange={(e) => setClassroom(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Créditos y Cuatrimestre */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Créditos ECTS
              </label>
              <input
                type="number"
                min={1}
                max={30}
                value={credits}
                onChange={(e) => setCredits(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Periodo / Semestre
              </label>
              <input
                type="text"
                placeholder="ej. 1º Cuatrimestre"
                value={semester}
                onChange={(e) => setSemester(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Notas */}
          <div>
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Notas adicionales / Campus Virtual
            </label>
            <textarea
              rows={2}
              placeholder="Notas de evaluación, enlaces o requisitos..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Footer actions */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/20 cursor-pointer active:scale-95"
            >
              {subject ? 'Guardar Cambios' : 'Crear Asignatura'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};

// -------------------------------------------------------------
// SUB-MODAL: HOMEWORK FORM MODAL
// -------------------------------------------------------------

interface HomeworkFormModalProps {
  isOpen: boolean;
  homework: UniversityHomework | null;
  subjects: UniversitySubject[];
  preselectedSubjectId?: string;
  clock: RealTimeClockState;
  onClose: () => void;
  onSave: (data: Partial<UniversityHomework>) => void;
}

const HomeworkFormModal: React.FC<HomeworkFormModalProps> = ({
  isOpen,
  homework,
  subjects,
  preselectedSubjectId,
  clock,
  onClose,
  onSave,
}) => {
  const [title, setTitle] = useState(homework?.title || '');
  const [subjectId, setSubjectId] = useState(
    homework?.subjectId || preselectedSubjectId || subjects[0]?.id || ''
  );
  const [dueDate, setDueDate] = useState(homework?.dueDate || clock.dateStr);
  const [dueTime, setDueTime] = useState(homework?.dueTime || '23:59');
  const [type, setType] = useState<HomeworkType>(homework?.type || 'practica');
  const [priority, setPriority] = useState<HomeworkPriority>(homework?.priority || 'alta');
  const [status, setStatus] = useState<HomeworkStatus>(homework?.status || 'pendiente');
  const [description, setDescription] = useState(homework?.description || '');
  const [weightPercentage, setWeightPercentage] = useState(
    homework?.weightPercentage ? String(homework.weightPercentage) : ''
  );
  const [estimatedHours, setEstimatedHours] = useState(
    homework?.estimatedHours ? String(homework.estimatedHours) : ''
  );
  const [syncToAgenda, setSyncToAgenda] = useState(true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !subjectId) return;

    onSave({
      title: title.trim(),
      subjectId,
      dueDate,
      dueTime,
      type,
      priority,
      status,
      description: description.trim() || undefined,
      weightPercentage: weightPercentage ? parseFloat(weightPercentage) : undefined,
      estimatedHours: estimatedHours ? parseFloat(estimatedHours) : undefined,
      calendarTaskId: syncToAgenda ? 'sync-requested' : undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
      >
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
              {homework ? 'Editar Entrega / Deber' : 'Añadir Entrega o Tarea'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-5 flex flex-col gap-4 overflow-y-auto">
          {/* Título */}
          <div>
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Título de la Entrega o Práctica *
            </label>
            <input
              type="text"
              required
              placeholder="ej. Práctica 3: Implementación de Tablas Hash"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Asignatura y Tipo */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Asignatura *
              </label>
              <select
                required
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
              >
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} - {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Tipo de Trabajo
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as HomeworkType)}
                className="mt-1 w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
              >
                <option value="practica">💻 Práctica</option>
                <option value="ejercicios">📝 Ejercicios / Problemas</option>
                <option value="proyecto">🚀 Proyecto</option>
                <option value="examen">📚 Examen / Parcial</option>
                <option value="lectura">📖 Lectura</option>
                <option value="otro">📌 Otro</option>
              </select>
            </div>
          </div>

          {/* Fecha Límite y Hora */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Fecha Límite de Entrega *
              </label>
              <input
                type="date"
                required
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Hora Límite
              </label>
              <input
                type="time"
                value={dueTime}
                onChange={(e) => setDueTime(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Prioridad y Estado */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Prioridad
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as HomeworkPriority)}
                className="mt-1 w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
              >
                <option value="alta">Alta (Muy importante)</option>
                <option value="media">Media</option>
                <option value="baja">Baja</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Estado Actual
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as HomeworkStatus)}
                className="mt-1 w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
              >
                <option value="pendiente">Pendiente</option>
                <option value="en_progreso">En progreso / Trabajando</option>
                <option value="entregado">Completada / Entregada</option>
              </select>
            </div>
          </div>

          {/* Peso porcentual y horas estimadas */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                % Nota Final (opcional)
              </label>
              <input
                type="number"
                min={0}
                max={100}
                placeholder="ej. 15"
                value={weightPercentage}
                onChange={(e) => setWeightPercentage(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Horas Estimadas (opcional)
              </label>
              <input
                type="number"
                min={0}
                step={0.5}
                placeholder="ej. 4"
                value={estimatedHours}
                onChange={(e) => setEstimatedHours(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Descripción / Instrucciones */}
          <div>
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Instrucciones / Rúbrica / Notas
            </label>
            <textarea
              rows={3}
              placeholder="Detalles sobre requisitos, formato de entrega (.pdf, .zip), enlaces del campus..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Sincronizar en Agenda Checkbox */}
          {!homework && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/80">
              <input
                type="checkbox"
                id="sync-agenda-cb"
                checked={syncToAgenda}
                onChange={(e) => setSyncToAgenda(e.target.checked)}
                className="w-4 h-4 text-indigo-600 rounded-sm focus:ring-indigo-500"
              />
              <label htmlFor="sync-agenda-cb" className="text-xs font-medium text-indigo-900 dark:text-indigo-200 cursor-pointer">
                Sincronizar y añadir automáticamente a mi Agenda diaria
              </label>
            </div>
          )}

          {/* Footer actions */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/20 cursor-pointer active:scale-95"
            >
              {homework ? 'Guardar Cambios' : 'Añadir Entrega'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};
