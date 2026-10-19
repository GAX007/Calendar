import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Bell, Calendar, Camera, ChevronRight, Download, Droplets, LogIn, LogOut, Minus, Plus, RefreshCw, Volume2, X } from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import { useHydrationTracker } from '../hooks/useHydrationTracker';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { activarPush, desactivarPush, estadoPush, type EstadoPush } from '../services/asistenteService';
import { esperarVoces, guardarPreferenciasVoz, preferenciasVoz, vozDisponible } from '../utils/voz';
import { AtajoIphone } from './AtajoIphone';

const VELOCIDADES = [{ v: 0.9, label: 'Lenta' }, { v: 1, label: 'Normal' }, { v: 1.15, label: 'Rápida' }];

interface Props {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  iniciales: string;
  dateStr: string;
  signOut: () => void;
  onOpenLinkCalendarModal: () => void;
  onOpenVisionModal: () => void;
  onCheckUpdates: () => void;
  showToast: (message: string) => void;
}

const fila = 'w-full min-h-[60px] py-2.5 flex items-center justify-between gap-3 text-left border-b border-hairline cursor-pointer';
const litros = (n: number) => (Math.round(n * 100) / 100).toLocaleString('es-ES', { maximumFractionDigits: 2 });

// Account and settings (replaces the side drawer)
export const CuentaSheet: React.FC<Props> = ({
  isOpen, onClose, user, iniciales, dateStr, signOut, onOpenLinkCalendarModal, onOpenVisionModal, onCheckUpdates, showToast,
}) => {
  const agua = useHydrationTracker(dateStr);
  const { isInstallable, isInstalled, install } = usePWAInstall();
  const [push, setPush] = useState<EstadoPush>('no_soportado');
  const [pushOcupado, setPushOcupado] = useState(false);
  const [pref, setPref] = useState(preferenciasVoz);
  const [voces, setVoces] = useState<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    if (user) estadoPush().then(setPush).catch(() => setPush('no_soportado'));
    if (vozDisponible()) void esperarVoces().then(setVoces);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prevOverflow; window.removeEventListener('keydown', onKey); };
  }, [isOpen, user, onClose]);

  const cambiarPush = async () => {
    setPushOcupado(true);
    try {
      if (push === 'activo') { await desactivarPush(); showToast('Avisos desactivados'); }
      else { await activarPush(); showToast('Avisos activados en este dispositivo'); }
      setPush(await estadoPush());
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err));
    } finally {
      setPushOcupado(false);
    }
  };

  const cambiarVoz = (p: { vozURI?: string | null; velocidad?: number }) => { guardarPreferenciasVoz(p); setPref(preferenciasVoz()); };
  const accion = (fn: () => void) => () => { onClose(); fn(); };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[90] flex items-end sm:items-start sm:justify-end">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            className="absolute inset-0 bg-ink/40"
          />
          <motion.section
            role="dialog"
            aria-modal="true"
            aria-label="Cuenta y ajustes"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 340 }}
            className="relative w-full sm:w-[400px] sm:m-4 max-h-[90dvh] overflow-y-auto rounded-t-[28px] sm:rounded-3xl bg-white px-5 pt-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))]"
          >
            <div className="sm:hidden flex justify-center pb-3" aria-hidden="true"><span className="w-9 h-[5px] rounded-full bg-line-3" /></div>

            <div className="flex items-center justify-between gap-3 pb-4">
              <div className="flex items-center gap-3 min-w-0">
                <span className="flex-none w-12 h-12 rounded-full bg-surface-2 flex items-center justify-center font-semibold">{iniciales}</span>
                <div className="min-w-0">
                  <p className="text-[17px] font-semibold truncate">{user?.user_metadata?.full_name || (user ? 'Tu cuenta' : 'Modo invitado')}</p>
                  <p className="text-[13.5px] text-ink-2 truncate">{user?.email || 'Sin sincronizar con la nube'}</p>
                </div>
              </div>
              <button type="button" onClick={onClose} aria-label="Cerrar" className="flex-none w-11 h-11 -mr-2 rounded-full flex items-center justify-center hover:bg-black/5">
                <X className="w-5 h-5" strokeWidth={1.75} />
              </button>
            </div>

            <div className="flex flex-col border-t border-hairline">
              <button type="button" className={fila} onClick={accion(onOpenLinkCalendarModal)}>
                <span className="flex items-center gap-3"><Calendar className="w-5 h-5 text-ink-2" strokeWidth={1.75} /><span className="text-base font-medium">Mi Google Calendar</span></span>
                <ChevronRight className="w-[18px] h-[18px] text-ink-3" strokeWidth={1.75} />
              </button>
              <button type="button" className={fila} onClick={accion(onOpenVisionModal)}>
                <span className="flex items-center gap-3"><Camera className="w-5 h-5 text-ink-2" strokeWidth={1.75} /><span className="text-base font-medium">Escanear un horario</span></span>
                <ChevronRight className="w-[18px] h-[18px] text-ink-3" strokeWidth={1.75} />
              </button>

              {user && push !== 'no_soportado' && (
                <div className={fila}>
                  <span className="flex items-center gap-3 min-w-0">
                    <Bell className="w-5 h-5 text-ink-2 flex-none" strokeWidth={1.75} />
                    <span className="min-w-0">
                      <span className="block text-base font-medium">Avisos</span>
                      {push === 'requiere_instalar' && <span className="block text-[13px] text-ink-2">Instala la app en la pantalla de inicio para recibirlos</span>}
                      {push === 'denegado' && <span className="block text-[13px] text-ink-2">Bloqueados en los ajustes del navegador</span>}
                    </span>
                  </span>
                  {(push === 'activo' || push === 'inactivo') && (
                    <button
                      type="button"
                      role="switch"
                      aria-checked={push === 'activo'}
                      aria-label="Avisos en este dispositivo"
                      disabled={pushOcupado}
                      onClick={() => void cambiarPush()}
                      className={`flex-none w-[52px] h-8 rounded-full p-1 transition disabled:opacity-50 ${push === 'activo' ? 'bg-ink' : 'bg-line-3'}`}
                    >
                      <span className={`block w-6 h-6 rounded-full bg-white transition-transform ${push === 'activo' ? 'translate-x-5' : ''}`} />
                    </button>
                  )}
                </div>
              )}

              {user && <AtajoIphone showToast={showToast} />}

              <div className={fila}>
                <span className="flex items-center gap-3"><Droplets className="w-5 h-5 text-ink-2" strokeWidth={1.75} /><span className="text-base font-medium">Objetivo de agua</span></span>
                <span className="flex items-center gap-1">
                  <button type="button" aria-label="Bajar 250 ml" onClick={() => agua.setGoal(Math.max(0.5, Math.round((agua.goalLiters - 0.25) * 100) / 100))} className="w-11 h-11 rounded-full flex items-center justify-center hover:bg-black/5">
                    <Minus className="w-4 h-4" strokeWidth={1.75} />
                  </button>
                  <span className="font-mono text-sm w-14 text-center">{litros(agua.goalLiters)} L</span>
                  <button type="button" aria-label="Subir 250 ml" onClick={() => agua.setGoal(Math.min(6, Math.round((agua.goalLiters + 0.25) * 100) / 100))} className="w-11 h-11 rounded-full flex items-center justify-center hover:bg-black/5">
                    <Plus className="w-4 h-4" strokeWidth={1.75} />
                  </button>
                </span>
              </div>

              {vozDisponible() && (
                <div className="py-3 border-b border-hairline flex flex-col gap-3">
                  <span className="flex items-center gap-3"><Volume2 className="w-5 h-5 text-ink-2" strokeWidth={1.75} /><span className="text-base font-medium">Voz del asistente</span></span>
                  <div role="group" aria-label="Velocidad" className="grid grid-cols-3 gap-0.5 p-[3px] rounded-[15px] bg-surface-2">
                    {VELOCIDADES.map((o) => (
                      <button
                        key={o.v}
                        type="button"
                        aria-pressed={pref.velocidad === o.v}
                        onClick={() => cambiarVoz({ velocidad: o.v })}
                        className={`h-10 rounded-xl text-sm transition ${pref.velocidad === o.v ? 'bg-white font-semibold shadow-[0_1px_2px_rgba(20,21,23,0.08)]' : 'text-ink-2 font-medium'}`}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                  {voces.length > 1 && (
                    <label className="flex flex-col gap-1">
                      <span className="text-[13px] text-ink-2">Voz</span>
                      <select
                        value={pref.vozURI || ''}
                        onChange={(e) => cambiarVoz({ vozURI: e.target.value || null })}
                        className="min-h-11 rounded-xl border border-line-2 bg-white px-3 text-sm"
                      >
                        <option value="">Automática ({voces[0].name})</option>
                        {voces.map((v) => <option key={v.voiceURI} value={v.voiceURI}>{v.name} · {v.lang}</option>)}
                      </select>
                    </label>
                  )}
                </div>
              )}

              {isInstallable && !isInstalled && (
                <button type="button" className={fila} onClick={() => void install()}>
                  <span className="flex items-center gap-3"><Download className="w-5 h-5 text-ink-2" strokeWidth={1.75} /><span className="text-base font-medium">Instalar la app</span></span>
                  <ChevronRight className="w-[18px] h-[18px] text-ink-3" strokeWidth={1.75} />
                </button>
              )}

              <button type="button" className={fila} onClick={accion(onCheckUpdates)}>
                <span className="flex items-center gap-3"><RefreshCw className="w-5 h-5 text-ink-2" strokeWidth={1.75} /><span className="text-base font-medium">Buscar actualizaciones</span></span>
                <ChevronRight className="w-[18px] h-[18px] text-ink-3" strokeWidth={1.75} />
              </button>
            </div>

            <button
              type="button"
              onClick={accion(signOut)}
              className="mt-5 w-full h-12 rounded-full border border-line-2 bg-white text-[15px] font-semibold flex items-center justify-center gap-2"
            >
              {user ? <LogOut className="w-[18px] h-[18px]" strokeWidth={1.75} /> : <LogIn className="w-[18px] h-[18px]" strokeWidth={1.75} />}
              {user ? 'Cerrar sesión' : 'Iniciar sesión'}
            </button>
          </motion.section>
        </div>
      )}
    </AnimatePresence>
  );
};
