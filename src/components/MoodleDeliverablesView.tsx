import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  RefreshCw,
  Calendar,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Plus,
  Filter,
  Eye,
  EyeOff,
  Star,
  BookOpen,
  Check,
  CalendarDays,
  FileText,
  HelpCircle,
  ArrowRight,
  Info,
  ChevronRight,
  Edit3,
  X,
} from 'lucide-react';
import {
  AsignaturaItem,
  EntregaItem,
  CambioItem,
  SyncLogItem,
  EntregaEstado,
} from '../services/moodleTypes';
import { formatToMadridTime } from '../utils/moodleIcsParser';
import {
  fetchEntregas,
  fetchAsignaturasApi,
  fetchCambiosApi,
  fetchSyncLogsApi,
  syncMoodleNow,
  updateEntregaApi,
  createManualEntregaApi,
  marcarCambiosVistosApi,
  updateAsignaturaApi,
} from '../services/moodleApiClient';

interface MoodleDeliverablesViewProps {
  showToast?: (message: string) => void;
}

export const MoodleDeliverablesView: React.FC<MoodleDeliverablesViewProps> = ({
  showToast = (_msg: string) => {},
}) => {
  const [entregas, setEntregas] = useState<EntregaItem[]>([]);
  const [asignaturas, setAsignaturas] = useState<AsignaturaItem[]>([]);
  const [cambios, setCambios] = useState<CambioItem[]>([]);
  const [lastSyncLog, setLastSyncLog] = useState<SyncLogItem | null>(null);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // Filtros
  const [filtroAsignatura, setFiltroAsignatura] = useState<string>('todas');
  const [filtroEstado, setFiltroEstado] = useState<string>('todos');
  const [filtroEstaSemana, setFiltroEstaSemana] = useState<boolean>(false);
  const [mostrarOcultasPorGrupo, setMostrarOcultasPorGrupo] = useState<boolean>(false);

  // Modales
  const [isManualModalOpen, setIsManualModalOpen] = useState<boolean>(false);
  const [isAsignaturasModalOpen, setIsAsignaturasModalOpen] = useState<boolean>(false);
  const [editingEntrega, setEditingEntrega] = useState<EntregaItem | null>(null);

  // Formulario manual
  const [manualTitulo, setManualTitulo] = useState<string>('');
  const [manualAsignatura, setManualAsignatura] = useState<string>('');
  const [manualFecha, setManualFecha] = useState<string>('');
  const [manualHora, setManualHora] = useState<string>('23:59');
  const [manualDescripcion, setManualDescripcion] = useState<string>('');

  // Edición rápida de dificultad y horas
  const [editDificultad, setEditDificultad] = useState<number | null>(null);
  const [editHorasEst, setEditHorasEst] = useState<string>('');

  const [syncSummary, setSyncSummary] = useState<{ text: string; ok: boolean } | null>(null);

  // Cargar datos
  const loadData = async () => {
    try {
      setIsLoading(true);
      const [loadedEntregas, loadedAsig, loadedCambios, loadedLogs] = await Promise.all([
        fetchEntregas({ includeOcultas: true }),
        fetchAsignaturasApi(),
        fetchCambiosApi(true),
        fetchSyncLogsApi(1),
      ]);
      setEntregas(loadedEntregas);
      setAsignaturas(loadedAsig);
      setCambios(loadedCambios);
      if (loadedLogs.length > 0) {
        setLastSyncLog(loadedLogs[0]);
      }
      if (loadedAsig.length > 0 && !manualAsignatura) {
        setManualAsignatura(loadedAsig[0].codigo);
      }
    } catch (err: any) {
      console.error('Error cargando entregas de Moodle:', err);
      showToast('Error al cargar datos de Moodle');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Botón "Sincronizar ahora"
  const handleSyncNow = async () => {
    setIsSyncing(true);
    try {
      const res = await syncMoodleNow();
      if (res.ok) {
        const summaryText = `Última sync: ${res.nuevos} nuevas, ${res.actualizados} actualizadas`;
        setSyncSummary({ text: summaryText, ok: true });
        showToast(
          `Sincronización completada: ${res.nuevos} nuevas, ${res.actualizados} actualizadas.`
        );
        await loadData();
      } else {
        let failureText = `Última sync: Falló (${res.error || 'error desconocido'})`;
        if (res.error === 'url_no_configurada') {
          failureText = 'Última sync: Falló (URL no configurada en Netlify)';
        } else if (res.error === 'descarga_fallida') {
          const httpCode = res.pasos?.descarga?.estado_http;
          failureText = `Última sync: Falló en descarga ${httpCode ? `(HTTP ${httpCode})` : ''}`.trim();
        } else if (res.error === 'contenido_invalido') {
          failureText = 'Última sync: Falló (contenido no es VCALENDAR)';
        } else if (res.pasos?.upsert?.errores && res.pasos.upsert.errores > 0) {
          failureText = `Última sync: Falló en BD (${res.pasos.upsert.errores} errores Supabase/RLS)`;
        }
        setSyncSummary({ text: failureText, ok: false });
        showToast(failureText);
      }
    } catch (err: any) {
      const errorText = `Última sync: Falló (${err.message || 'error de conexión'})`;
      setSyncSummary({ text: errorText, ok: false });
      showToast(err.message || 'Error de conexión en sincronización');
    } finally {
      setIsSyncing(false);
    }
  };

  // Marcar cambios como vistos
  const handleDismissCambios = async () => {
    try {
      await marcarCambiosVistosApi();
      setCambios([]);
      showToast('Avisos de cambios marcados como vistos');
    } catch (err) {
      console.warn('Error al marcar cambios:', err);
    }
  };

  // Guardar entrega manual
  const handleCreateManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualTitulo.trim() || !manualAsignatura || !manualFecha) {
      showToast('Por favor completa título, asignatura y fecha');
      return;
    }

    try {
      const deadlineMadrid = `${manualFecha}T${manualHora || '23:59'}:00`;
      const created = await createManualEntregaApi({
        titulo: manualTitulo.trim(),
        asignatura_codigo: manualAsignatura,
        deadline_madrid: deadlineMadrid,
        descripcion: manualDescripcion.trim(),
      });
      setEntregas((prev) => [...prev, created]);
      setIsManualModalOpen(false);
      setManualTitulo('');
      setManualDescripcion('');
      showToast('Entrega manual añadida con éxito');
    } catch (err: any) {
      showToast(err.message || 'Error al crear entrega manual');
    }
  };

  // Cambiar estado (pendiente | hecha | descartada)
  const handleToggleEstado = async (entrega: EntregaItem, nuevoEstado: EntregaEstado) => {
    try {
      const updated = await updateEntregaApi(entrega.uid, { estado: nuevoEstado });
      setEntregas((prev) => prev.map((e) => (e.uid === entrega.uid ? updated : e)));
      showToast(`Entrega marcada como ${nuevoEstado}`);
    } catch (err: any) {
      showToast(err.message || 'Error al actualizar estado');
    }
  };

  // Abrir modal de edición de dificultad y horas
  const handleOpenEdit = (entrega: EntregaItem) => {
    setEditingEntrega(entrega);
    setEditDificultad(entrega.dificultad || null);
    setEditHorasEst(entrega.horas_est ? String(entrega.horas_est) : '');
  };

  const handleSaveEdit = async () => {
    if (!editingEntrega) return;
    try {
      const horas = editHorasEst ? parseFloat(editHorasEst) : null;
      const updated = await updateEntregaApi(editingEntrega.uid, {
        dificultad: editDificultad,
        horas_est: isNaN(horas as number) ? null : horas,
      });
      setEntregas((prev) => prev.map((e) => (e.uid === editingEntrega.uid ? updated : e)));
      setEditingEntrega(null);
      showToast('Dificultad y estimación actualizadas');
    } catch (err: any) {
      showToast(err.message || 'Error al guardar cambios');
    }
  };

  // Mapa de asignaturas para lookup rápido
  const asignaturasMap = useMemo(() => {
    const map = new Map<string, AsignaturaItem>();
    asignaturas.forEach((a) => map.set(a.codigo, a));
    return map;
  }, [asignaturas]);

  // Contadores
  const ocultasPorGrupoCount = useMemo(() => {
    return entregas.filter((e) => e.oculta_por_grupo).length;
  }, [entregas]);

  // Helper de cálculo de tiempo restante y vencimiento
  const getRemainingTimeMeta = (deadlineUtc: string, estado: EntregaEstado) => {
    const now = new Date();
    const deadline = new Date(deadlineUtc);
    const diffMs = deadline.getTime() - now.getTime();
    const diffHours = Math.round(diffMs / (1000 * 60 * 60));
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

    const isOverdue = diffMs < 0;
    const isPending = estado === 'pendiente';
    const isUrgent = isOverdue && isPending;

    let text = '';
    if (isOverdue) {
      const absDays = Math.abs(diffDays);
      const absHours = Math.abs(diffHours);
      if (absDays >= 1) {
        text = `Vencida hace ${absDays} día${absDays > 1 ? 's' : ''}`;
      } else {
        text = `Vencida hace ${absHours} hora${absHours > 1 ? 's' : ''}`;
      }
    } else {
      if (diffDays === 0) {
        text = `Vence hoy (${Math.max(1, diffHours)}h)`;
      } else if (diffDays === 1) {
        text = 'Vence mañana';
      } else {
        text = `Quedan ${diffDays} días`;
      }
    }

    return {
      text,
      isOverdue,
      isUrgent,
      diffDays,
    };
  };

  // Filtrado de entregas
  const entregasFiltradas = useMemo(() => {
    const now = new Date();
    // Inicio y fin de la semana actual
    const startOfWeek = new Date(now);
    const day = startOfWeek.getDay();
    const diffToMonday = (day === 0 ? -6 : 1) - day;
    startOfWeek.setDate(startOfWeek.getDate() + diffToMonday);
    startOfWeek.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(endOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    return entregas.filter((e) => {
      // Filtro de grupo
      if (!mostrarOcultasPorGrupo && e.oculta_por_grupo) {
        return false;
      }

      // Filtro de asignatura
      if (filtroAsignatura !== 'todas' && e.asignatura_codigo !== filtroAsignatura) {
        return false;
      }

      // Filtro de estado
      if (filtroEstado !== 'todos' && e.estado !== filtroEstado) {
        return false;
      }

      // Filtro "esta semana"
      if (filtroEstaSemana) {
        const d = new Date(e.deadline_utc);
        if (d < startOfWeek || d > endOfWeek) {
          return false;
        }
      }

      return true;
    });
  }, [entregas, mostrarOcultasPorGrupo, filtroAsignatura, filtroEstado, filtroEstaSemana]);

  const displaySyncSummary = useMemo(() => {
    if (syncSummary) return syncSummary;
    if (lastSyncLog) {
      if (lastSyncLog.ok) {
        return {
          text: `Última sync: ${lastSyncLog.nuevos} nuevas, ${lastSyncLog.actualizados} actualizadas`,
          ok: true,
        };
      }
      return {
        text: `Última sync: Falló (${lastSyncLog.error || 'error'})`,
        ok: false,
      };
    }
    return null;
  }, [syncSummary, lastSyncLog]);

  return (
    <div className="w-full max-w-5xl mx-auto px-4 py-6 space-y-6">
      {/* HEADER PRINCIPAL */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-indigo-600 text-white shadow-md shadow-indigo-600/30">
              <CalendarDays className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
                Entregas de Moodle
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Sincronización ICS en tiempo real • Hora de Madrid (Europe/Madrid)
              </p>
            </div>
          </div>

          {/* Estado de última sincronización */}
          <div className="mt-3 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            {lastSyncLog ? (
              <span>
                Última sincronización:{' '}
                <strong className="text-slate-700 dark:text-slate-300">
                  {formatToMadridTime(lastSyncLog.fecha).formatted}
                </strong>
                {lastSyncLog.ok ? (
                  <span className="text-emerald-600 dark:text-emerald-400 ml-1.5 font-semibold">
                    (OK)
                  </span>
                ) : (
                  <span className="text-rose-600 dark:text-rose-400 ml-1.5 font-semibold">
                    (Fallo)
                  </span>
                )}
              </span>
            ) : (
              <span>Sin sincronizaciones registradas</span>
            )}
          </div>
        </div>

        {/* Acciones principales y aviso de sincronización */}
        <div className="flex flex-col sm:items-end gap-2">
          <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
            <button
              type="button"
              onClick={handleSyncNow}
              disabled={isSyncing}
              className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition shadow-md shadow-indigo-600/20 disabled:opacity-50 cursor-pointer active:scale-95"
              title="Sincronizar ahora con el calendario de Moodle"
            >
              <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
              {isSyncing ? 'Sincronizando...' : 'Sincronizar ahora'}
            </button>

          <button
            type="button"
            onClick={() => setIsManualModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold transition cursor-pointer active:scale-95"
            title="Añadir una entrega que no pase por Moodle"
          >
            <Plus className="w-4 h-4 text-indigo-500" />
            Añadir entrega manual
          </button>

          <button
            type="button"
            onClick={() => setIsAsignaturasModalOpen(true)}
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-2xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/60 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-medium border border-slate-200 dark:border-slate-700 transition cursor-pointer"
            title="Gestionar asignaturas"
          >
            <BookOpen className="w-3.5 h-3.5 text-slate-400" />
            Asignaturas
          </button>
        </div>

        {displaySyncSummary && (
          <div
            className={`text-[11px] font-semibold px-3 py-1 rounded-xl flex items-center gap-1.5 transition-all shadow-xs ${
              displaySyncSummary.ok
                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60'
                : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60'
            }`}
          >
            {displaySyncSummary.ok ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
            )}
            <span>{displaySyncSummary.text}</span>
          </div>
        )}
      </div>
    </div>

      {/* AVISO DE CAMBIOS SIN VER */}
      <AnimatePresence>
        {cambios.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 rounded-3xl p-5 shadow-sm space-y-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-500/20 text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-amber-900 dark:text-amber-200">
                    Aviso: Hay {cambios.length} cambio{cambios.length > 1 ? 's' : ''} detectado
                    {cambios.length > 1 ? 's' : ''} en Moodle
                  </h3>
                  <p className="text-xs text-amber-700/90 dark:text-amber-400/90">
                    Las fechas límite o los títulos de tus entregas han sido modificados por los
                    profesores en el aula virtual.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleDismissCambios}
                className="px-3 py-1.5 rounded-xl bg-amber-200/60 hover:bg-amber-200 dark:bg-amber-900/60 dark:hover:bg-amber-900 text-amber-900 dark:text-amber-200 text-xs font-bold transition cursor-pointer"
              >
                Marcar como vistos
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1">
              {cambios.map((c) => {
                const entregaTarget = entregas.find((e) => e.uid === c.uid);
                return (
                  <div
                    key={c.id}
                    className="p-3 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-amber-200/60 dark:border-amber-800/40 text-xs space-y-1"
                  >
                    <div className="font-bold text-slate-800 dark:text-slate-200 truncate">
                      {entregaTarget?.titulo || c.uid}
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-400">
                      <span className="font-semibold text-amber-700 dark:text-amber-400 uppercase">
                        {c.campo === 'deadline_utc' ? 'Fecha límite' : 'Título'}:
                      </span>
                      <span className="line-through text-slate-400">
                        {c.campo === 'deadline_utc'
                          ? formatToMadridTime(c.antes).formatted
                          : c.antes}
                      </span>
                      <ArrowRight className="w-3 h-3 text-amber-500" />
                      <span className="font-bold text-slate-900 dark:text-white">
                        {c.campo === 'deadline_utc'
                          ? formatToMadridTime(c.despues).formatted
                          : c.despues}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* BARRA DE FILTROS */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Filtro Asignatura */}
          <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/60 px-3 py-1.5 rounded-2xl border border-slate-200/80 dark:border-slate-700">
            <span className="text-slate-400 font-semibold">Asignatura:</span>
            <select
              value={filtroAsignatura}
              onChange={(e) => setFiltroAsignatura(e.target.value)}
              className="bg-transparent text-slate-800 dark:text-slate-200 font-bold focus:outline-none cursor-pointer"
            >
              <option value="todas">Todas</option>
              {asignaturas.map((asig) => (
                <option key={asig.codigo} value={asig.codigo}>
                  {asig.codigo} - {asig.nombre}
                </option>
              ))}
            </select>
          </div>

          {/* Filtro Estado */}
          <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/60 px-3 py-1.5 rounded-2xl border border-slate-200/80 dark:border-slate-700">
            <span className="text-slate-400 font-semibold">Estado:</span>
            <select
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value)}
              className="bg-transparent text-slate-800 dark:text-slate-200 font-bold focus:outline-none cursor-pointer"
            >
              <option value="todos">Todos</option>
              <option value="pendiente">Pendientes</option>
              <option value="hecha">Hechas</option>
              <option value="descartada">Descartadas</option>
            </select>
          </div>

          {/* Toggle Esta Semana */}
          <button
            type="button"
            onClick={() => setFiltroEstaSemana((prev) => !prev)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-2xl font-bold transition cursor-pointer ${
              filtroEstaSemana
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 border border-slate-200/80 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            Esta semana
          </button>
        </div>

        {/* Grupo ocultas */}
        {ocultasPorGrupoCount > 0 && (
          <button
            type="button"
            onClick={() => setMostrarOcultasPorGrupo((prev) => !prev)}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition cursor-pointer self-start md:self-auto"
          >
            {mostrarOcultasPorGrupo ? (
              <EyeOff className="w-4 h-4 text-indigo-500" />
            ) : (
              <Eye className="w-4 h-4 text-indigo-500" />
            )}
            <span>
              {mostrarOcultasPorGrupo ? 'Ocultar' : 'Ver'} {ocultasPorGrupoCount} oculta
              {ocultasPorGrupoCount > 1 ? 's' : ''} por grupo
            </span>
          </button>
        )}
      </div>

      {/* LISTA DE ENTREGAS */}
      <div className="space-y-3">
        {isLoading ? (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-12 text-center text-slate-400">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto text-indigo-500 mb-2" />
            <p className="text-sm">Cargando entregas...</p>
          </div>
        ) : entregasFiltradas.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-12 text-center text-slate-400 space-y-2">
            <CalendarDays className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600" />
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              No hay entregas para mostrar con los filtros seleccionados
            </p>
            <p className="text-xs text-slate-500">
              Prueba a cambiar los filtros o haz clic en «Sincronizar ahora».
            </p>
          </div>
        ) : (
          entregasFiltradas.map((entrega) => {
            const asig = asignaturasMap.get(entrega.asignatura_codigo);
            const timeMeta = getRemainingTimeMeta(entrega.deadline_utc, entrega.estado);
            const madrid = formatToMadridTime(entrega.deadline_utc);

            return (
              <motion.div
                key={entrega.uid}
                layout
                className={`bg-white dark:bg-slate-900 border rounded-3xl p-4 sm:p-5 transition shadow-xs ${
                  timeMeta.isUrgent
                    ? 'border-rose-300 bg-rose-50/20 dark:border-rose-900/80 dark:bg-rose-950/20'
                    : entrega.estado === 'hecha'
                    ? 'border-slate-200/70 dark:border-slate-800/60 opacity-80'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  {/* Información izquierda */}
                  <div className="space-y-2 flex-1 min-w-0">
                    {/* Badges superiores */}
                    <div className="flex items-center gap-2 flex-wrap text-[11px]">
                      {/* Asignatura */}
                      <span className="font-extrabold px-2.5 py-0.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/60">
                        {entrega.asignatura_codigo}
                      </span>
                      {asig && (
                        <span className="text-slate-500 dark:text-slate-400 font-medium truncate max-w-[200px]">
                          {asig.nombre}
                        </span>
                      )}

                      {/* Tipo */}
                      <span
                        className={`px-2 py-0.5 rounded-xl font-bold uppercase tracking-wider text-[10px] ${
                          entrega.tipo === 'cierre_cuestionario'
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                            : 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                        }`}
                      >
                        {entrega.tipo === 'cierre_cuestionario' ? 'Cuestionario' : 'Entrega'}
                      </span>

                      {/* Grupo si existe */}
                      {entrega.grupo && (
                        <span className="px-2 py-0.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold">
                          Grupo {entrega.grupo}
                        </span>
                      )}

                      {/* Oculta por grupo notice */}
                      {entrega.oculta_por_grupo && (
                        <span className="px-2 py-0.5 rounded-xl bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 font-bold text-[10px]">
                          Otro grupo
                        </span>
                      )}

                      {/* Borrada en Moodle notice */}
                      {entrega.borrada_en_moodle && (
                        <span className="px-2 py-0.5 rounded-xl bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 font-bold text-[10px]">
                          Retirada en Moodle
                        </span>
                      )}
                    </div>

                    {/* Título de la entrega */}
                    <h3
                      className={`font-bold text-sm sm:text-base text-slate-900 dark:text-white leading-snug ${
                        entrega.estado === 'hecha' ? 'line-through text-slate-400' : ''
                      }`}
                    >
                      {entrega.titulo}
                    </h3>

                    {/* Descripción expandible o extracto si existe */}
                    {entrega.descripcion && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
                        {entrega.descripcion}
                      </p>
                    )}

                    {/* Meta de fecha y estimación */}
                    <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400 flex-wrap pt-1">
                      {/* Fecha Madrid */}
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        <span className="font-semibold text-slate-700 dark:text-slate-300">
                          {madrid.formatted}
                        </span>
                        <span className="text-[10px] text-slate-400">(Madrid)</span>
                      </div>

                      {/* Tiempo restante badge */}
                      <span
                        className={`font-extrabold px-2 py-0.5 rounded-lg text-[11px] ${
                          timeMeta.isUrgent
                            ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 font-black'
                            : timeMeta.diffDays <= 2
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                            : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                        }`}
                      >
                        {timeMeta.text}
                      </span>

                      {/* Dificultad */}
                      {entrega.dificultad && (
                        <div className="flex items-center gap-1 text-amber-500 font-bold">
                          <Star className="w-3.5 h-3.5 fill-amber-500" />
                          <span>{entrega.dificultad}/5</span>
                        </div>
                      )}

                      {/* Horas estimadas */}
                      {entrega.horas_est && (
                        <div className="flex items-center gap-1 text-slate-600 dark:text-slate-400">
                          <Clock className="w-3.5 h-3.5" />
                          <span>~{entrega.horas_est}h est.</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Acciones derecha */}
                  <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 dark:border-slate-800">
                    {/* Botones de estado */}
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          handleToggleEstado(
                            entrega,
                            entrega.estado === 'hecha' ? 'pendiente' : 'hecha'
                          )
                        }
                        className={`flex items-center gap-1 px-3 py-1.5 rounded-xl font-bold text-xs transition cursor-pointer ${
                          entrega.estado === 'hecha'
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : 'bg-slate-100 hover:bg-emerald-50 dark:bg-slate-800 dark:hover:bg-emerald-950/40 text-slate-700 dark:text-slate-300 hover:text-emerald-700 dark:hover:text-emerald-300'
                        }`}
                        title={
                          entrega.estado === 'hecha'
                            ? 'Marcar como pendiente'
                            : 'Marcar como hecha'
                        }
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>{entrega.estado === 'hecha' ? 'Hecha' : 'Completar'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          handleToggleEstado(
                            entrega,
                            entrega.estado === 'descartada' ? 'pendiente' : 'descartada'
                          )
                        }
                        className={`p-1.5 rounded-xl text-xs transition cursor-pointer ${
                          entrega.estado === 'descartada'
                            ? 'bg-slate-600 text-white'
                            : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                        title={
                          entrega.estado === 'descartada'
                            ? 'Restaurar de descartadas'
                            : 'Descartar entrega'
                        }
                      >
                        <XCircle className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleOpenEdit(entrega)}
                        className="p-1.5 rounded-xl text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition cursor-pointer"
                        title="Editar dificultad y horas estimadas"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })
        )}
      </div>

      {/* MODAL: AÑADIR ENTREGA MANUAL */}
      <AnimatePresence>
        {isManualModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-lg p-6 shadow-2xl space-y-4"
            >
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <h3 className="font-extrabold text-base text-slate-900 dark:text-white flex items-center gap-2">
                  <Plus className="w-5 h-5 text-indigo-600" />
                  Añadir entrega manual
                </h3>
                <button
                  type="button"
                  onClick={() => setIsManualModalOpen(false)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleCreateManual} className="space-y-4 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Título de la entrega *
                  </label>
                  <input
                    type="text"
                    required
                    value={manualTitulo}
                    onChange={(e) => setManualTitulo(e.target.value)}
                    placeholder="Ej. Memoria del proyecto final"
                    className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Asignatura *
                  </label>
                  <select
                    required
                    value={manualAsignatura}
                    onChange={(e) => setManualAsignatura(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-bold"
                  >
                    {asignaturas.map((asig) => (
                      <option key={asig.codigo} value={asig.codigo}>
                        {asig.codigo} - {asig.nombre}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Fecha límite (Madrid) *
                    </label>
                    <input
                      type="date"
                      required
                      value={manualFecha}
                      onChange={(e) => setManualFecha(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none font-medium"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Hora límite (Madrid)
                    </label>
                    <input
                      type="time"
                      value={manualHora}
                      onChange={(e) => setManualHora(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none font-medium"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Descripción o notas (opcional)
                  </label>
                  <textarea
                    rows={3}
                    value={manualDescripcion}
                    onChange={(e) => setManualDescripcion(e.target.value)}
                    placeholder="Instrucciones, enlaces o detalles de entrega..."
                    className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none font-medium"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsManualModalOpen(false)}
                    className="px-4 py-2 rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold transition"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold transition shadow-md shadow-indigo-600/20"
                  >
                    Guardar entrega
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL: EDITAR DIFICULTAD Y HORAS */}
      <AnimatePresence>
        {editingEntrega && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-sm p-6 shadow-2xl space-y-4"
            >
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <h3 className="font-extrabold text-sm text-slate-900 dark:text-white">
                  Editar dificultad y estimación
                </h3>
                <button
                  type="button"
                  onClick={() => setEditingEntrega(null)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4 text-xs">
                <div>
                  <p className="font-semibold text-slate-500 mb-1">Entrega:</p>
                  <p className="font-bold text-slate-900 dark:text-white line-clamp-2">
                    {editingEntrega.titulo}
                  </p>
                </div>

                {/* Selector de dificultad 1-5 */}
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-2">
                    Dificultad (1 a 5 estrellas):
                  </label>
                  <div className="flex items-center gap-2">
                    {[1, 2, 3, 4, 5].map((val) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setEditDificultad(val)}
                        className={`w-9 h-9 rounded-2xl flex items-center justify-center font-bold text-sm transition cursor-pointer ${
                          editDificultad === val
                            ? 'bg-amber-500 text-white shadow-md shadow-amber-500/30'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-amber-100'
                        }`}
                      >
                        {val}
                      </button>
                    ))}
                    {editDificultad !== null && (
                      <button
                        type="button"
                        onClick={() => setEditDificultad(null)}
                        className="text-[11px] text-slate-400 hover:text-slate-600 ml-2"
                      >
                        Limpiar
                      </button>
                    )}
                  </div>
                </div>

                {/* Horas estimadas */}
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Horas estimadas de trabajo:
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    max="100"
                    value={editHorasEst}
                    onChange={(e) => setEditHorasEst(e.target.value)}
                    placeholder="Ej. 3 o 4.5"
                    className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none font-bold"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setEditingEntrega(null)}
                    className="px-4 py-2 rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold transition"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveEdit}
                    className="px-5 py-2 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold transition shadow-md shadow-indigo-600/20"
                  >
                    Guardar
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL: GESTIÓN DE ASIGNATURAS */}
      <AnimatePresence>
        {isAsignaturasModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-2xl max-h-[85vh] flex flex-col p-6 shadow-2xl space-y-4"
            >
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <h3 className="font-extrabold text-base text-slate-900 dark:text-white flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-indigo-600" />
                  Asignaturas (Catálogo inicial editable)
                </h3>
                <button
                  type="button"
                  onClick={() => setIsAsignaturasModalOpen(false)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-2 pr-1 text-xs">
                {asignaturas.map((asig) => (
                  <div
                    key={asig.codigo}
                    className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold px-2 py-0.5 rounded-lg bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 text-[11px]">
                          {asig.codigo}
                        </span>
                        {asig.cuatrimestre && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                            {asig.cuatrimestre}
                          </span>
                        )}
                      </div>
                      <p className="font-bold text-slate-800 dark:text-slate-200 mt-1 truncate">
                        {asig.nombre}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          const nuevoNombre = window.prompt(
                            `Nuevo nombre para ${asig.codigo}:`,
                            asig.nombre
                          );
                          if (nuevoNombre && nuevoNombre.trim()) {
                            try {
                              const updated = await updateAsignaturaApi(asig.codigo, {
                                nombre: nuevoNombre.trim(),
                              });
                              setAsignaturas((prev) =>
                                prev.map((a) => (a.codigo === asig.codigo ? updated : a))
                              );
                              showToast('Asignatura actualizada');
                            } catch (err: any) {
                              showToast(err.message || 'Error al actualizar');
                            }
                          }
                        }}
                        className="px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 font-bold hover:bg-slate-100 transition"
                      >
                        Editar
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAsignaturasModalOpen(false)}
                  className="px-5 py-2 rounded-2xl bg-indigo-600 text-white font-bold"
                >
                  Cerrar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
