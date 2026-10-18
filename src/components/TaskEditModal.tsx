import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence, useDragControls } from 'motion/react';
import { X, Check, Trash2, Calendar, Clock, Tag } from 'lucide-react';
import { TaskItem, CategoryType } from '../types';
import { CATEGORIES } from '../data/categories';
import { useIsMobile } from '../hooks/useMediaQuery';
import { SheetHandle, shouldCloseSheet } from './ui/SheetHandle';

interface TaskEditModalProps {
  isOpen: boolean;
  task: TaskItem | null;
  onClose: () => void;
  onSave: (updatedTask: TaskItem) => void;
  onDelete: (taskId: string) => void;
  isNew?: boolean;
}

export const TaskEditModal: React.FC<TaskEditModalProps> = ({
  isOpen,
  task,
  onClose,
  onSave,
  onDelete,
  isNew = false,
}) => {
  const [formData, setFormData] = useState<TaskItem | null>(null);
  const isMobile = useIsMobile();
  const dragControls = useDragControls();

  useEffect(() => {
    setFormData(task ? { ...task } : null);
  }, [task]);

  if (!isOpen || !formData) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (formData) {
      onSave(formData);
      onClose();
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center sm:p-4 bg-ink/40 sm:overflow-y-auto pt-[max(env(safe-area-inset-top,0px),1rem)] sm:pb-[max(env(safe-area-inset-bottom,0px),1rem)]">
        {/* Bottom sheet on phones (actions within thumb reach), centered dialog from sm upwards */}
        <motion.div
          role="dialog"
          aria-modal="true"
          initial={isMobile ? { y: '100%' } : { opacity: 0, scale: 0.95 }}
          animate={isMobile ? { y: 0 } : { opacity: 1, scale: 1 }}
          exit={isMobile ? { y: '100%' } : { opacity: 0, scale: 0.95 }}
          transition={isMobile ? { type: 'spring', damping: 32, stiffness: 340 } : undefined}
          drag={isMobile ? 'y' : false}
          dragControls={dragControls}
          dragListener={false}
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={{ top: 0, bottom: 0.7 }}
          onDragEnd={(_, info) => {
            if (shouldCloseSheet(info)) onClose();
          }}
          className="w-full sm:max-w-md bg-white rounded-t-[28px] sm:rounded-3xl px-5 pt-5 pb-[max(env(safe-area-inset-bottom,0px),1rem)] sm:p-6 shadow-2xl text-slate-900 sm:my-auto max-h-[92dvh] overflow-y-auto overscroll-contain"
        >
          <SheetHandle onPointerDown={(e) => dragControls.start(e)} />
          <div className="flex items-center justify-between pb-2">
            <h3 className="font-semibold text-ink text-2xl tracking-[-0.02em]">
              {isNew ? 'Añadir Nueva Tarea' : 'Modificar Tarea'}
            </h3>
            <button
              onClick={onClose}
              className="w-11 h-11 -mr-2 rounded-full text-ink hover:bg-black/5 transition flex items-center justify-center touch-manipulation"
              aria-label="Cerrar modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-4">
            <div>
              <label className="text-[13px] text-ink-2">Título / Nombre</label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                required
                className="w-full mt-1.5 px-3 py-2.5 bg-white border border-line-2 rounded-xl text-base sm:text-sm text-slate-900 outline-none focus:border-ink"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[13px] text-ink-2">Categoría</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value as CategoryType })}
                  className="w-full mt-1.5 px-3 py-2.5 bg-white border border-line-2 rounded-xl text-base sm:text-xs text-slate-900 outline-none focus:border-ink cursor-pointer"
                >
                  {Object.keys(CATEGORIES).map((catKey) => (
                    <option key={catKey} value={catKey}>
                      {CATEGORIES[catKey as CategoryType].label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[13px] text-ink-2">Prioridad</label>
                <select
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: e.target.value as 'alta' | 'media' | 'baja' })}
                  className="w-full mt-1.5 px-3 py-2.5 bg-white border border-line-2 rounded-xl text-base sm:text-xs text-slate-900 outline-none focus:border-ink cursor-pointer"
                >
                  <option value="alta">Alta</option>
                  <option value="media">Media</option>
                  <option value="baja">Baja</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-[13px] text-ink-2">Fecha</label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  className="w-full mt-1.5 px-3 py-2.5 bg-white border border-line-2 rounded-xl text-base sm:text-xs text-slate-900 outline-none focus:border-ink"
                />
              </div>

              <div>
                <label className="text-[13px] text-ink-2">Hora Inicio</label>
                <input
                  type="time"
                  value={formData.time}
                  onChange={(e) => {
                    const newStart = e.target.value;
                    let newDur = formData.durationMinutes;
                    if (formData.endTime && newStart) {
                      const [sH, sM] = newStart.split(':').map(Number);
                      const [eH, eM] = formData.endTime.split(':').map(Number);
                      const diff = (eH * 60 + eM) - (sH * 60 + sM);
                      if (diff > 0) newDur = diff;
                    }
                    setFormData({ ...formData, time: newStart, durationMinutes: newDur });
                  }}
                  className="w-full mt-1.5 px-3 py-2.5 bg-white border border-line-2 rounded-xl text-base sm:text-xs text-slate-900 outline-none focus:border-ink"
                />
              </div>

              <div>
                <label className="text-[13px] text-ink-2">Hora Fin</label>
                <input
                  type="time"
                  value={formData.endTime || ''}
                  onChange={(e) => {
                    const newEnd = e.target.value;
                    let newDur = formData.durationMinutes;
                    if (formData.time && newEnd) {
                      const [sH, sM] = formData.time.split(':').map(Number);
                      const [eH, eM] = newEnd.split(':').map(Number);
                      const diff = (eH * 60 + eM) - (sH * 60 + sM);
                      if (diff > 0) newDur = diff;
                    }
                    setFormData({ ...formData, endTime: newEnd, durationMinutes: newDur });
                  }}
                  className="w-full mt-1.5 px-3 py-2.5 bg-white border border-line-2 rounded-xl text-base sm:text-xs text-slate-900 outline-none focus:border-ink"
                />
              </div>
            </div>

            <div>
              <label className="text-[13px] text-ink-2">Notas / Ubicación</label>
              <textarea
                rows={2}
                value={formData.notes || ''}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Notas adicionales, detalles o ubicación..."
                className="w-full mt-1.5 px-3 py-2 bg-white border border-line-2 rounded-xl text-base sm:text-xs text-slate-900 outline-none focus:border-ink"
              />
            </div>

            <div className="flex items-center justify-between pt-3">
              {!isNew ? (
                <button
                  type="button"
                  onClick={() => {
                    onDelete(formData.id);
                    onClose();
                  }}
                  className="min-h-11 px-2 -ml-2 text-sm font-semibold text-red-700 hover:text-red-800 flex items-center gap-1.5 transition cursor-pointer touch-manipulation"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Eliminar</span>
                </button>
              ) : (
                <div />
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="min-h-11 px-4 rounded-full text-sm font-semibold text-ink hover:bg-black/5 transition cursor-pointer touch-manipulation"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="min-h-11 px-5 rounded-full bg-ink text-white text-sm font-semibold transition cursor-pointer touch-manipulation"
                >
                  {isNew ? 'Crear Tarea' : 'Guardar'}
                </button>
              </div>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
