import React, { useState, useEffect, useMemo, useRef } from 'react';
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
import { CompleteEntregaDialog } from './CompleteEntregaDialog';
import { completeEntrega } from '../services/plannerRecordsService';
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
  moodleSyncError,
} from '../services/moodleApiClient';

interface MoodleDeliverablesViewProps {
  showToast?: (message: string) => void;
  selectedEntregaUid?: string | null;
  onClearSelection?: () => void;
}

export const MoodleDeliverablesView: React.FC<MoodleDeliverablesViewProps> = ({
  showToast = (_msg: string) => {},
  selectedEntregaUid = null,
  onClearSelection,
}) => {
  const selectedEntregaRef = useRef<HTMLDivElement>(null);
  const [entregas, setEntregas] = useState<EntregaItem[]>([]);
  const [asignaturas, setAsignaturas] = useState<AsignaturaItem[]>([]);
  const [cambios, setCambios] = useState<CambioItem[]>([]);
  const [lastSyncLog, setLastSyncLog] = useState<SyncLogItem | null>(null);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // Filtros
  const [filtroAsignatura, setFiltroAsignatura] = useState<string>('todas');
  const [filtroEstado, setFiltroEstado] = useState<string>('pendiente');
  const [filtroEstaSemana, setFiltroEstaSemana] = useState<boolean>(false);
  const [mostrarOcultasPorGrupo, setMostrarOcultasPorGrupo] = useState<boolean>(false);

  // Modales
  const [isManualModalOpen, setIsManualModalOpen] = useState<boolean>(false);
  const [isAsignaturasModalOpen, setIsAsignaturasModalOpen] = useState<boolean>(false);
  const [editingEntrega, setEditingEntrega] = useState<EntregaItem | null>(null);
  const [completingEntrega, setCompletingEntrega] = useState<EntregaItem | null>(null);

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
      const text = err.message || 'Error al cargar datos de Moodle';
      setSyncSummary({ text, ok: false });
      showToast(text);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!selectedEntregaUid || isLoading) return;
    selectedEntregaRef.current?.focus({ preventScroll: true });
    selectedEntregaRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [selectedEntregaUid, isLoading, entregas]);

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
        const failureText = moodleSyncError(res.error);
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
    if (nuevoEstado === 'hecha') { setCompletingEntrega(entrega); return; }
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
      // El enlace del plan abre la entrega exacta, independientemente de los filtros.
      if (selectedEntregaUid) return e.uid === selectedEntregaUid;
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
  }, [entregas, mostrarOcultasPorGrupo, filtroAsignatura, filtroEstado, filtroEstaSemana, selectedEntregaUid]);

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
        text: moodleSyncError(lastSyncLog.error),
        ok: false,
      };
    }
    return null;
  }, [syncSummary, lastSyncLog]);

  const DIAS_CORTOS = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'];
  const pendientesCount = entregas.filter((e) => e.estado === 'pendiente' && !e.oculta_por_grupo && !e.borrada_en_moodle).length;
  const ultimaSync = lastSyncLog ? formatToMadridTime(lastSyncLog.fecha) : null;
  const plazoCorto = (deadlineUtc: string, estado: EntregaEstado) => {
    const meta = getRemainingTimeMeta(deadlineUtc, estado);
    if (estado === 'hecha') return { text: 'Hecha', tone: 'muted' as const };
    if (estado === 'descartada') return { text: 'Descartada', tone: 'muted' as const };
    if (meta.isOverdue) return { text: 'Vencida', tone: 'alerta' as const };
    if (meta.diffDays <= 0) return { text: 'Hoy', tone: 'accent' as const };
    if (meta.diffDays === 1) return { text: 'Mañana', tone: 'accent' as const };
    if (meta.diffDays === 2) return { text: '2 días', tone: 'accent' as const };
    return { text: `${meta.diffDays} días`, tone: 'muted' as const };
  };
  const segmentoEstado = filtroEstado === 'pendiente' ? 'pendiente' : filtroEstado === 'hecha' ? 'hecha' : 'todos';

  return (
    <div className="w-full max-w-2xl mx-auto px-5 flex flex-col gap-[22px]">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1 min-w-0">
          <span className="text-sm font-medium text-ink-2">
            {pendientesCount} {pendientesCount === 1 ? 'pendiente' : 'pendientes'}
            {ultimaSync ? ` · sincronizado ${String(ultimaSync.day).padStart(2, '0')}/${String(ultimaSync.month).padStart(2, '0')} ${ultimaSync.time}` : ''}
          </span>
          <h1 className="text-[34px] leading-[1.05] font-semibold tracking-[-0.025em]">Moodle</h1>
        </div>
        <div className="flex items-center gap-2 flex-none">
          <button
            type="button"
            onClick={handleSyncNow}
            disabled={isSyncing}
            aria-label={isSyncing ? 'Sincronizando con Moodle' : 'Sincronizar ahora con Moodle'}
            className="w-11 h-11 rounded-full bg-surface-2 flex items-center justify-center active:scale-95 transition disabled:opacity-60"
          >
            <RefreshCw className={`w-5 h-5 ${isSyncing ? 'animate-spin' : ''}`} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            onClick={() => setIsManualModalOpen(true)}
            aria-label="Añadir una entrega manual"
            className="w-11 h-11 rounded-full bg-surface-2 flex items-center justify-center active:scale-95 transition"
          >
            <Plus className="w-5 h-5" strokeWidth={1.75} />
          </button>
        </div>
      </header>

      {displaySyncSummary && !displaySyncSummary.ok && (
        <p role="alert" className="rounded-2xl bg-red-50 text-red-800 px-4 py-3 text-[14.5px]">{displaySyncSummary.text}</p>
      )}
      {syncSummary && syncSummary.ok && (
        <p role="status" className="rounded-2xl bg-surface px-4 py-3 text-[14.5px]">{syncSummary.text}</p>
      )}

      {/* Changes made by teachers since the last visit */}
      <AnimatePresence>
        {cambios.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="rounded-2xl bg-surface px-4 py-4 flex flex-col gap-3"
          >
            <div className="flex flex-col gap-1">
              <p className="text-base font-semibold flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-alerta" />
                {cambios.length === 1 ? 'Un cambio en Moodle' : `${cambios.length} cambios en Moodle`}
              </p>
              <p className="text-[14px] text-ink-2">Han cambiado fechas o títulos de tus entregas.</p>
            </div>
            <ul className="flex flex-col gap-2">
              {cambios.map((c) => {
                const entregaTarget = entregas.find((e) => e.uid === c.uid);
                const esFecha = c.campo === 'deadline_utc';
                return (
                  <li key={c.id} className="text-[14px] leading-snug">
                    <span className="font-medium">{entregaTarget?.titulo || c.uid}</span>
                    <span className="block text-ink-2">
                      {esFecha ? 'Fecha' : 'Título'}: <span className="line-through">{esFecha ? formatToMadridTime(c.antes).formatted : c.antes}</span>
                      {' → '}
                      <span className="text-ink font-medium">{esFecha ? formatToMadridTime(c.despues).formatted : c.despues}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
            <button
              type="button"
              onClick={handleDismissCambios}
              className="self-start h-11 px-4 rounded-full border border-line-2 bg-white text-sm font-semibold"
            >
              Marcar como vistos
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {completingEntrega && <CompleteEntregaDialog title={completingEntrega.titulo} onCancel={() => setCompletingEntrega(null)} onComplete={async hours => {
        await completeEntrega(completingEntrega.uid, hours);
        setEntregas(prev => prev.map(e => e.uid === completingEntrega.uid ? { ...e, estado: 'hecha' } : e));
        setCompletingEntrega(null); showToast('Entrega completada');
      }} />}

      {selectedEntregaUid ? (
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface pl-4 pr-2 py-2">
          <p className="text-[14.5px]">Entrega abierta desde tu plan</p>
          <button type="button" onClick={onClearSelection} className="h-11 px-4 rounded-full border border-line-2 bg-white text-sm font-semibold">Ver todas</button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <nav aria-label="Estado" className="grid grid-cols-3 gap-0.5 p-[3px] rounded-[15px] bg-surface-2">
            {([['pendiente', 'Pendientes'], ['hecha', 'Hechas'], ['todos', 'Todas']] as const).map(([valor, etiqueta]) => (
              <button
                key={valor}
                type="button"
                aria-pressed={segmentoEstado === valor}
                onClick={() => setFiltroEstado(valor)}
                className={`h-11 rounded-xl text-[14.5px] transition ${segmentoEstado === valor ? 'bg-white font-semibold shadow-[0_1px_2px_rgba(20,21,23,0.08)]' : 'text-ink-2 font-medium'}`}
              >
                {etiqueta}
              </button>
            ))}
          </nav>
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar -mx-5 px-5">
            <label className="sr-only" htmlFor="moodle-asignatura">Asignatura</label>
            <select
              id="moodle-asignatura"
              value={filtroAsignatura}
              onChange={(e) => setFiltroAsignatura(e.target.value)}
              className="h-11 max-w-[220px] rounded-full border border-line-2 bg-white pl-4 pr-8 text-sm font-semibold text-ink"
            >
              <option value="todas">Todas las asignaturas</option>
              {asignaturas.map((asig) => (
                <option key={asig.codigo} value={asig.codigo}>{asig.nombre}</option>
              ))}
            </select>
            <button
              type="button"
              aria-pressed={filtroEstaSemana}
              onClick={() => setFiltroEstaSemana((prev) => !prev)}
              className={`flex-none h-11 px-4 rounded-full text-sm font-semibold border transition ${filtroEstaSemana ? 'bg-ink border-ink text-white' : 'bg-white border-line-2 text-ink'}`}
            >
              Esta semana
            </button>
            {ocultasPorGrupoCount > 0 && (
              <button
                type="button"
                aria-pressed={mostrarOcultasPorGrupo}
                onClick={() => setMostrarOcultasPorGrupo((prev) => !prev)}
                className={`flex-none h-11 px-4 rounded-full text-sm font-semibold border transition ${mostrarOcultasPorGrupo ? 'bg-ink border-ink text-white' : 'bg-white border-line-2 text-ink'}`}
              >
                Otros grupos ({ocultasPorGrupoCount})
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsAsignaturasModalOpen(true)}
              className="flex-none h-11 px-4 rounded-full text-sm font-semibold text-ink-2 hover:bg-black/5 flex items-center gap-2"
            >
              <BookOpen className="w-4 h-4" strokeWidth={1.75} /> Asignaturas
            </button>
          </div>
        </div>
      )}

      <section aria-label="Entregas" className="flex flex-col border-t border-hairline">
        {isLoading ? (
          <div className="py-12 flex flex-col items-center gap-2.5 text-ink-2">
            <RefreshCw className="w-6 h-6 animate-spin" strokeWidth={1.75} />
            <p className="text-[15px]">Cargando entregas…</p>
          </div>
        ) : entregasFiltradas.length === 0 ? (
          <div className="py-12 flex flex-col items-center gap-3 text-center">
            <CalendarDays className="w-7 h-7 text-ink-2" strokeWidth={1.5} />
            <p className="text-[15px] font-medium">
              {selectedEntregaUid ? 'Esta entrega ya no está disponible.' : entregas.length > 0 ? 'Nada con estos filtros' : 'Aún no hay entregas'}
            </p>
            <p className="text-[14px] text-ink-2 max-w-xs">
              {entregas.length > 0 ? 'Cambia el estado o la asignatura para ver más.' : 'Pulsa sincronizar para importarlas desde Moodle.'}
            </p>
            {filtroAsignatura !== 'todas' && (
              <button type="button" onClick={() => setFiltroAsignatura('todas')} className="h-11 px-4 rounded-full border border-line-2 bg-white text-sm font-semibold">
                Ver todas las asignaturas
              </button>
            )}
          </div>
        ) : (
          entregasFiltradas.map((entrega) => {
            const asig = asignaturasMap.get(entrega.asignatura_codigo);
            const madrid = formatToMadridTime(entrega.deadline_utc);
            const plazo = plazoCorto(entrega.deadline_utc, entrega.estado);
            const hecha = entrega.estado === 'hecha';
            const apagada = hecha || entrega.estado === 'descartada';
            const seleccionada = entrega.uid === selectedEntregaUid;
            const diaSemana = DIAS_CORTOS[new Date(Date.UTC(madrid.year, madrid.month - 1, madrid.day)).getUTCDay()];
            const meta = [
              asig?.nombre || entrega.asignatura_codigo,
              entrega.tipo === 'cierre_cuestionario' ? 'cuestionario' : null,
              madrid.time,
              entrega.horas_est ? `~${entrega.horas_est} h` : null,
              entrega.grupo ? `grupo ${entrega.grupo}` : null,
              entrega.oculta_por_grupo ? 'otro grupo' : null,
              entrega.borrada_en_moodle ? 'retirada en Moodle' : null,
            ].filter(Boolean).join(' · ');

            return (
              <motion.div
                key={entrega.uid}
                ref={seleccionada ? selectedEntregaRef : undefined}
                tabIndex={seleccionada ? -1 : undefined}
                role={seleccionada ? 'region' : undefined}
                aria-label={seleccionada ? `Entrega seleccionada: ${entrega.titulo}` : undefined}
                layout
                className="py-3 border-b border-hairline flex flex-col gap-2"
              >
                <div className="grid grid-cols-[44px_minmax(0,1fr)_auto] gap-3 items-center">
                  <span className="flex flex-col items-center gap-px">
                    <span className="text-[11.5px] font-semibold tracking-[0.04em] text-ink-2">{diaSemana}</span>
                    <span className="text-[19px] font-semibold leading-[1.1]">{madrid.day}</span>
                  </span>
                  <button type="button" onClick={() => handleOpenEdit(entrega)} className="min-w-0 text-left flex flex-col gap-[3px] cursor-pointer">
                    <span className={`text-base leading-[1.3] font-medium ${apagada ? 'text-ink-3' : 'text-ink'} ${hecha ? 'line-through' : ''}`}>{entrega.titulo}</span>
                    <span className="text-[13.5px] leading-[1.35] text-ink-2">{meta}</span>
                  </button>
                  <span className="flex items-center gap-1">
                    <span
                      className={`px-2.5 py-1 rounded-full text-[13px] whitespace-nowrap ${
                        plazo.tone === 'accent'
                          ? 'bg-accent text-ink font-semibold'
                          : plazo.tone === 'alerta'
                          ? 'bg-red-50 text-red-800 font-semibold'
                          : 'text-ink-2 font-medium'
                      }`}
                    >
                      {plazo.text}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleToggleEstado(entrega, hecha ? 'pendiente' : 'hecha')}
                      aria-pressed={hecha}
                      aria-label={`${hecha ? 'Marcar como pendiente' : 'Marcar como hecha'}: ${entrega.titulo}`}
                      className="w-11 h-11 -mr-2 flex items-center justify-center cursor-pointer"
                    >
                      <span className={`w-[26px] h-[26px] rounded-full border-[1.5px] flex items-center justify-center text-white ${hecha ? 'bg-ink border-ink' : 'bg-white border-check'}`}>
                        {hecha && <Check className="w-3.5 h-3.5" strokeWidth={2} />}
                      </span>
                    </button>
                  </span>
                </div>
                {seleccionada && entrega.descripcion && (
                  <p className="ml-14 text-[14px] leading-[1.5] text-slate-700 whitespace-pre-wrap break-words">{entrega.descripcion}</p>
                )}
              </motion.div>
            );
          })
        )}
      </section>

      {/* MODAL: AÑADIR ENTREGA MANUAL */}
      <AnimatePresence>
        {isManualModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 ">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white border border-slate-200 rounded-3xl w-full max-w-lg p-6 shadow-2xl space-y-4"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="font-extrabold text-base text-slate-900 flex items-center gap-2">
                  <Plus className="w-5 h-5 text-indigo-600" />
                  Añadir entrega manual
                </h3>
                <button
                  type="button"
                  onClick={() => setIsManualModalOpen(false)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleCreateManual} className="space-y-4 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Título de la entrega *
                  </label>
                  <input
                    type="text"
                    required
                    value={manualTitulo}
                    onChange={(e) => setManualTitulo(e.target.value)}
                    placeholder="Ej. Memoria del proyecto final"
                    className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-200 bg-slate-50 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Asignatura *
                  </label>
                  <select
                    required
                    value={manualAsignatura}
                    onChange={(e) => setManualAsignatura(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-200 bg-slate-50 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-bold"
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
                    <label className="block font-bold text-slate-700 mb-1">
                      Fecha límite (Madrid) *
                    </label>
                    <input
                      type="date"
                      required
                      value={manualFecha}
                      onChange={(e) => setManualFecha(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-200 bg-slate-50 text-slate-900 focus:outline-none font-medium"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Hora límite (Madrid)
                    </label>
                    <input
                      type="time"
                      value={manualHora}
                      onChange={(e) => setManualHora(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-200 bg-slate-50 text-slate-900 focus:outline-none font-medium"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Descripción o notas (opcional)
                  </label>
                  <textarea
                    rows={3}
                    value={manualDescripcion}
                    onChange={(e) => setManualDescripcion(e.target.value)}
                    placeholder="Instrucciones, enlaces o detalles de entrega..."
                    className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-200 bg-slate-50 text-slate-900 focus:outline-none font-medium"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsManualModalOpen(false)}
                    className="px-4 py-2 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold transition shadow-md "
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
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 ">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white border border-slate-200 rounded-3xl w-full max-w-sm p-6 shadow-2xl space-y-4"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="font-extrabold text-sm text-slate-900">
                  Editar dificultad y estimación
                </h3>
                <button
                  type="button"
                  onClick={() => setEditingEntrega(null)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4 text-xs">
                <div>
                  <p className="font-semibold text-slate-500 mb-1">Entrega:</p>
                  <p className="font-bold text-slate-900 line-clamp-2">
                    {editingEntrega.titulo}
                  </p>
                </div>

                {/* Selector de dificultad 1-5 */}
                <div>
                  <label className="block font-bold text-slate-700 mb-2">
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
                            ? 'bg-ink text-white'
                            : 'bg-surface-2 text-slate-600 hover:bg-line'
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
                  <label className="block font-bold text-slate-700 mb-1">
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
                    className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-200 bg-slate-50 text-slate-900 focus:outline-none font-bold"
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      const e = editingEntrega;
                      setEditingEntrega(null);
                      void handleToggleEstado(e, e.estado === 'descartada' ? 'pendiente' : 'descartada');
                    }}
                    className="h-11 px-3 -ml-3 rounded-full text-sm font-semibold text-ink-2 hover:bg-black/5"
                  >
                    {editingEntrega.estado === 'descartada' ? 'Recuperar entrega' : 'Descartar entrega'}
                  </button>
                  <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingEntrega(null)}
                    className="px-4 py-2 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveEdit}
                    className="px-5 py-2 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold transition shadow-md "
                  >
                    Guardar
                  </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL: GESTIÓN DE ASIGNATURAS */}
      <AnimatePresence>
        {isAsignaturasModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 ">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white border border-slate-200 rounded-3xl w-full max-w-2xl max-h-[85vh] flex flex-col p-6 shadow-2xl space-y-4"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="font-extrabold text-base text-slate-900 flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-indigo-600" />
                  Asignaturas (Catálogo inicial editable)
                </h3>
                <button
                  type="button"
                  onClick={() => setIsAsignaturasModalOpen(false)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-2 pr-1 text-xs">
                {asignaturas.map((asig) => (
                  <div
                    key={asig.codigo}
                    className="p-3 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold px-2 py-0.5 rounded-lg bg-indigo-100 text-indigo-700 text-[11px]">
                          {asig.codigo}
                        </span>
                        {asig.cuatrimestre && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">
                            {asig.cuatrimestre}
                          </span>
                        )}
                      </div>
                      <p className="font-bold text-slate-800 mt-1 truncate">
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
                        className="px-2.5 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-700 font-bold hover:bg-slate-100 transition"
                      >
                        Editar
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end pt-2 border-t border-slate-100">
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
