import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Calendar,
  Link2,
  Check,
  X,
  ExternalLink,
  RefreshCw,
  Trash2,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';
import {
  getUserCustomCalendarUrl,
  setUserCustomCalendarUrl,
  getEffectiveCalendarUrl,
  syncLiveGoogleCalendar,
  AUTHORIZED_CALENDAR_OWNER_EMAIL,
  GOOGLE_CALENDAR_CONFIG,
} from '../services/googleCalendarService';
import { TaskItem } from '../types';

interface CalendarLinkModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId?: string;
  userEmail?: string;
  onSyncSuccess: (newTasks: TaskItem[]) => void;
  showToast: (msg: string) => void;
}

export const CalendarLinkModal: React.FC<CalendarLinkModalProps> = ({
  isOpen,
  onClose,
  userId,
  userEmail,
  onSyncSuccess,
  showToast,
}) => {
  const [urlInput, setUrlInput] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [showInstructions, setShowInstructions] = useState<boolean>(false);

  const cleanEmail = (userEmail || '').toLowerCase().trim();
  const isXavierAccount = cleanEmail === AUTHORIZED_CALENDAR_OWNER_EMAIL;

  useEffect(() => {
    if (isOpen) {
      const current = getUserCustomCalendarUrl(userId);
      setUrlInput(current);
    }
  }, [isOpen, userId]);

  if (!isOpen) return null;

  const currentEffectiveUrl = getEffectiveCalendarUrl(userId, cleanEmail);
  const hasCustomUrl = Boolean(getUserCustomCalendarUrl(userId));

  const handleSaveAndSync = async () => {
    const trimmed = urlInput.trim();

    if (!trimmed && !isXavierAccount) {
      showToast('Por favor introduce un enlace iCal (.ics) válido');
      return;
    }

    if (trimmed && !trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
      showToast('El enlace debe comenzar con https://');
      return;
    }

    setIsSaving(true);
    try {
      setUserCustomCalendarUrl(trimmed, userId);
      const res = await syncLiveGoogleCalendar(userId, cleanEmail, trimmed);

      if (res.success && res.tasks.length > 0) {
        onSyncSuccess(res.tasks);
        showToast(`✓ ¡${res.tasks.length} eventos sincronizados con tu Google Calendar!`);
        onClose();
      } else if (res.success && res.tasks.length === 0) {
        showToast('Enlace guardado, pero no se encontraron eventos en este periodo.');
        onClose();
      } else {
        showToast(res.error || 'No se pudo conectar con este calendario.');
      }
    } catch {
      showToast('Error al conectar con Google Calendar.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUnlink = () => {
    setUserCustomCalendarUrl('', userId);
    setUrlInput('');
    showToast('Calendario personalizado desvinculado.');
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs pt-[max(env(safe-area-inset-top,0px),1rem)] pb-[max(env(safe-area-inset-bottom,0px),1rem)] overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="w-full max-w-lg rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-5 sm:p-6 flex flex-col gap-4 text-slate-900 dark:text-slate-100 my-auto max-h-[92dvh] overflow-y-auto"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 flex items-center justify-center shadow-xs shrink-0">
                <Calendar className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-base sm:text-lg leading-tight">
                  Vincular Google Calendar
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Sincroniza tus propios horarios y clases con tu cuenta
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-10 h-10 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer flex items-center justify-center touch-manipulation"
              aria-label="Cerrar modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Account status note */}
          {isXavierAccount && !hasCustomUrl && (
            <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/80 text-xs text-emerald-800 dark:text-emerald-200 flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                Tu cuenta ({cleanEmail}) ya tiene vinculado por defecto tu calendario oficial universitario (<strong>{GOOGLE_CALENDAR_CONFIG.calName}</strong>).
              </span>
            </div>
          )}

          {/* Form input */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
              Dirección pública iCal (.ics) de tu calendario
            </label>
            <div className="relative flex items-center">
              <Link2 className="absolute left-3 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                type="url"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://calendar.google.com/calendar/ical/.../public/basic.ics"
                className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-base sm:text-xs font-mono text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-500 focus:bg-white dark:focus:bg-slate-900 transition"
              />
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Cada usuario tiene su propio calendario privado. Nadie más podrá ver tus eventos.
            </p>
          </div>

          {/* How to get instructions toggle */}
          <div className="border border-slate-100 dark:border-slate-800 rounded-2xl p-3 bg-slate-50/60 dark:bg-slate-850/40 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setShowInstructions((prev) => !prev)}
              className="flex items-center justify-between text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer py-1 touch-manipulation"
            >
              <div className="flex items-center gap-1.5">
                <HelpCircle className="w-3.5 h-3.5" />
                <span>¿Cómo obtengo mi enlace de Google Calendar?</span>
              </div>
              <span className="text-[10px]">{showInstructions ? 'Ocultar' : 'Ver pasos'}</span>
            </button>

            {showInstructions && (
              <ol className="text-xs text-slate-600 dark:text-slate-300 space-y-1.5 pl-4 list-decimal pt-1 border-t border-slate-200/60 dark:border-slate-700/60">
                <li>Abre <strong>Google Calendar</strong> en tu navegador web.</li>
                <li>En la barra izquierda (&quot;Mis calendarios&quot;), pasa el ratón sobre tu calendario y haz clic en los <strong>3 puntos</strong> &gt; <strong>Configuración y compartir</strong>.</li>
                <li>Desplázate hacia abajo hasta la sección <strong>&quot;Integrar el calendario&quot;</strong>.</li>
                <li>Copia el enlace que pone <strong>&quot;Dirección pública en formato iCal&quot;</strong> (termina en <code>.ics</code>).</li>
                <li>Pégalo en la casilla de arriba y pulsa <strong>Guardar y sincronizar</strong>.</li>
              </ol>
            )}
          </div>

          {/* Footer actions */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 gap-2">
            {hasCustomUrl ? (
              <button
                type="button"
                onClick={handleUnlink}
                className="flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-xl text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-xs font-bold transition cursor-pointer touch-manipulation"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Desvincular</span>
              </button>
            ) : <div />}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 min-h-[40px] rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold transition cursor-pointer touch-manipulation"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveAndSync}
                disabled={isSaving}
                className="flex items-center gap-2 px-4 py-2 min-h-[40px] rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm transition cursor-pointer active:scale-95 disabled:opacity-60 touch-manipulation"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSaving ? 'animate-spin' : ''}`} />
                <span>{isSaving ? 'Sincronizando...' : 'Guardar y Sincronizar'}</span>
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
