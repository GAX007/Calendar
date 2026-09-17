import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Check, Trash2, Calendar, Clock, Tag } from 'lucide-react';
import { TaskItem, CategoryType } from '../types';
import { CATEGORIES } from '../data/categories';

interface TaskEditModalProps {
  isOpen: boolean;
  task: TaskItem | null;
  onClose: () => void;
  onSave: (updatedTask: TaskItem) => void;
  onDelete: (taskId: string) => void;
}

export const TaskEditModal: React.FC<TaskEditModalProps> = ({
  isOpen,
  task,
  onClose,
  onSave,
  onDelete,
}) => {
  const [formData, setFormData] = useState<TaskItem | null>(null);

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
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-2xl text-slate-100 my-auto max-h-[92dvh] overflow-y-auto"
        >
          <div className="flex items-center justify-between pb-4 border-b border-slate-800">
            <h3 className="font-bold text-white text-base">Modificar Tarea</h3>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-4">
            <div>
              <label className="text-xs font-semibold text-slate-300">Título / Nombre</label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                required
                className="w-full mt-1.5 px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-300">Categoría</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value as CategoryType })}
                  className="w-full mt-1.5 px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                >
                  {Object.keys(CATEGORIES).map((catKey) => (
                    <option key={catKey} value={catKey}>
                      {CATEGORIES[catKey as CategoryType].label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300">Prioridad</label>
                <select
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: e.target.value as 'alta' | 'media' | 'baja' })}
                  className="w-full mt-1.5 px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="alta">Alta</option>
                  <option value="media">Media</option>
                  <option value="baja">Baja</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-300">Fecha</label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  className="w-full mt-1.5 px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300">Hora Inicio</label>
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
                  className="w-full mt-1.5 px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300">Hora Fin</label>
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
                  className="w-full mt-1.5 px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300">Notas / Ubicación</label>
              <textarea
                rows={2}
                value={formData.notes || ''}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="w-full mt-1.5 px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => {
                  onDelete(formData.id);
                  onClose();
                }}
                className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1.5 p-1"
              >
                <Trash2 className="w-4 h-4" />
                Eliminar tarea
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3.5 py-2 rounded-xl text-xs text-slate-400 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md shadow-indigo-600/30"
                >
                  Guardar
                </button>
              </div>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
