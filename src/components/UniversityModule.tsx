import React, { useState, useMemo, useEffect, useRef } from 'react';
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
  ExternalLink,
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
  Plus,
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
  getUniversityHomeworkForUser,
  addSubject,
  updateSubject,
  deleteSubject,
  addHomework,
  updateHomework,
  deleteHomework,
  toggleHomeworkStatus,
  syncHomeworkToCalendar,
  saveUniversityHomework,
  saveUniversitySubjects,
  isUniversityExample,
} from '../services/universityService';
import { homeworkFromRow, loadUniversityWorks, saveUniversityWork } from '../services/universityPlannerService';
import { examCountdown } from '../planner/university';
import { RealTimeClockState } from '../hooks/useRealTimeClock';
import { findNextSubjectClass } from '../utils/nextSubjectClass';
import { madridLocal } from '../planner/time';
import { newId } from '../utils/uuid';

interface UniversityModuleProps {
  clock: RealTimeClockState;
  calendarTasks?: TaskItem[];
  userId?: string;
  onScheduleHomeworkInCalendar?: (task: TaskItem) => void;
  showToast?: (message: string) => void;
  onNavigateToMoodle?: () => void;
  selectedHomeworkId?: string | null;
  onHomeworkOpened?: () => void;
}

function ExamCountdownMenu({ exams, subjects, today, onEdit, onToggle, onDelete }: {
  exams: UniversityHomework[];
  subjects: UniversitySubject[];
  today: string;
  onEdit: (exam: UniversityHomework) => void;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const sorted = [...exams].sort((a, b) =>
    `${a.dueDate}T${a.dueTime}`.localeCompare(`${b.dueDate}T${b.dueTime}`) || a.id.localeCompare(b.id));
  const next = sorted.find(exam => exam.status !== 'entregado' && exam.dueDate >= today);
  if (!sorted.length) return null;
  const countdown = next ? examCountdown([next], next.subjectId, today)?.split(' · ')[0] : null;

  return (
    <details className="relative self-end text-xs text-slate-500">
      <summary className="cursor-pointer list-none rounded-lg px-2 py-1 hover:bg-slate-100 flex items-center gap-1.5" aria-label="Ver exámenes">
        <CalendarDays className="w-3.5 h-3.5" />
        <span>{countdown || 'Exámenes'}{subjects.length > 1 && next ? ` · ${subjects.find(s => s.id === next.subjectId)?.code || ''}` : ''}</span>
      </summary>
      <div className="absolute right-0 top-full z-20 mt-1 w-72 max-w-[80vw] max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg p-2">
        {sorted.map(exam => (
          <div key={exam.id} className="flex items-center gap-2 p-2">
            <button type="button" onClick={() => onEdit(exam)} className="min-w-0 flex-1 text-left hover:text-indigo-600" title="Editar examen">
              <span className="block truncate font-medium">{exam.title}</span>
              <span className="block text-[10px]">{subjects.find(s => s.id === exam.subjectId)?.code} · {exam.dueDate.split('-').reverse().join('/')} · {exam.dueTime}</span>
            </button>
            <button type="button" onClick={() => onToggle(exam.id)} title={exam.status === 'entregado' ? 'Marcar examen pendiente' : 'Marcar examen realizado'} className="p-1 hover:text-emerald-600">
              {exam.status === 'entregado' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5" />}
            </button>
            <button type="button" onClick={() => onDelete(exam.id)} title="Eliminar examen" className="p-1 hover:text-rose-600"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
        ))}
      </div>
    </details>
  );
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
    bg: 'bg-indigo-50',
    text: 'text-indigo-700',
    border: 'border-indigo-200',
    dot: 'bg-indigo-500',
    label: 'Índigo',
    cardBg: 'bg-indigo-50/70',
    cardBorder: 'border-indigo-200/90',
    leftBar: 'border-l-indigo-500',
    hoverBg: 'hover:bg-indigo-100/60',
  },
  blue: {
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200',
    dot: 'bg-blue-500',
    label: 'Azul',
    cardBg: 'bg-blue-50/70',
    cardBorder: 'border-blue-200/90',
    leftBar: 'border-l-blue-500',
    hoverBg: 'hover:bg-blue-100/60',
  },
  purple: {
    bg: 'bg-purple-50',
    text: 'text-purple-700',
    border: 'border-purple-200',
    dot: 'bg-purple-500',
    label: 'Púrpura',
    cardBg: 'bg-purple-50/70',
    cardBorder: 'border-purple-200/90',
    leftBar: 'border-l-purple-500',
    hoverBg: 'hover:bg-purple-100/60',
  },
  emerald: {
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200',
    dot: 'bg-emerald-500',
    label: 'Esmeralda',
    cardBg: 'bg-emerald-50/70',
    cardBorder: 'border-emerald-200/90',
    leftBar: 'border-l-emerald-500',
    hoverBg: 'hover:bg-emerald-100/60',
  },
  amber: {
    bg: 'bg-amber-50',
    text: 'text-amber-800',
    border: 'border-amber-200',
    dot: 'bg-amber-500',
    label: 'Ámbar',
    cardBg: 'bg-amber-50/70',
    cardBorder: 'border-amber-200/90',
    leftBar: 'border-l-amber-500',
    hoverBg: 'hover:bg-amber-100/60',
  },
  rose: {
    bg: 'bg-rose-50',
    text: 'text-rose-700',
    border: 'border-rose-200',
    dot: 'bg-rose-500',
    label: 'Rosa / Coral',
    cardBg: 'bg-rose-50/70',
    cardBorder: 'border-rose-200/90',
    leftBar: 'border-l-rose-500',
    hoverBg: 'hover:bg-rose-100/60',
  },
  cyan: {
    bg: 'bg-cyan-50',
    text: 'text-cyan-700',
    border: 'border-cyan-200',
    dot: 'bg-cyan-500',
    label: 'Cian',
    cardBg: 'bg-cyan-50/70',
    cardBorder: 'border-cyan-200/90',
    leftBar: 'border-l-cyan-500',
    hoverBg: 'hover:bg-cyan-100/60',
  },
};

const HOMEWORK_TYPE_LABELS: Record<HomeworkType, { label: string; icon: string }> = {
  practica: { label: 'Práctica', icon: '' },
  ejercicios: { label: 'Ejercicios', icon: '' },
  proyecto: { label: 'Proyecto', icon: '' },
  examen: { label: 'Examen', icon: '' },
  lectura: { label: 'Lectura', icon: '' },
  otro: { label: 'Otro', icon: '' },
};

export const UniversityModule: React.FC<UniversityModuleProps> = ({
  clock,
  calendarTasks = [],
  userId,
  onScheduleHomeworkInCalendar,
  showToast = (_msg: string) => {},
  onNavigateToMoodle,
  selectedHomeworkId,
  onHomeworkOpened,
}) => {
  const [subjects, setSubjects] = useState<UniversitySubject[]>(() => getUniversitySubjects());
  const [homeworkList, setHomeworkList] = useState<UniversityHomework[]>(() => getUniversityHomeworkForUser(userId));
  const [universityError, setUniversityError] = useState('');
  const [universityNotice, setUniversityNotice] = useState('');
  const [worksLoaded, setWorksLoaded] = useState(false);
  const [savingWork, setSavingWork] = useState(false);
  const [newHomeworkType, setNewHomeworkType] = useState<HomeworkType>('practica');
  const openedSelection = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setHomeworkList(getUniversityHomeworkForUser(userId));
    setWorksLoaded(false); setUniversityError(''); setUniversityNotice('');
    if (!userId) return;
    void (async () => {
      const existing = await loadUniversityWorks();
      const importOwnerKey = 'calendarasist_uni_import_owner';
      const importOwner = localStorage.getItem(importOwnerKey);
      const legacy = getUniversityHomework();
      const localSubjects = getUniversitySubjects();
      if (!importOwner || importOwner === userId) {
        for (const hw of legacy.filter(h => !h.plannerUid && !isUniversityExample(h))) {
          const subject = localSubjects.find(s => s.id === hw.subjectId);
          if (!subject) continue; // Se conserva en la UI con aviso para asignarle materia.
          const id = `${userId}:${hw.id}`;
          if (!existing.some(r => r.id === id)) await saveUniversityWork({ ...hw, id }, subject);
        }
        localStorage.setItem(importOwnerKey, userId);
      }
      const rows = await loadUniversityWorks();
      if (cancelled) return;
      const works = rows.filter(r => r.activo).map(homeworkFromRow);
      const orphaned = (!importOwner || importOwner === userId) ? legacy.filter(h => !h.plannerUid && (isUniversityExample(h) || !localSubjects.some(s => s.id === h.subjectId))) : [];
      const merged = [...localSubjects, ...rows.map(r => r.asignatura).filter(s => !localSubjects.some(local => local.id === s.id))];
      const uniqueSubjects = [...new Map(merged.map(s => [s.id, s])).values()];
      setSubjects(uniqueSubjects); saveUniversitySubjects(uniqueSubjects);
      setHomeworkList([...works, ...orphaned]); saveUniversityHomework([...works, ...orphaned]);
      setWorksLoaded(true);
      if (orphaned.length) setUniversityNotice(`${orphaned.length} registros anteriores de ejemplo o sin asignatura no están en el plan. Edita y guarda los que quieras utilizar.`);
    })().catch(e => { if (!cancelled) setUniversityError(e instanceof Error ? e.message : String(e)); });
    return () => { cancelled = true; };
  }, [userId]);

  useEffect(() => {
    if (!selectedHomeworkId || (userId && !worksLoaded) || openedSelection.current === selectedHomeworkId) return;
    const selected = homeworkList.find(h => h.id === selectedHomeworkId);
    if (selected) {
      openedSelection.current = selectedHomeworkId;
      setSelectedNav(selected.subjectId); setEditingHomework(selected); setIsHomeworkModalOpen(true);
      onHomeworkOpened?.();
    } else if (worksLoaded) {
      setUniversityError('El deber o examen solicitado ya no está disponible.');
      onHomeworkOpened?.();
    }
  }, [selectedHomeworkId, homeworkList, worksLoaded, userId, onHomeworkOpened]);

  // Selected navigation: either a subject ID, or a special view: 'all' | 'urgent' | 'completed'
  const [selectedNav, setSelectedNav] = useState<string>('all');
  const [vista, setVista] = useState<'pendientes' | 'hechas' | 'asignaturas'>('pendientes');
  const [abierto, setAbierto] = useState<string | null>(null);
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

  const deliveries = useMemo(() => homeworkList.filter(h => h.type !== 'examen'), [homeworkList]);
  const exams = useMemo(() => homeworkList.filter(h => h.type === 'examen'), [homeworkList]);

  // Statistics for deliveries only; exams keep their study allocation in the planner.
  const stats = useMemo(() => {
    const totalSubjects = subjects.length;
    const totalHomework = deliveries.length;
    const pendingHomework = deliveries.filter((h) => h.status !== 'entregado').length;
    const completedHomework = deliveries.filter((h) => h.status === 'entregado').length;
    const completionRate = totalHomework > 0 ? Math.round((completedHomework / totalHomework) * 100) : 0;

    const urgentCount = deliveries.filter((h) => {
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
  }, [subjects, deliveries, clock.dateStr]);

  // Filtered homework list for the current active view
  const currentViewHomework = useMemo(() => {
    let list = [...deliveries];

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
  }, [deliveries, selectedNav, statusFilter, searchQuery, subjects, clock.dateStr]);

  // Handlers
  const handleToggleHomework = async (hwId: string) => {
    const hw = homeworkList.find(h => h.id === hwId);
    if (!hw) return;
    try {
      if (userId) await saveUniversityWork({ ...hw, status: hw.status === 'entregado' ? 'pendiente' : 'entregado' }, subjects.find(s => s.id === hw.subjectId)!);
    } catch (e) { setUniversityError(e instanceof Error ? e.message : String(e)); return; }
    const updated = toggleHomeworkStatus(hwId);
    if (updated) {
      setHomeworkList((prev) => prev.map((h) => (h.id === hwId ? updated : h)));
      showToast(
        updated.status === 'entregado'
          ? 'Entrega marcada como hecha'
          : 'Entrega marcada como pendiente.'
      );
    }
  };

  const handleDeleteHomework = async (hwId: string) => {
    const hw = homeworkList.find(h => h.id === hwId);
    if (!hw) return;
    try {
      if (userId && hw.plannerUid) await saveUniversityWork(hw, subjects.find(s => s.id === hw.subjectId)!, true);
    } catch (e) { setUniversityError(e instanceof Error ? e.message : String(e)); return; }
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

  const handleDeleteSubject = async (subjectId: string) => {
    try {
      if (userId) for (const hw of homeworkList.filter(h => h.subjectId === subjectId && h.plannerUid))
        await saveUniversityWork(hw, subjects.find(s => s.id === subjectId)!, true);
    } catch (e) { setUniversityError(e instanceof Error ? e.message : String(e)); return; }
    deleteSubject(subjectId);
    setSubjects((prev) => prev.filter((s) => s.id !== subjectId));
    setHomeworkList((prev) => prev.filter((h) => h.subjectId !== subjectId));
    if (selectedNav === subjectId) {
      setSelectedNav('all');
    }
    setConfirmDeleteSubjectId(null);
    showToast('Asignatura eliminada.');
  };

  const handleSaveHomework = async (hwData: Partial<UniversityHomework>) => {
    setSavingWork(true); setUniversityError('');
    try {
    const draft: UniversityHomework = { ...(editingHomework || { id: newId(), createdAt: new Date().toISOString() }),
      subjectId: hwData.subjectId || activeSubject?.id || subjects[0]?.id || '',
      title: hwData.title || 'Nuevo deber', dueDate: hwData.dueDate || clock.dateStr,
      dueTime: hwData.dueTime || '23:59', type: hwData.type || 'practica', priority: hwData.priority || 'alta',
      status: hwData.status || 'pendiente', description: hwData.description,
      weightPercentage: hwData.weightPercentage, estimatedHours: hwData.estimatedHours ?? 2 };
    if (userId) {
      await saveUniversityWork(draft, subjects.find(s => s.id === draft.subjectId)!);
      draft.plannerUid = `uni:${draft.id}`;
      const updated = editingHomework ? homeworkList.map(h => h.id === draft.id ? draft : h) : [draft, ...homeworkList];
      setHomeworkList(updated); saveUniversityHomework(updated);
      showToast(draft.type === 'examen' ? 'Examen guardado; estudio incluido en el planificador.' : 'Deber guardado e incluido en el planificador.');
      setIsHomeworkModalOpen(false); setEditingHomework(null);
      setNewHomeworkType('practica');
      return;
    }
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
    setNewHomeworkType('practica');
    } catch (e) { setUniversityError(e instanceof Error ? e.message : String(e)); }
    finally { setSavingWork(false); }
  };

  const getUrgencyBadge = (dueDateStr: string, isCompleted: boolean) => {
    if (isCompleted) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
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
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200 animate-pulse">
          <AlertCircle className="w-3 h-3 text-rose-600" />
          Atrasada ({Math.abs(diffDays)}d)
        </span>
      );
    }
    if (diffDays === 0) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200 animate-pulse">
          <Clock className="w-3 h-3 text-rose-600" />
          ¡Vence Hoy!
        </span>
      );
    }
    if (diffDays === 1) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200">
          <Clock className="w-3 h-3 text-amber-600" />
          Mañana
        </span>
      );
    }
    if (diffDays <= 3) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
          En {diffDays} días
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
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

  const DIAS_CORTOS = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'];
  const fechaUTC = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, (m || 1) - 1, d || 1)); };
  const diasHasta = (s: string) => Math.round((fechaUTC(s).getTime() - fechaUTC(clock.dateStr).getTime()) / 86400000);
  const hoyUTC = fechaUTC(clock.dateStr);
  const finSemana = 6 - ((hoyUTC.getUTCDay() + 6) % 7);
  const plazo = (hw: UniversityHomework) => {
    if (hw.status === 'entregado') return { text: hw.type === 'examen' ? 'Hecho' : 'Entregada', tone: 'muted' as const };
    const d = diasHasta(hw.dueDate);
    if (d < 0) return { text: 'Atrasada', tone: 'alerta' as const };
    if (d === 0) return { text: 'Hoy', tone: 'accent' as const };
    if (d === 1) return { text: 'Mañana', tone: 'accent' as const };
    if (d === 2) return { text: '2 días', tone: 'accent' as const };
    return { text: `${d} días`, tone: 'muted' as const };
  };
  const enFiltro = (h: UniversityHomework) => selectedNav === 'all' || selectedNav === 'urgent' || selectedNav === 'completed' || h.subjectId === selectedNav;
  const pendientesUni = deliveries.filter((h) => h.status !== 'entregado');
  const estaSemanaCount = pendientesUni.filter((h) => { const d = diasHasta(h.dueDate); return d >= 0 && d <= finSemana; }).length;
  const ordenar = (a: UniversityHomework, b: UniversityHomework) => `${a.dueDate}T${a.dueTime}`.localeCompare(`${b.dueDate}T${b.dueTime}`);
  // Search by title, description or subject (as before the redesign)
  const coincide = (h: UniversityHomework) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    const s = subjects.find((x) => x.id === h.subjectId);
    return [h.title, h.description || '', s?.name || '', s?.code || ''].some((v) => v.toLowerCase().includes(q));
  };
  // Done exams are listed with the done deliveries
  const listaVista = (vista === 'hechas' ? homeworkList : deliveries)
    .filter(enFiltro)
    .filter(coincide)
    .filter((h) => (vista === 'hechas' ? h.status === 'entregado' : h.status !== 'entregado'))
    .sort((a, b) => (vista === 'hechas' ? ordenar(b, a) : ordenar(a, b)));
  const grupos: Array<{ titulo: string; items: UniversityHomework[] }> = vista === 'hechas'
    ? [{ titulo: 'Entregadas', items: listaVista }]
    : [
        { titulo: 'Atrasadas', items: listaVista.filter((h) => diasHasta(h.dueDate) < 0) },
        { titulo: 'Esta semana', items: listaVista.filter((h) => { const d = diasHasta(h.dueDate); return d >= 0 && d <= finSemana; }) },
        { titulo: 'Próxima semana', items: listaVista.filter((h) => { const d = diasHasta(h.dueDate); return d > finSemana && d <= finSemana + 7; }) },
        { titulo: 'Más adelante', items: listaVista.filter((h) => diasHasta(h.dueDate) > finSemana + 7) },
      ];
  // Pending exams, overdue ones included so they never disappear
  const examenesProximos = exams
    .filter(enFiltro)
    .filter(coincide)
    .filter((e) => e.status !== 'entregado')
    .sort(ordenar);
  const nuevoDeber = (tipo: HomeworkType = 'practica') => {
    setEditingHomework(null);
    setNewHomeworkType(tipo);
    setPreselectedSubjectId(selectedNav !== 'all' && selectedNav !== 'urgent' && selectedNav !== 'completed' ? selectedNav : undefined);
    setIsHomeworkModalOpen(true);
  };

  const fila = (hw: UniversityHomework) => {
    const subject = subjects.find((s) => s.id === hw.subjectId);
    const typeInfo = HOMEWORK_TYPE_LABELS[hw.type] || HOMEWORK_TYPE_LABELS.otro;
    const isDone = hw.status === 'entregado';
    const p = plazo(hw);
    const fecha = fechaUTC(hw.dueDate);
    const meta = [
      subject?.name,
      typeInfo.label.toLowerCase(),
      hw.dueTime || '23:59',
      hw.weightPercentage ? `${hw.weightPercentage} % de la nota` : null,
      hw.priority === 'alta' && !isDone ? 'prioridad alta' : null,
    ].filter(Boolean).join(' · ');
    const abiertoFila = abierto === hw.id;
    return (
      <div key={hw.id} className="py-3 border-b border-hairline flex flex-col gap-2">
        <div className="grid grid-cols-[44px_minmax(0,1fr)_auto] gap-3 items-center">
          <span className="flex flex-col items-center gap-px">
            <span className="text-[11.5px] font-semibold tracking-[0.04em] text-ink-2">{DIAS_CORTOS[fecha.getUTCDay()]}</span>
            <span className="text-[19px] font-semibold leading-[1.1]">{fecha.getUTCDate()}</span>
          </span>
          <button
            type="button"
            onClick={() => setAbierto(abiertoFila ? null : hw.id)}
            aria-expanded={abiertoFila}
            className="min-w-0 text-left flex flex-col gap-[3px] cursor-pointer"
          >
            <span className={`text-base leading-[1.3] font-medium ${isDone ? 'text-ink-3 line-through' : 'text-ink'}`}>{hw.title}</span>
            <span className="text-[13.5px] leading-[1.35] text-ink-2">{meta}</span>
          </button>
          <span className="flex items-center gap-1">
            <span
              className={`px-2.5 py-1 rounded-full text-[13px] whitespace-nowrap ${
                p.tone === 'accent' ? 'bg-accent text-ink font-semibold' : p.tone === 'alerta' ? 'bg-red-50 text-red-800 font-semibold' : 'text-ink-2 font-medium'
              }`}
            >
              {p.text}
            </span>
            <button
              type="button"
              onClick={() => handleToggleHomework(hw.id)}
              aria-pressed={isDone}
              aria-label={`${isDone ? 'Marcar como pendiente' : 'Marcar como entregada'}: ${hw.title}`}
              className="w-11 h-11 -mr-2 flex items-center justify-center cursor-pointer"
            >
              <span className={`w-[26px] h-[26px] rounded-full border-[1.5px] flex items-center justify-center text-white ${isDone ? 'bg-ink border-ink' : 'bg-white border-check'}`}>
                {isDone && <Check className="w-3.5 h-3.5" strokeWidth={2} />}
              </span>
            </button>
          </span>
        </div>
        {abiertoFila && (
          <div className="ml-14 flex flex-col gap-2">
            {hw.description && <p className="text-[14px] leading-[1.5] text-slate-700 whitespace-pre-wrap">{hw.description}</p>}
            <div className="flex flex-wrap gap-1 -ml-3">
              <button type="button" onClick={() => { setEditingHomework(hw); setIsHomeworkModalOpen(true); }} className="h-11 px-3 rounded-full text-sm font-semibold flex items-center gap-2 hover:bg-black/5">
                <Edit2 className="w-4 h-4" strokeWidth={1.75} /> Editar
              </button>
              <button type="button" onClick={() => handleSyncToCalendar(hw)} className="h-11 px-3 rounded-full text-sm font-semibold flex items-center gap-2 hover:bg-black/5">
                <CalendarCheck className="w-4 h-4" strokeWidth={1.75} /> {hw.calendarTaskId ? 'En la agenda' : 'Llevar a la agenda'}
              </button>
              <button type="button" onClick={() => handleDeleteHomework(hw.id)} className="h-11 px-3 rounded-full text-sm font-semibold text-ink-2 flex items-center gap-2 hover:bg-black/5">
                <Trash2 className="w-4 h-4" strokeWidth={1.75} /> Eliminar
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="w-full max-w-2xl mx-auto px-5 flex flex-col gap-[22px]">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1 min-w-0">
          <span className="text-sm font-medium text-ink-2">
            {pendientesUni.length} {pendientesUni.length === 1 ? 'pendiente' : 'pendientes'} · {estaSemanaCount} esta semana
            {stats.totalHomework > 0 && ` · ${stats.completionRate} % entregadas`}
          </span>
          <h1 className="text-[34px] leading-[1.05] font-semibold tracking-[-0.025em]">Universidad</h1>
        </div>
        <button
          type="button"
          onClick={() => {
            if (vista === 'asignaturas') { setEditingSubject(null); setIsSubjectModalOpen(true); }
            else nuevoDeber();
          }}
          aria-label={vista === 'asignaturas' ? 'Nueva asignatura' : 'Añadir entrega o deber'}
          className="flex-none w-11 h-11 rounded-full bg-surface-2 flex items-center justify-center active:scale-95 transition"
        >
          <Plus className="w-5 h-5" strokeWidth={1.75} />
        </button>
      </header>

      {universityError && !isHomeworkModalOpen && <p role="alert" className="rounded-2xl bg-red-50 text-red-800 px-4 py-3 text-[14.5px]">{universityError}</p>}
      {universityNotice && <p role="status" className="rounded-2xl bg-surface px-4 py-3 text-[14.5px]">{universityNotice}</p>}

      <nav aria-label="Vistas de la universidad" className="grid grid-cols-3 gap-0.5 p-[3px] rounded-[15px] bg-surface-2">
        {([['pendientes', 'Pendientes'], ['hechas', 'Hechas'], ['asignaturas', 'Asignaturas']] as const).map(([valor, etiqueta]) => (
          <button
            key={valor}
            type="button"
            aria-pressed={vista === valor}
            onClick={() => setVista(valor)}
            className={`h-11 rounded-xl text-[14.5px] transition ${vista === valor ? 'bg-white font-semibold shadow-[0_1px_2px_rgba(20,21,23,0.08)]' : 'text-ink-2 font-medium'}`}
          >
            {etiqueta}
          </button>
        ))}
      </nav>

      {vista !== 'asignaturas' && subjects.length > 0 && (
        <div role="group" aria-label="Asignatura" className="flex items-center gap-2 overflow-x-auto no-scrollbar -mx-5 px-5">
          {[{ id: 'all', code: 'Todas' }, ...subjects].map((s) => {
            const on = s.id === 'all' ? ['all', 'urgent', 'completed'].includes(selectedNav) : selectedNav === s.id;
            return (
              <button
                key={s.id}
                type="button"
                aria-pressed={on}
                title={'name' in s ? s.name : undefined}
                onClick={() => setSelectedNav(s.id)}
                className={`flex-none h-10 px-4 rounded-full text-sm font-semibold border transition ${on ? 'bg-ink border-ink text-white' : 'bg-white border-line-2 text-ink'}`}
              >
                {s.code}
              </button>
            );
          })}
        </div>
      )}

      {vista !== 'asignaturas' && (
        <label className="flex items-center gap-2.5 h-11 px-4 rounded-full bg-surface-2">
          <Search className="w-4 h-4 text-ink-2 flex-none" strokeWidth={1.75} />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por título, descripción o asignatura"
            aria-label="Buscar deberes"
            className="flex-1 min-w-0 bg-transparent outline-none text-[15px] text-ink placeholder:text-ink-3"
          />
          {searchQuery && (
            <button type="button" onClick={() => setSearchQuery('')} aria-label="Borrar búsqueda" className="flex-none -mr-2 w-9 h-9 rounded-full flex items-center justify-center hover:bg-black/5">
              <X className="w-4 h-4" strokeWidth={1.75} />
            </button>
          )}
        </label>
      )}

      {vista === 'asignaturas' ? (
        <section aria-label="Asignaturas" className="flex flex-col border-t border-hairline">
          {subjects.length === 0 && <p className="py-8 text-center text-[15px] text-ink-2">Aún no hay asignaturas.</p>}
          {subjects.map((s) => {
            const pendientes = deliveries.filter((h) => h.subjectId === s.id && h.status !== 'entregado').length;
            const totalAsig = deliveries.filter((h) => h.subjectId === s.id).length;
            const progreso = totalAsig ? Math.round(((totalAsig - pendientes) / totalAsig) * 100) : 0;
            const examen = examCountdown(exams, s.id, clock.dateStr)?.split(' · ')[0];
            return (
              <div key={s.id} className="min-h-16 py-2.5 border-b border-hairline flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => { setSelectedNav(s.id); setVista('pendientes'); }}
                  className="flex-1 min-w-0 text-left flex flex-col gap-[3px] cursor-pointer"
                >
                  <span className="text-base font-medium">{s.name}</span>
                  <span className="text-[13px] text-ink-2">
                    <span className="font-mono">{s.code}</span>
                    {s.professor ? ` · ${s.professor}` : ''}
                    {examen ? ` · ${examen}` : ''}
                  </span>
                  {totalAsig > 0 && (
                    <span className="flex items-center gap-2 pt-1">
                      <span aria-hidden="true" className="flex-1 max-w-40 h-1 rounded-full bg-track-2 overflow-hidden">
                        <span className="block h-1 rounded-full bg-ink" style={{ width: `${progreso}%` }} />
                      </span>
                      <span className="text-[12px] font-mono text-ink-2">{totalAsig - pendientes}/{totalAsig} · {progreso}%</span>
                    </span>
                  )}
                </button>
                <span className="text-[13.5px] text-slate-700 whitespace-nowrap">{pendientes ? `${pendientes} ${pendientes === 1 ? 'pendiente' : 'pendientes'}` : 'Al día'}</span>
                <button type="button" onClick={() => { setEditingSubject(s); setIsSubjectModalOpen(true); }} aria-label={`Editar ${s.name}`} className="flex-none w-11 h-11 rounded-full flex items-center justify-center hover:bg-black/5">
                  <Edit2 className="w-[18px] h-[18px]" strokeWidth={1.75} />
                </button>
                <button type="button" onClick={() => setConfirmDeleteSubjectId(s.id)} aria-label={`Eliminar ${s.name}`} className="flex-none w-11 h-11 -mr-2 rounded-full flex items-center justify-center text-ink-2 hover:bg-black/5">
                  <Trash2 className="w-[18px] h-[18px]" strokeWidth={1.75} />
                </button>
              </div>
            );
          })}
          <div className="pt-2 flex flex-wrap gap-1 -ml-3">
            <button type="button" onClick={() => { setEditingSubject(null); setIsSubjectModalOpen(true); }} className="h-11 px-3 rounded-full text-sm font-semibold flex items-center gap-2 hover:bg-black/5">
              <Plus className="w-4 h-4" strokeWidth={1.75} /> Nueva asignatura
            </button>
            <button type="button" onClick={() => nuevoDeber('examen')} className="h-11 px-3 rounded-full text-sm font-semibold flex items-center gap-2 hover:bg-black/5">
              <CalendarDays className="w-4 h-4" strokeWidth={1.75} /> Añadir examen
            </button>
            {onNavigateToMoodle && (
              <button type="button" onClick={onNavigateToMoodle} className="h-11 px-3 rounded-full text-sm font-semibold flex items-center gap-2 hover:bg-black/5">
                <ExternalLink className="w-4 h-4" strokeWidth={1.75} /> Ver entregas de Moodle
              </button>
            )}
          </div>
        </section>
      ) : (
        <div className="flex flex-col gap-6">
          {vista === 'pendientes' && examenesProximos.length > 0 && (
            <section aria-label="Exámenes" className="flex flex-col">
              <h2 className="text-[13px] font-semibold text-ink-2 mb-0.5">Exámenes</h2>
              <div className="flex flex-col border-t border-hairline">{examenesProximos.map(fila)}</div>
            </section>
          )}
          {grupos.filter((g) => g.items.length).map((g) => (
            <section key={g.titulo} aria-label={g.titulo} className="flex flex-col">
              <h2 className="text-[13px] font-semibold text-ink-2 mb-0.5">{g.titulo}</h2>
              <div className="flex flex-col border-t border-hairline">{g.items.map(fila)}</div>
            </section>
          ))}
          {listaVista.length === 0 && (vista === 'hechas' || examenesProximos.length === 0) && (
            <div className="py-12 flex flex-col items-center gap-3 text-center">
              <CheckCircle2 className="w-7 h-7 text-ink-2" strokeWidth={1.5} />
              <p className="text-[15px] font-medium">{vista === 'hechas' ? 'Aún no has entregado nada aquí' : 'Todo al día'}</p>
              {vista === 'pendientes' && (
                <button type="button" onClick={() => nuevoDeber()} className="h-11 px-4 rounded-full border border-line-2 bg-white text-sm font-semibold">
                  Añadir un deber
                </button>
              )}
            </div>
          )}
        </div>
      )}

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
            calendarTasks={calendarTasks}
            onClose={() => {
              setIsHomeworkModalOpen(false);
              setEditingHomework(null);
              setNewHomeworkType('practica');
              setPreselectedSubjectId(undefined);
            }}
            onSave={handleSaveHomework}
            defaultType={newHomeworkType}
            saving={savingWork}
            error={universityError}
          />
        )}
      </AnimatePresence>

      {/* MODAL: CONFIRM DELETE SUBJECT */}
      <AnimatePresence>
        {confirmDeleteSubjectId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 ">
            <div className="bg-white border border-slate-200 rounded-2xl p-5 max-w-sm w-full shadow-2xl flex flex-col gap-3">
              <h3 className="text-base font-bold text-slate-900">
                ¿Eliminar esta asignatura?
              </h3>
              <p className="text-xs text-slate-500">
                Se eliminará la asignatura y todas sus entregas asociadas. Esta acción no se puede deshacer.
              </p>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setConfirmDeleteSubjectId(null)}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteSubject(confirmDeleteSubjectId)}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-ink text-white hover:bg-ink shadow-xs"
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-ink/40 ">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-lg bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <School className="w-5 h-5 text-indigo-600" />
            <h2 className="text-base sm:text-lg font-bold text-slate-900">
              {subject ? 'Editar Asignatura' : 'Añadir Nueva Asignatura'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-5 flex flex-col gap-4 overflow-y-auto">
          {/* Nombre y Siglas */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold text-slate-700">
                Nombre de la Asignatura *
              </label>
              <input
                type="text"
                required
                placeholder="ej. Inteligencia Artificial"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-xl text-xs bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700">
                Siglas / Código
              </label>
              <input
                type="text"
                maxLength={6}
                placeholder="ej. IA"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-xl text-xs uppercase bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-bold"
              />
            </div>
          </div>

          {/* Color temático */}
          <div>
            <label className="text-xs font-semibold text-slate-700">
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
                        : 'bg-slate-50 border-slate-200 text-slate-600'
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
              <label className="text-xs font-semibold text-slate-700">
                Profesor / Contacto
              </label>
              <input
                type="text"
                placeholder="ej. Dra. Martínez"
                value={professor}
                onChange={(e) => setProfessor(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-xl text-xs bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700">
                Aula / Laboratorio
              </label>
              <input
                type="text"
                placeholder="ej. Lab 2.4 - Módulo C"
                value={classroom}
                onChange={(e) => setClassroom(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-xl text-xs bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Créditos y Cuatrimestre */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-700">
                Créditos ECTS
              </label>
              <input
                type="number"
                min={1}
                max={30}
                value={credits}
                onChange={(e) => setCredits(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-xl text-xs bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700">
                Periodo / Semestre
              </label>
              <input
                type="text"
                placeholder="ej. 1º Cuatrimestre"
                value={semester}
                onChange={(e) => setSemester(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-xl text-xs bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Notas */}
          <div>
            <label className="text-xs font-semibold text-slate-700">
              Notas adicionales / Campus Virtual
            </label>
            <textarea
              rows={2}
              placeholder="Notas de evaluación, enlaces o requisitos..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-xl text-xs bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Footer actions */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-md cursor-pointer active:scale-95"
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
  onSave: (data: Partial<UniversityHomework>) => void | Promise<void>;
  defaultType?: HomeworkType;
  saving?: boolean;
  error?: string;
  calendarTasks: TaskItem[];
}

const HomeworkFormModal: React.FC<HomeworkFormModalProps> = ({
  isOpen,
  homework,
  subjects,
  preselectedSubjectId,
  clock,
  calendarTasks,
  onClose,
  onSave,
  defaultType = 'practica', saving = false, error = '',
}) => {
  const [title, setTitle] = useState(homework?.title || '');
  const [subjectId, setSubjectId] = useState(
    homework?.subjectId || preselectedSubjectId || subjects[0]?.id || ''
  );
  const [dueDate, setDueDate] = useState(homework?.dueDate || clock.dateStr);
  const [dueTime, setDueTime] = useState(homework?.dueTime || '23:59');
  const [type, setType] = useState<HomeworkType>(homework?.type || defaultType);
  const [useNextClassDeadline, setUseNextClassDeadline] = useState(false);
  const todayMadrid = madridLocal(clock.currentDate).slice(0, 10);
  const nextClass = useMemo(() => findNextSubjectClass(calendarTasks, subjects.find(s => s.id === subjectId), todayMadrid),
    [calendarTasks, subjects, subjectId, todayMadrid]);
  useEffect(() => {
    if (useNextClassDeadline && nextClass) { setDueDate(nextClass.date); setDueTime(nextClass.time.slice(0,5)); }
  }, [useNextClassDeadline, nextClass]);
  const [priority, setPriority] = useState<HomeworkPriority>(homework?.priority || 'alta');
  const [status, setStatus] = useState<HomeworkStatus>(homework?.status || 'pendiente');
  const [description, setDescription] = useState(homework?.description || '');
  const [weightPercentage, setWeightPercentage] = useState(
    homework?.weightPercentage ? String(homework.weightPercentage) : ''
  );
  const [estimatedHours, setEstimatedHours] = useState(
    homework?.estimatedHours ? String(homework.estimatedHours) : ''
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !subjectId) return;
    if (useNextClassDeadline && !nextClass) return;

    onSave({
      title: title.trim(),
      subjectId,
      dueDate: useNextClassDeadline ? nextClass!.date : dueDate,
      dueTime: useNextClassDeadline ? nextClass!.time.slice(0,5) : dueTime,
      type,
      priority,
      status,
      description: description.trim() || undefined,
      weightPercentage: weightPercentage ? parseFloat(weightPercentage) : undefined,
      estimatedHours: estimatedHours ? parseFloat(estimatedHours) : undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-ink/40 ">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-lg bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
      >
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-indigo-600" />
            <h2 className="text-base sm:text-lg font-bold text-slate-900">
              {homework ? 'Editar deber o examen' : type === 'examen' ? 'Añadir examen' : 'Añadir deber'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-5 flex flex-col gap-4 overflow-y-auto">
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          {/* Título */}
          <div>
            <label className="text-xs font-semibold text-slate-700">
              {type === 'examen' ? 'Título del examen *' : 'Título del deber *'}
            </label>
            <input
              type="text"
              aria-label="Título del deber o examen"
              required
              placeholder="ej. Práctica 3: Implementación de Tablas Hash"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-xl text-xs bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Asignatura y Tipo */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-700">
                Asignatura *
              </label>
              <select
                aria-label="Asignatura del deber o examen"
                required
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-xl text-xs bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
              >
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} - {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700">
                Tipo de Trabajo
              </label>
              <select
                aria-label="Tipo de trabajo universitario"
                value={type}
                onChange={(e) => { setType(e.target.value as HomeworkType); if (e.target.value === 'examen') setUseNextClassDeadline(false); }}
                className="mt-1 w-full px-3 py-2 rounded-xl text-xs bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
              >
                <option value="practica">Práctica</option>
                <option value="ejercicios">Ejercicios / Problemas</option>
                <option value="proyecto">Proyecto</option>
                <option value="examen">Examen / Parcial</option>
                <option value="lectura">Lectura</option>
                <option value="otro">Otro</option>
              </select>
            </div>
          </div>

          {/* Fecha Límite y Hora */}
          {type !== 'examen' && <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3 space-y-2">
            <button type="button" disabled={saving || !subjectId} onClick={() => setUseNextClassDeadline(true)} className="rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 text-xs font-bold disabled:opacity-50">Para la siguiente clase</button>
            {useNextClassDeadline ? nextClass ? <p role="status" className="text-xs text-indigo-800">
              Próxima clase: {new Date(`${nextClass.date}T12:00:00Z`).toLocaleDateString('es-ES', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' })} a las {nextClass.time.slice(0,5)} · {nextClass.title}. El deber vence al empezar la clase.
            </p> : <p role="alert" className="text-xs text-amber-700">No aparece ninguna clase futura de esta asignatura en Calendar. Sincroniza el calendario o indica la fecha manualmente.</p>
              : <p className="text-xs text-slate-500">Usa el inicio de la próxima clase de esta asignatura en Calendar. Se ignoran todas las clases de hoy.</p>}
          </div>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-700">
                {type === 'examen' ? 'Fecha del examen *' : 'Fecha límite de entrega *'}
              </label>
              <input
                type="date"
                aria-label="Fecha del deber o examen"
                required
                value={dueDate}
                onChange={(e) => { setDueDate(e.target.value); setUseNextClassDeadline(false); }}
                className="mt-1 w-full px-3 py-2 rounded-xl text-xs bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700">
                {type === 'examen' ? 'Hora del examen · Madrid' : 'Hora límite · Madrid'}
              </label>
              <input
                type="time"
                step={60}
                aria-label="Hora del deber o examen"
                value={dueTime}
                onChange={(e) => { setDueTime(e.target.value); setUseNextClassDeadline(false); }}
                className="mt-1 w-full px-3 py-2 rounded-xl text-xs bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Prioridad y Estado */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-700">
                Prioridad
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as HomeworkPriority)}
                className="mt-1 w-full px-3 py-2 rounded-xl text-xs bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
              >
                <option value="alta">Alta (Muy importante)</option>
                <option value="media">Media</option>
                <option value="baja">Baja</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700">
                Estado Actual
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as HomeworkStatus)}
                className="mt-1 w-full px-3 py-2 rounded-xl text-xs bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
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
              <label className="text-xs font-semibold text-slate-700">
                % Nota Final (opcional)
              </label>
              <input
                type="number"
                min={0}
                max={100}
                placeholder="ej. 15"
                value={weightPercentage}
                onChange={(e) => setWeightPercentage(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-xl text-xs bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700">
                {type === 'examen' ? 'Horas de estudio necesarias *' : 'Horas estimadas · 2 h por defecto'}
              </label>
              <input
                type="number"
                aria-label="Horas de estudio o trabajo"
                required={type === 'examen'}
                min={0.25}
                max={500}
                step={0.25}
                placeholder="ej. 4"
                value={estimatedHours}
                onChange={(e) => setEstimatedHours(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-xl text-xs bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Descripción / Instrucciones */}
          <div>
            <label className="text-xs font-semibold text-slate-700">
              Instrucciones / Rúbrica / Notas
            </label>
            <textarea
              rows={3}
              placeholder="Detalles sobre requisitos, formato de entrega (.pdf, .zip), enlaces del campus..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-xl text-xs bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <p className="text-xs text-slate-500">Se incluirá automáticamente en tu plan de estudio al guardar.{type === 'examen' && ' Se reparte en sesiones de hasta 60 minutos, con práctica sin apuntes y repasos entre días.'}</p>

          {/* Footer actions */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || (useNextClassDeadline && !nextClass)}
              className="px-5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-md cursor-pointer active:scale-95"
            >
              {saving ? 'Guardando…' : homework ? 'Guardar Cambios' : type === 'examen' ? 'Guardar examen' : 'Guardar deber'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};
