import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence, useDragControls } from 'motion/react';
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import { TaskItem, CategoryType } from '../types';
import { getCategoryMeta, CATEGORIES } from '../data/categories';
import { useIsMobile } from '../hooks/useMediaQuery';
import { SheetHandle, shouldCloseSheet } from './ui/SheetHandle';

interface SmartApprovalModalProps {
  isOpen: boolean;
  tasks: TaskItem[];
  sourceType: 'vision' | 'text' | 'voice';
  originalInput?: string;
  onClose: () => void;
  onApproveAndAdd: (approvedTasks: TaskItem[]) => void;
}

const DIAS_CORTOS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const fechaCorta = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return s;
  const fecha = new Date(Date.UTC(y, m - 1, d));
  return `${DIAS_CORTOS[fecha.getUTCDay()]} ${d} ${MESES_CORTOS[m - 1]}`;
};

const minutosEntre = (inicio: string, fin: string) => {
  const [sH, sM] = inicio.split(':').map(Number);
  const [eH, eM] = fin.split(':').map(Number);
  return eH * 60 + eM - (sH * 60 + sM);
};

const campo = 'w-full h-11 mt-1 rounded-xl border border-line-2 bg-white px-3 text-[15px] text-ink outline-none focus:border-ink';
const etiqueta = 'block text-[13px] text-ink-2';

