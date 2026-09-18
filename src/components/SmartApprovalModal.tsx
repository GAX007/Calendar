import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Sparkles,
  CheckCircle2,
  Calendar,
  Clock,
  Tag,
  AlertCircle,
  Edit3,
  X,
  Plus,
  Trash2,
  Check,
  ChevronRight,
  Flame,
  BookOpen,
  Briefcase,
  Layers,
} from 'lucide-react';
import { TaskItem, CategoryType } from '../types';
import { getCategoryMeta, CATEGORIES } from '../data/categories';

interface SmartApprovalModalProps {
  isOpen: boolean;
  tasks: TaskItem[];
  sourceType: 'vision' | 'text';
  originalInput?: string;
  onClose: () => void;
  onApproveAndAdd: (approvedTasks: TaskItem[]) => void;
}

export const SmartApprovalModal: React.FC<SmartApprovalModalProps> = ({
  isOpen,
  tasks: initialTasks,
  sourceType,
  originalInput,
  onClose,
  onApproveAndAdd,
}) => {
  const [editableTasks, setEditableTasks] = useState<TaskItem[]>(initialTasks);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isEditModeActive, setIsEditModeActive] = useState<boolean>(false);

  const uniqueDatesCount = React.useMemo(() => {
    return new Set(editableTasks.map((t) => t.date)).size;
  }, [editableTasks]);

  // Sync state if props change
  React.useEffect(() => {
    setEditableTasks(initialTasks);
    setEditingId(null);
  }, [initialTasks]);

  const handleUpdateTaskField = (id: string, field: keyof TaskItem, value: any) => {
    setEditableTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, [field]: value } : t))
    );
  };

  const handleRemoveTask = (id: string) => {
    setEditableTasks((prev) => prev.filter((t) => t.id !== id));
  };

  const handleAddTask = () => {
    const today = new Date();
    const y = today.getFullYear();
    const m = (today.getMonth() + 1).toString().padStart(2, '0');
    const d = today.getDate().toString().padStart(2, '0');
    const dateStr = `${y}-${m}-${d}`;
    const spanishMonthsShort = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

    const newTask: TaskItem = {
      id: `task-manual-${Date.now()}`,
      title: 'Nueva Tarea Extraída',
      category: 'Academics',
      date: dateStr,
      time: '12:00',
      durationMinutes: 60,
      priority: 'media',
      sourceType,
      confidence: 0.95,
      extractedFields: {
        deadlineLabel: `${today.getDate()} ${spanishMonthsShort[today.getMonth()]}, 12:00`,
        detectedTag: 'Académico (Tag: Blue)',
      },
    };
    setEditableTasks((prev) => [...prev, newTask]);
    setEditingId(newTask.id);
    setIsEditModeActive(true);
  };

  const handleApprove = () => {
    if (editableTasks.length === 0) return;
    onApproveAndAdd(editableTasks);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.93, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="w-full max-w-2xl my-auto"
        >
          {/* Subtle animated iridescent border */}
          <div className="iridescent-border-wrapper-dense shadow-2xl shadow-indigo-950/70">
            <div className="bg-slate-900 rounded-2xl p-4 sm:p-6 border border-slate-800 text-slate-100 flex flex-col gap-4 max-h-[calc(92dvh-1rem)]">
              {/* Header: Categorization confirmation banner */}
              <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-600/20 shrink-0">
                    <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5" />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                      <h3 className="font-bold text-base sm:text-lg text-white tracking-tight">
                        Confirmar Tareas Detectadas
                      </h3>
                      <span className="inline-flex items-center gap-1 text-[10px] sm:text-[11px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                        <Check className="w-3 h-3 text-emerald-400" />
                        Datos Listos
                      </span>
                      {uniqueDatesCount > 1 && (
                        <span className="inline-flex items-center gap-1 text-[10px] sm:text-[11px] font-mono px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                          <Calendar className="w-3 h-3 text-indigo-400" />
                          Programado para {uniqueDatesCount} días
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Revisa la fecha, horario y categoría antes de sincronizar con tu calendario.
                    </p>
                  </div>
                </div>
                <button
                  id="btn-close-approval"
                  onClick={onClose}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
                  aria-label="Cerrar modal"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Source Context Snippet if available */}
              {originalInput && (
                <div className="rounded-xl bg-slate-950/60 border border-slate-800/80 p-3 text-xs flex items-center gap-2.5">
                  <span className="font-mono text-[10px] uppercase font-semibold text-slate-400 shrink-0 px-2 py-0.5 bg-slate-800 rounded">
                    {sourceType === 'vision' ? 'Captura / Foto' : 'Texto'}
                  </span>
                  <span className="text-slate-300 truncate italic">
                    "{originalInput}"
                  </span>
                </div>
              )}

              {/* Categorized Task Cards: Clean UI structured elements */}
              <div className="flex flex-col gap-3 max-h-[50vh] overflow-y-auto pr-1">
                {editableTasks.length === 0 ? (
                  <div className="text-center py-8 text-slate-400 text-sm">
                    No se detectaron tareas. Haz clic en "Añadir Tarea" para crear una.
                  </div>
                ) : (
                  editableTasks.map((task, index) => {
                    const meta = getCategoryMeta(task.category);
                    const isEditing = editingId === task.id || isEditModeActive;

                    return (
                      <div
                        key={task.id}
                        className={`rounded-xl border transition-all p-4 ${
                          isEditing
                            ? 'bg-slate-850 border-indigo-500/50 shadow-md ring-1 ring-indigo-500/20'
                            : 'bg-slate-950/50 border-slate-800/90 hover:border-slate-700'
                        }`}
                      >
                        {isEditing ? (
                          /* Edit Mode Fields */
                          <div className="flex flex-col gap-3">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold text-indigo-300 font-mono">
                                Editando Tarea {index + 1}
                              </span>
                              <button
                                onClick={() => handleRemoveTask(task.id)}
                                className="text-xs text-rose-400 hover:text-rose-300 p-1 flex items-center gap-1"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                Eliminar
                              </button>
                            </div>

                            <div>
                              <label className="text-[11px] text-slate-400 font-medium">Nombre de la Tarea:</label>
                              <input
                                type="text"
                                value={task.title}
                                onChange={(e) => handleUpdateTaskField(task.id, 'title', e.target.value)}
                                className="w-full mt-1 px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500"
                              />
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <div>
                                <label className="text-[11px] text-slate-400 font-medium">Categoría:</label>
                                <select
                                  value={task.category}
                                  onChange={(e) => handleUpdateTaskField(task.id, 'category', e.target.value)}
                                  className="w-full mt-1 px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-indigo-500"
                                >
                                  {Object.keys(CATEGORIES).map((catKey) => (
                                    <option key={catKey} value={catKey}>
                                      {CATEGORIES[catKey as CategoryType].label} ({CATEGORIES[catKey as CategoryType].tagColor})
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div>
                                <label className="text-[11px] text-slate-400 font-medium">Fecha:</label>
                                <input
                                  type="date"
                                  value={task.date}
                                  onChange={(e) => handleUpdateTaskField(task.id, 'date', e.target.value)}
                                  className="w-full mt-1 px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-indigo-500"
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <div>
                                <label className="text-[11px] text-slate-400 font-medium">Hora Inicio:</label>
                                <input
                                  type="time"
                                  value={task.time}
                                  onChange={(e) => {
                                    const newStart = e.target.value;
                                    handleUpdateTaskField(task.id, 'time', newStart);
                                    if (task.endTime && newStart) {
                                      const [sH, sM] = newStart.split(':').map(Number);
                                      const [eH, eM] = task.endTime.split(':').map(Number);
                                      const diff = (eH * 60 + eM) - (sH * 60 + sM);
                                      if (diff > 0) handleUpdateTaskField(task.id, 'durationMinutes', diff);
                                    }
                                  }}
                                  className="w-full mt-1 px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-indigo-500"
                                />
                              </div>

                              <div>
                                <label className="text-[11px] text-slate-400 font-medium">Hora Fin:</label>
                                <input
                                  type="time"
                                  value={task.endTime || ''}
                                  onChange={(e) => {
                                    const newEnd = e.target.value;
                                    handleUpdateTaskField(task.id, 'endTime', newEnd);
                                    if (task.time && newEnd) {
                                      const [sH, sM] = task.time.split(':').map(Number);
                                      const [eH, eM] = newEnd.split(':').map(Number);
                                      const diff = (eH * 60 + eM) - (sH * 60 + sM);
                                      if (diff > 0) handleUpdateTaskField(task.id, 'durationMinutes', diff);
                                    }
                                  }}
                                  className="w-full mt-1 px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-indigo-500"
                                />
                              </div>
                            </div>

                            <div>
                              <label className="text-[11px] text-slate-400 font-medium">Detalles / Notas:</label>
                              <input
                                type="text"
                                value={task.notes || ''}
                                onChange={(e) => handleUpdateTaskField(task.id, 'notes', e.target.value)}
                                placeholder="Notas o ubicación adicional..."
                                className="w-full mt-1 px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                              />
                            </div>
                          </div>
                        ) : (
                          /* View Mode matching exact user request specifications */
                          <div className="flex flex-col gap-2.5">
                            {/* Top row: Title and Category Tag */}
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-xs text-slate-500">#{index + 1}</span>
                                <h4 className="font-bold text-white text-base tracking-tight">
                                  {task.title}
                                </h4>
                              </div>

                              {/* Category Tag with color matching requirement */}
                              <div
                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${meta.bgClass} ${meta.colorClass} ${meta.borderClass}`}
                              >
                                <span
                                  className="w-2 h-2 rounded-full"
                                  style={{ backgroundColor: meta.dotColor }}
                                />
                                <span>{meta.label}</span>
                                <span className="text-[10px] opacity-75 font-mono">
                                  (Tag: {meta.tagColor})
                                </span>
                              </div>
                            </div>

                            {/* Middle row: Clean UI elements with Deadline / Time */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-xs">
                              <div className="flex items-center gap-2 text-slate-300 bg-slate-900/60 px-2.5 py-1.5 rounded-lg border border-slate-800">
                                <Calendar className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                                <span className="text-slate-400">Fecha / Plazo:</span>
                                <span className="font-semibold text-slate-100">
                                  {task.extractedFields?.deadlineLabel || `${task.date}`}
                                </span>
                              </div>

                              <div className="flex items-center gap-2 text-slate-300 bg-slate-900/60 px-2.5 py-1.5 rounded-lg border border-slate-800">
                                <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                <span className="text-slate-400">Horario:</span>
                                <span className="font-semibold text-slate-100">
                                  {task.time}{task.endTime ? ` - ${task.endTime}` : ''} ({Math.floor(task.durationMinutes / 60)}h{' '}
                                  {task.durationMinutes % 60 > 0 ? `${task.durationMinutes % 60}m` : ''})
                                </span>
                              </div>
                            </div>

                            {/* Notes if available */}
                            {task.notes && (
                              <p className="text-xs text-slate-400 bg-slate-900/30 px-2.5 py-1 rounded border border-slate-800/40">
                                {task.notes}
                              </p>
                            )}

                            {/* Row footer: Confidence indicator and inline edit button */}
                            <div className="flex items-center justify-between pt-1 border-t border-slate-800/60 text-[11px] text-slate-500">
                              <span className="flex items-center gap-1 font-mono text-emerald-400">
                                <CheckCircle2 className="w-3 h-3" />
                                {task.confidence ? `${Math.round(task.confidence * 100)}% de coincidencia` : 'Detectado con precisión'}
                              </span>

                              <button
                                onClick={() => setEditingId(task.id)}
                                className="text-slate-400 hover:text-indigo-300 flex items-center gap-1 p-1 transition cursor-pointer"
                              >
                                <Edit3 className="w-3 h-3" />
                                Modificar esta tarea
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Add task button if in edit mode */}
              <div className="flex justify-between items-center text-xs">
                <button
                  onClick={handleAddTask}
                  className="flex items-center gap-1 text-slate-400 hover:text-indigo-300 transition cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Añadir otra tarea manual
                </button>
                <span className="text-slate-500">
                  {editableTasks.length} {editableTasks.length === 1 ? 'tarea detectada' : 'tareas detectadas'}
                  {uniqueDatesCount > 1 ? ` (${uniqueDatesCount} días)` : ''}
                </span>
              </div>

              {/* Two clear buttons at the bottom of the card: "Edit" and "Approve & Add to Calendar" */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-slate-800">
                <button
                  id="btn-edit-approval"
                  onClick={() => setIsEditModeActive(!isEditModeActive)}
                  className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
                    isEditModeActive
                      ? 'bg-indigo-600/20 border-indigo-500 text-indigo-200'
                      : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <Edit3 className="w-4 h-4" />
                  {isEditModeActive ? 'Guardar Cambios' : 'Editar Tareas'}
                </button>

                <button
                  id="btn-approve-add-calendar"
                  onClick={handleApprove}
                  disabled={editableTasks.length === 0}
                  className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-500 to-indigo-600 text-white text-xs font-bold shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/35 hover:brightness-110 active:scale-[0.98] transition disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Aprobar y Añadir al Calendario
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
