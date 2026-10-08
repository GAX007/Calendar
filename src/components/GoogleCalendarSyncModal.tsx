import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Calendar,
  Download,
  Upload,
  ExternalLink,
  CheckCircle2,
  X,
  FileText,
  Sparkles,
  Link2,
  RefreshCw,
  Info,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react';
import { TaskItem } from '../types';
import { exportTasksToICS, downloadICSFile, parseICSToTasks, generateGoogleCalendarUrl } from '../utils/icsHelper';
import { syncLiveGoogleCalendar, GOOGLE_CALENDAR_CONFIG } from '../services/googleCalendarService';

interface GoogleCalendarSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  tasks: TaskItem[];
  onImportTasks: (newTasks: TaskItem[]) => void;
  onLiveSyncSuccess: (newTasks: TaskItem[]) => void;
  userId?: string;
  userEmail?: string;
  showToast?: (msg: string) => void;
}

export const GoogleCalendarSyncModal: React.FC<GoogleCalendarSyncModalProps> = ({
  isOpen,
  onClose,
  tasks,
  onImportTasks,
  onLiveSyncSuccess,
  userId,
  userEmail,
  showToast = (_msg: string) => {},
}) => {
  const [activeTab, setActiveTab] = useState<'sync' | 'embed' | 'export' | 'import' | 'guide'>('sync');
  const [importedPreview, setImportedPreview] = useState<TaskItem[] | null>(null);
  const [importFileName, setImportFileName] = useState<string>('');
  const [isProcessingFile, setIsProcessingFile] = useState<boolean>(false);
  const [isSyncingLive, setIsSyncingLive] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleLiveSync = async () => {
    setIsSyncingLive(true);
    try {
      const res = await syncLiveGoogleCalendar(userId, userEmail);
      if (res.success) {
        onLiveSyncSuccess(res.tasks);
        showToast(`¡${res.tasks.length} eventos sincronizados en vivo desde ${res.calName}!`);
      } else {
        showToast(res.error || 'No se pudieron descargar eventos de Google Calendar');
      }
    } catch (err: any) {
      showToast('Error al conectar con Google Calendar');
    } finally {
      setIsSyncingLive(false);
    }
  };

  const handleExportICS = () => {
    const icsContent = exportTasksToICS(tasks);
    const dateStr = new Date().toISOString().split('T')[0];
    downloadICSFile(`omniagenda-google-calendar-${dateStr}.ics`, icsContent);
    showToast('Archivo .ics descargado. Puedes importarlo directamente en Google Calendar.');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportFileName(file.name);
    setIsProcessingFile(true);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const parsed = parseICSToTasks(content);
        setImportedPreview(parsed);
        if (parsed.length === 0) {
          showToast('No se detectaron eventos válidos en el archivo seleccionado.');
        } else {
          showToast(`¡Se han leído ${parsed.length} eventos del archivo!`);
        }
      } catch (err) {
        console.error('Error parsing .ics:', err);
        showToast('Error al procesar el archivo .ics');
      } finally {
        setIsProcessingFile(false);
      }
    };
    reader.readAsText(file);
  };

  const handleConfirmImport = () => {
    if (!importedPreview || importedPreview.length === 0) return;
    onImportTasks(importedPreview);
    showToast(`¡${importedPreview.length} eventos importados a tu agenda exitosamente!`);
    setImportedPreview(null);
    setImportFileName('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs pt-[max(env(safe-area-inset-top,0px),1rem)] pb-[max(env(safe-area-inset-bottom,0px),1rem)] overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        transition={{ duration: 0.2 }}
        className="w-full max-w-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[92dvh]"
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 bg-gradient-to-r from-blue-50/50 dark:from-blue-950/20 via-transparent to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-600/30 shrink-0">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base sm:text-lg text-slate-900 dark:text-white flex items-center gap-2">
                <span>Vincular con Google Calendar</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 font-bold uppercase">
                  iCal / API
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Sincroniza tus horarios, clases y entrenos para no tener que escribirlos manualmente.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer flex items-center justify-center touch-manipulation"
            aria-label="Cerrar modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switchers */}
        <div className="flex border-b border-slate-100 dark:border-slate-800 px-4 bg-slate-50/60 dark:bg-slate-950/40 gap-1 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveTab('sync')}
            className={`py-2.5 px-3.5 text-xs font-bold border-b-2 transition whitespace-nowrap cursor-pointer ${
              activeTab === 'sync'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            Sincronización en Vivo
          </button>
          <button
            onClick={() => setActiveTab('embed')}
            className={`py-2.5 px-3.5 text-xs font-bold border-b-2 transition whitespace-nowrap cursor-pointer ${
              activeTab === 'embed'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            Ver Google Calendar Oficial
          </button>
          <button
            onClick={() => setActiveTab('export')}
            className={`py-2.5 px-3.5 text-xs font-bold border-b-2 transition whitespace-nowrap cursor-pointer ${
              activeTab === 'export'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            Exportar a Google
          </button>
          <button
            onClick={() => setActiveTab('import')}
            className={`py-2.5 px-3.5 text-xs font-bold border-b-2 transition whitespace-nowrap cursor-pointer ${
              activeTab === 'import'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            Importar desde Archivo
          </button>
          <button
            onClick={() => setActiveTab('guide')}
            className={`py-2.5 px-3.5 text-xs font-bold border-b-2 transition whitespace-nowrap cursor-pointer ${
              activeTab === 'guide'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            Información & Enlaces
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 flex flex-col gap-4 text-xs sm:text-sm">
          {/* TAB: EMBED OFFICIAL GOOGLE CALENDAR */}
          {activeTab === 'embed' && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-slate-700 dark:text-slate-300">
                  Vista Incrustada Oficial &bull; {GOOGLE_CALENDAR_CONFIG.calName}
                </span>
                <a
                  href={GOOGLE_CALENDAR_CONFIG.embedUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1"
                >
                  <span>Abrir en nueva pestaña</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
              <div className="w-full h-96 sm:h-[450px] rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white">
                <iframe
                  src={GOOGLE_CALENDAR_CONFIG.embedUrl}
                  style={{ border: 0 }}
                  width="100%"
                  height="100%"
                  frameBorder="0"
                  scrolling="no"
                  title="Google Calendar Oficial"
                />
              </div>
            </div>
          )}

          {/* TAB: SYNC OVERVIEW */}
          {activeTab === 'sync' && (
            <div className="flex flex-col gap-4">
              {/* Connected Feed Card */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-50/90 to-indigo-50/90 dark:from-blue-950/40 dark:to-indigo-950/40 border border-blue-200 dark:border-blue-800 flex flex-col gap-3 shadow-2xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="font-extrabold text-sm text-slate-900 dark:text-white">
                      Calendario Vinculado: {GOOGLE_CALENDAR_CONFIG.calName}
                    </span>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                    Sincronización en Directo
                  </span>
                </div>

                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  Tu dirección pública iCal de Google Calendar está configurada en la aplicación. Puedes pulsar el botón inferior en cualquier momento para obtener y actualizar todas tus clases, horarios de aulas y defensas automáticamente.
                </p>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    onClick={handleLiveSync}
                    disabled={isSyncingLive}
                    className="py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-600/30 transition cursor-pointer flex items-center justify-center gap-2 active:scale-95 disabled:opacity-60"
                  >
                    <RefreshCw className={`w-4 h-4 ${isSyncingLive ? 'animate-spin' : ''}`} />
                    <span>{isSyncingLive ? 'Sincronizando con Google...' : 'Sincronizar Ahora en Directo'}</span>
                  </button>

                  <button
                    onClick={() => setActiveTab('embed')}
                    className="py-2.5 px-3.5 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-xs border border-slate-200 dark:border-slate-700 transition cursor-pointer flex items-center gap-1.5"
                  >
                    <Calendar className="w-3.5 h-3.5 text-blue-600" />
                    <span>Ver Iframe Oficial</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-850/40 flex flex-col justify-between gap-3">
                  <div>
                    <h4 className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5 mb-1">
                      <Download className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                      <span>Exportar a tu Google</span>
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Descarga tu calendario actual en un clic en formato .ics estándar.
                    </p>
                  </div>
                  <button
                    onClick={handleExportICS}
                    className="w-full py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-xs transition cursor-pointer flex items-center justify-center gap-1.5 active:scale-95"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Descargar .ics ({tasks.length} eventos)</span>
                  </button>
                </div>

                <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-850/40 flex flex-col justify-between gap-3">
                  <div>
                    <h4 className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5 mb-1">
                      <Upload className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      <span>2. Cargar desde Google</span>
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Sube tu archivo de Google Calendar para rellenar automáticamente todos tus horarios.
                    </p>
                  </div>
                  <button
                    onClick={() => setActiveTab('import')}
                    className="w-full py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition cursor-pointer flex items-center justify-center gap-1.5 active:scale-95"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Importar archivo .ics</span>
                  </button>
                </div>
              </div>

              {/* Quick direct links for upcoming tasks */}
              <div className="mt-2 flex flex-col gap-2">
                <h4 className="font-bold text-slate-800 dark:text-slate-200 text-xs uppercase tracking-wider">
                  Acceso directo a Google Calendar (Próximos eventos)
                </h4>
                <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto pr-1">
                  {tasks.slice(0, 4).map((t) => (
                    <div
                      key={t.id}
                      className="p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-2 bg-white dark:bg-slate-900"
                    >
                      <div className="min-w-0">
                        <p className="font-bold text-xs text-slate-900 dark:text-white truncate">{t.title}</p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          {t.date} &bull; {t.time}{t.endTime ? ` - ${t.endTime}` : ''}
                        </p>
                      </div>
                      <a
                        href={generateGoogleCalendarUrl(t)}
                        target="_blank"
                        rel="noreferrer"
                        className="px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-[11px] font-bold hover:bg-blue-100 transition flex items-center gap-1 shrink-0"
                      >
                        <span>Añadir a Google</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB: EXPORT */}
          {activeTab === 'export' && (
            <div className="flex flex-col gap-4">
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <Download className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                  <h4 className="font-bold text-slate-900 dark:text-white">Descargar tu agenda completa en .ics</h4>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  Se generará un archivo estándar compatible al 100% con <strong>Google Calendar</strong>, <strong>Apple Calendar</strong> y <strong>Outlook</strong>. Incluye todas tus clases, entrenamientos de gimnasio y entregas universitarias con sus horas exactas y notas.
                </p>
                <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Total de actividades a exportar: <span className="font-mono text-indigo-600 dark:text-indigo-400 font-bold">{tasks.length}</span>
                </div>
                <button
                  onClick={handleExportICS}
                  className="py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md shadow-indigo-600/30 transition cursor-pointer flex items-center justify-center gap-2 self-start active:scale-95"
                >
                  <Download className="w-4 h-4" />
                  <span>Descargar Archivo iCalendar (.ics)</span>
                </button>
              </div>

              <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col gap-2">
                <h5 className="font-bold text-xs text-slate-800 dark:text-slate-200">
                  Pasos para importarlo en Google Calendar:
                </h5>
                <ol className="text-xs text-slate-600 dark:text-slate-400 list-decimal pl-4 space-y-1">
                  <li>Abre <a href="https://calendar.google.com" target="_blank" rel="noreferrer" className="text-blue-600 underline font-semibold">calendar.google.com</a> en tu navegador.</li>
                  <li>Haz clic en el engranaje ⚙️ de <strong>Configuración</strong> en la esquina superior derecha.</li>
                  <li>En el menú de la izquierda, entra en <strong>Importar y exportar</strong>.</li>
                  <li>Selecciona el archivo <code>.ics</code> descargado y haz clic en <strong>Importar</strong>. ¡Listo!</li>
                </ol>
              </div>
            </div>
          )}

          {/* TAB: IMPORT */}
          {activeTab === 'import' && (
            <div className="flex flex-col gap-4">
              <input
                ref={fileInputRef}
                type="file"
                accept=".ics,text/calendar"
                onChange={handleFileChange}
                className="hidden"
              />

              <div
                onClick={() => fileInputRef.current?.click()}
                className="p-6 border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-blue-500 dark:hover:border-blue-400 rounded-2xl flex flex-col items-center justify-center gap-3 text-center cursor-pointer transition bg-slate-50/50 dark:bg-slate-850/40 hover:bg-blue-50/20"
              >
                <div className="w-12 h-12 rounded-2xl bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                  <Upload className="w-6 h-6" />
                </div>
                <div>
                  <h5 className="font-bold text-slate-900 dark:text-white text-sm">
                    {importFileName ? importFileName : 'Haz clic para seleccionar tu archivo de Google Calendar'}
                  </h5>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Formatos admitidos: <code>.ics</code> (Exportación de Google Calendar)
                  </p>
                </div>
                {isProcessingFile && (
                  <div className="flex items-center gap-2 text-xs text-blue-600 font-bold">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Analizando eventos...</span>
                  </div>
                )}
              </div>

              {importedPreview && importedPreview.length > 0 && (
                <div className="p-4 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/60 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300 font-bold text-xs">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>{importedPreview.length} eventos detectados y listos para importar</span>
                    </div>
                    <button
                      onClick={handleConfirmImport}
                      className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition cursor-pointer active:scale-95"
                    >
                      Confirmar e Importar Ahora
                    </button>
                  </div>

                  <div className="max-h-40 overflow-y-auto space-y-1.5">
                    {importedPreview.slice(0, 5).map((t, idx) => (
                      <div
                        key={idx}
                        className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800 text-xs flex items-center justify-between gap-2"
                      >
                        <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">{t.title}</span>
                        <span className="text-slate-500 shrink-0 text-[11px] font-mono">{t.date} {t.time}</span>
                      </div>
                    ))}
                    {importedPreview.length > 5 && (
                      <p className="text-center text-[11px] text-slate-500 italic">
                        y {importedPreview.length - 5} eventos más...
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB: GUIDE / API CONNECTION */}
          {activeTab === 'guide' && (
            <div className="flex flex-col gap-3.5 leading-relaxed text-xs text-slate-600 dark:text-slate-300">
              <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 flex items-start gap-3">
                <Info className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-amber-800 dark:text-amber-300 text-sm mb-1">
                    Sincronización 100% Automática en Tiempo Real
                  </h4>
                  <p className="text-xs text-amber-700 dark:text-amber-200/90 leading-relaxed">
                    Para que no tengas que importar o exportar archivos periódicamente, puedes enlazar tu cuenta de Google mediante <strong>Google Calendar API (OAuth 2.0)</strong>.
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <h5 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider">
                  Opciones para automatizar la sincronización:
                </h5>
                <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col gap-1.5">
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    A) Suscripción en Vivo por URL (iCal Feed)
                  </span>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Google Calendar permite pegar un enlace web de calendario («Desde URL»). Cualquier evento añadido aquí se refleja automáticamente en Google Calendar en tu ordenador y móvil sin tocar nada.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col gap-1.5">
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    B) Conexión Directa con Google OAuth 2.0
                  </span>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Configurando tu <code>GOOGLE_CLIENT_ID</code> y <code>GOOGLE_CLIENT_SECRET</code> en el archivo <code>.env</code>, puedes autorizar con tu cuenta de Google. La app creará y sincronizará eventos en ambos sentidos al instante.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-950/40">
          <span className="text-[11px] text-slate-400 font-medium">
            Formato universal RFC 5545 &bull; Seguro y privado
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold transition cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      </motion.div>
    </div>
  );
};
