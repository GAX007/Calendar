import { useCallback, useEffect, useState } from 'react';
import type { ItemCierre, RepasoSemanal, ResumenManana } from '../asistente/logica';
import { addMinutesLocal, avisosVisibles } from '../asistente/logica';
import { addDays, madridLocal } from '../planner/time';
import {
  ASISTENTE_ACTUALIZADO, actualizarBadge, cargarAvisos, cargarCierre, cargarRepasoReciente, cargarResumen,
  deshacerCierre as deshacerCierreServicio, marcarAvisoLeido, type AvisoGuardado, type CierreGuardado,
} from '../services/asistenteService';

// Morning report, notices, last night's close and the weekly review prepared by the nightly assistant
export interface ParteDelDia {
  resumen: ResumenManana | null;
  avisos: AvisoGuardado[];
  cierre: CierreGuardado | null;
  cierreItems: ItemCierre[];
  repaso: RepasoSemanal | null;
  error: string;
  descartarAviso: (clave: string) => void;
  deshacerCierre: () => Promise<void>;
  recargar: () => Promise<void>;
}

export function useParteDelDia(userId?: string): ParteDelDia {
  const [resumen, setResumen] = useState<ResumenManana | null>(null);
  const [cierre, setCierre] = useState<CierreGuardado | null>(null);
  const [avisos, setAvisos] = useState<AvisoGuardado[]>([]);
  const [repaso, setRepaso] = useState<RepasoSemanal | null>(null);
  const [error, setError] = useState('');

  const recargar = useCallback(async () => {
    if (!userId) { setResumen(null); setCierre(null); setAvisos([]); setRepaso(null); return; }
    const ahora = madridLocal(new Date()), hoy = ahora.slice(0, 10);
    try {
      const [r, c, a, s] = await Promise.all([
        cargarResumen(userId, hoy, 'manana'), cargarCierre(userId, addDays(hoy, -1)), cargarAvisos(userId),
        cargarRepasoReciente(userId, addDays(hoy, -3)),
      ]);
      setResumen(r); setCierre(c); setAvisos(avisosVisibles(a, Date.now())); setRepaso(s); setError('');
      if (r) actualizarBadge(r.entregas.filter(e => e.vence_local > ahora && e.vence_local <= addMinutesLocal(ahora, 48 * 60)).length);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [userId]);

  useEffect(() => {
    void recargar();
    const onVisible = () => { if (document.visibilityState === 'visible') void recargar(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener(ASISTENTE_ACTUALIZADO, recargar);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener(ASISTENTE_ACTUALIZADO, recargar);
    };
  }, [recargar]);

  const descartarAviso = useCallback((clave: string) => {
    setAvisos(prev => prev.filter(a => a.clave !== clave));
    if (userId) void marcarAvisoLeido(userId, clave).catch(() => undefined);
  }, [userId]);

  const cierreAplicado = cierre?.estado === 'aplicado' && cierre.items.length > 0 ? cierre : null;

  const deshacerCierre = useCallback(async () => {
    if (!cierreAplicado) return;
    await deshacerCierreServicio(cierreAplicado.fecha);
    await recargar();
  }, [cierreAplicado, recargar]);

  return {
    resumen, avisos, cierre: cierreAplicado, cierreItems: cierreAplicado?.items || [], repaso, error,
    descartarAviso, deshacerCierre, recargar,
  };
}