// Review sheet for what the parser understood: tick what to keep, fix it inline and add it to the agenda
export const SmartApprovalModal: React.FC<SmartApprovalModalProps> = ({
  isOpen,
  tasks: initialTasks,
  sourceType,
  originalInput,
  onClose,
  onApproveAndAdd,
}) => {
  const [editableTasks, setEditableTasks] = useState<TaskItem[]>(initialTasks);
  const [excluidas, setExcluidas] = useState<Set<string>>(() => new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  // Open every task for editing at once (the old "Modificar" mode)
  const [editarTodas, setEditarTodas] = useState(false);
  const isMobile = useIsMobile();
  const dragControls = useDragControls();

  useEffect(() => {
    setEditableTasks(initialTasks);
    setExcluidas(new Set());
    setEditingId(null);
  }, [initialTasks]);

  const incluidas = editableTasks.filter((t) => !excluidas.has(t.id));

  const handleUpdateTaskField = (id: string, field: keyof TaskItem, value: unknown) => {
    setEditableTasks((prev) => prev.map((t) => (t.id === id ? { ...t, [field]: value } : t)));
  };

  const alternar = (id: string) => {
    setExcluidas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleRemoveTask = (id: string) => {
    setEditableTasks((prev) => prev.filter((t) => t.id !== id));
    setEditingId(null);
  };

  const handleAddTask = () => {
    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const newTask: TaskItem = {
      id: `task-manual-${Date.now()}`,
      title: '',
      category: 'Academics',
      date: dateStr,
      time: '12:00',
      endTime: '13:00',
      durationMinutes: 60,
      priority: 'media',
      sourceType: sourceType === 'vision' ? 'vision' : sourceType === 'voice' ? 'voice' : 'text',
      confidence: 1,
    };
    setEditableTasks((prev) => [...prev, newTask]);
    setEditingId(newTask.id);
  };

  const handleApprove = () => {
    if (!incluidas.length) return;
    onApproveAndAdd(incluidas.map((t) => ({ ...t, title: t.title.trim() || 'Sin título' })));
  };

  if (!isOpen) return null;

  const fuente = sourceType === 'vision' ? 'Desde la foto' : sourceType === 'voice' ? 'Has dicho' : 'Has escrito';
  const n = editableTasks.length;
  const titulo = n === 0 ? 'No he encontrado nada' : n === 1 ? 'He entendido 1 cosa' : `He entendido ${n} cosas`;

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center sm:p-5 bg-ink/40 pt-[max(env(safe-area-inset-top,0px),1rem)]"
        onClick={onClose}
      >
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby="titulo-confirmar"
          initial={isMobile ? { y: '100%' } : { opacity: 0, scale: 0.96, y: 12 }}
          animate={isMobile ? { y: 0 } : { opacity: 1, scale: 1, y: 0 }}
          exit={isMobile ? { y: '100%' } : { opacity: 0, scale: 0.96, y: 12 }}
          transition={{ type: 'spring', damping: 32, stiffness: 340 }}
          drag={isMobile ? 'y' : false}
          dragControls={dragControls}
          dragListener={false}
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={{ top: 0, bottom: 0.7 }}
          onDragEnd={(_, info) => {
            if (shouldCloseSheet(info)) onClose();
          }}
          onClick={(e) => e.stopPropagation()}
          className="w-full sm:max-w-lg"
        >
          <div className="bg-white rounded-t-[28px] sm:rounded-3xl px-5 pt-3 sm:pt-6 pb-[max(env(safe-area-inset-bottom,0px),1.25rem)] sm:px-6 flex flex-col gap-5 max-h-[calc(92dvh-1rem)]">
            <SheetHandle onPointerDown={(e) => dragControls.start(e)} />

            {originalInput && (
              <div className="flex flex-col gap-2">
                <span className="text-[13px] font-medium text-ink-2">{fuente}</span>
                <p className="text-[15.5px] leading-[1.45] text-slate-700 text-pretty line-clamp-4">«{originalInput}»</p>
              </div>
            )}

            <div className="flex items-start justify-between gap-3">
              <h2 id="titulo-confirmar" className="text-2xl leading-[1.15] font-semibold tracking-[-0.02em]">{titulo}</h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar"
                className="flex-none w-11 h-11 -mr-2 -mt-1.5 rounded-full flex items-center justify-center hover:bg-black/5"
              >
                <X className="w-5 h-5" strokeWidth={1.75} />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1 border-t border-hairline">
              {editableTasks.map((task) => {
                const meta = getCategoryMeta(task.category);
                const incluida = !excluidas.has(task.id);
                const editando = editingId === task.id || editarTodas;
                const nombre = task.title.trim() || 'Sin título';
                return (
                  <div key={task.id} className="border-b border-hairline">
                    <div className="grid grid-cols-[44px_minmax(0,1fr)_44px] gap-2 items-center min-h-[76px]">
                      <button
                        type="button"
                        onClick={() => alternar(task.id)}
                        aria-pressed={incluida}
                        aria-label={`${incluida ? 'Quitar' : 'Incluir'}: ${nombre}`}
                        className="w-11 h-11 -ml-[9px] flex items-center justify-center cursor-pointer"
                      >
                        <span
                          className={`w-[26px] h-[26px] rounded-lg border-[1.5px] flex items-center justify-center text-white ${
                            incluida ? 'bg-ink border-ink' : 'bg-white border-check'
                          }`}
                        >
                          {incluida && <Check className="w-3.5 h-3.5" strokeWidth={2} />}
                        </span>
                      </button>
                      <span className="min-w-0 flex flex-col gap-1">
                        <span className={`text-base leading-[1.3] font-medium ${incluida ? 'text-ink' : 'text-ink-3'}`}>{nombre}</span>
                        <span className="flex flex-wrap items-center gap-x-[7px] gap-y-0.5 text-[13.5px] text-ink-2">
                          <span className="w-2 h-2 rounded-full flex-none" style={{ background: meta.dotColor }} />
                          <span className="font-mono text-[12.5px]">
                            {fechaCorta(task.date)} · {task.time}
                            {task.endTime ? `–${task.endTime}` : ''}
                          </span>
                          <span>· {meta.label}</span>
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setEditingId(editando ? null : task.id)}
                        aria-expanded={editando}
                        aria-label={`Editar: ${nombre}`}
                        className="w-11 h-11 rounded-full flex items-center justify-center text-slate-700 hover:bg-black/5"
                      >
                        <Pencil className="w-[18px] h-[18px]" strokeWidth={1.75} />
                      </button>
                    </div>

                    {editando && (
                      <div className="pb-4 flex flex-col gap-3">
                        <label className={etiqueta}>
                          Título
                          <input
                            type="text"
                            value={task.title}
                            autoFocus={!task.title}
                            onChange={(e) => handleUpdateTaskField(task.id, 'title', e.target.value)}
                            className={campo}
                          />
                        </label>
                        <div className="grid grid-cols-2 gap-3">
                          <label className={etiqueta}>
                            Categoría
                            <select
                              value={task.category}
                              onChange={(e) => handleUpdateTaskField(task.id, 'category', e.target.value as CategoryType)}
                              className={campo}
                            >
                              {Object.keys(CATEGORIES).map((catKey) => (
                                <option key={catKey} value={catKey}>
                                  {CATEGORIES[catKey as CategoryType].label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className={etiqueta}>
                            Fecha
                            <input
                              type="date"
                              value={task.date}
                              onChange={(e) => handleUpdateTaskField(task.id, 'date', e.target.value)}
                              className={campo}
                            />
                          </label>
                          <label className={etiqueta}>
                            Inicio
                            <input
                              type="time"
                              value={task.time}
                              onChange={(e) => {
                                const inicio = e.target.value;
                                handleUpdateTaskField(task.id, 'time', inicio);
                                if (task.endTime && inicio) {
                                  const diff = minutosEntre(inicio, task.endTime);
                                  if (diff > 0) handleUpdateTaskField(task.id, 'durationMinutes', diff);
                                }
                              }}
                              className={campo}
                            />
                          </label>
                          <label className={etiqueta}>
                            Fin
                            <input
                              type="time"
                              value={task.endTime || ''}
                              onChange={(e) => {
                                const fin = e.target.value;
                                handleUpdateTaskField(task.id, 'endTime', fin);
                                if (task.time && fin) {
                                  const diff = minutosEntre(task.time, fin);
                                  if (diff > 0) handleUpdateTaskField(task.id, 'durationMinutes', diff);
                                }
                              }}
                              className={campo}
                            />
                          </label>
                        </div>
                        <label className={etiqueta}>
                          Notas
                          <input
                            type="text"
                            value={task.notes || ''}
                            onChange={(e) => handleUpdateTaskField(task.id, 'notes', e.target.value)}
                            placeholder="Lugar o detalles"
                            className={campo}
                          />
                        </label>
                        <div className="flex items-center justify-between">
                          <button
                            type="button"
                            onClick={() => handleRemoveTask(task.id)}
                            className="h-11 -ml-2 px-2 rounded-full flex items-center gap-2 text-sm font-semibold text-ink-2 hover:text-ink"
                          >
                            <Trash2 className="w-4 h-4" strokeWidth={1.75} /> Eliminar
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="h-11 px-5 rounded-full border border-line-2 bg-white text-sm font-semibold"
                          >
                            Listo
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              <button
                type="button"
                onClick={handleAddTask}
                className="h-12 flex items-center gap-2 text-sm font-semibold text-ink-2 hover:text-ink"
              >
                <Plus className="w-4 h-4" strokeWidth={1.75} /> Añadir otra
              </button>
              {editableTasks.length > 1 && (
                <button
                  type="button"
                  aria-pressed={editarTodas}
                  onClick={() => { setEditarTodas((v) => !v); setEditingId(null); }}
                  className="h-12 ml-4 inline-flex items-center gap-2 text-sm font-semibold text-ink-2 hover:text-ink"
                >
                  <Pencil className="w-4 h-4" strokeWidth={1.75} /> {editarTodas ? 'Cerrar edición' : 'Editar todas'}
                </button>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <button
                type="button"
                id="btn-approve-add-calendar"
                onClick={handleApprove}
                disabled={incluidas.length === 0}
                className="h-[54px] rounded-full bg-ink text-white text-[15.5px] font-semibold disabled:opacity-40 active:scale-[0.99] transition cursor-pointer"
              >
                {incluidas.length === 0 ? 'Selecciona algo para añadir' : `Añadir ${incluidas.length} a la agenda`}
              </button>
              <button type="button" onClick={onClose} className="h-12 rounded-full text-[15px] font-semibold hover:bg-black/5">
                Cancelar
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
