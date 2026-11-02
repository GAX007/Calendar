import React, { useEffect, useRef, useState } from 'react';
import { X, Pause, Play, Video, Gauge } from 'lucide-react';
import { EJERCICIOS_VISOR } from './ejercicios';
import { crearVisor, type EstadoVisor, type Visor } from './escena';
import { GuiaRespiracion } from '../components/GuiaRespiracion';

interface Props {
  visualId: string;
  nombre: string;
  videoUrl: string;
  onClose: () => void;
}

// 3D viewer of an exercise (loaded on demand: Three.js only downloads when it opens)
const VisorEjercicio: React.FC<Props> = ({ visualId, nombre, videoUrl, onClose }) => {
  const ejercicio = EJERCICIOS_VISOR[visualId];
  const lienzo = useRef<HTMLDivElement>(null);
  const visor = useRef<Visor | null>(null);
  const [estado, setEstado] = useState<EstadoVisor>({ etiqueta: '', fase: 0, enHold: false, progreso: 0 });
  const [pausa, setPausa] = useState(false);
  const [lento, setLento] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!lienzo.current || !ejercicio) return;
    try {
      visor.current = crearVisor(lienzo.current, ejercicio, setEstado);
    } catch (err) {
      console.warn('Visor 3D no disponible:', err);
      setError(true);
    }
    return () => {
      visor.current?.destruir();
      visor.current = null;
    };
  }, [ejercicio]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => visor.current?.setPausa(pausa), [pausa]);
  useEffect(() => visor.current?.setVelocidad(lento ? 0.35 : 1), [lento]);

  // Progress bar of the long isometric holds (neck 10 s, Pallof)
  const conProgreso = Boolean(ejercicio?.progreso && !estado.enHold && (ejercicio.keyframes[estado.fase]?.dur || 0) >= 5);

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-ink/50" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Visor 3D: ${nombre}`}
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-xl h-[88dvh] sm:h-[680px] bg-[#0B1220] text-white rounded-t-[24px] sm:rounded-[24px] overflow-hidden flex flex-col animate-subir"
      >
        <header className="flex items-start justify-between gap-3 px-4 pt-4 pb-2">
          <div className="min-w-0 flex flex-col gap-0.5">
            <span className="text-[13px] text-white/55">Biomecánica · arrastra para girar</span>
            <h2 className="text-[17px] leading-[1.25] font-semibold">{nombre}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar el visor" className="flex-none w-11 h-11 -mr-2 -mt-1 rounded-full flex items-center justify-center hover:bg-white/10">
            <X className="w-5 h-5" strokeWidth={1.75} />
          </button>
        </header>

        <div className="relative flex-1 min-h-0">
          <div ref={lienzo} className="absolute inset-0" />
          {(!ejercicio || error) && (
            <div className="absolute inset-0 flex items-center justify-center px-8 text-center text-white/70 text-sm">
              {error ? 'Este dispositivo no puede mostrar gráficos 3D.' : 'Este ejercicio aún no tiene animación.'} Abre el vídeo de referencia.
            </div>
          )}
          {ejercicio && !error && (
            <>
              <div className="absolute left-3 top-2 flex flex-col gap-1.5 pointer-events-none">
                <span className="self-start px-2.5 py-1 rounded-full bg-white/10 backdrop-blur text-[13px] font-medium">{estado.etiqueta || ' '}</span>
                {conProgreso && (
                  <div className="w-40 h-1.5 rounded-full bg-white/15 overflow-hidden">
                    <div className="h-full bg-[#00F5D4]" style={{ width: `${Math.round(estado.progreso * 100)}%` }} />
                  </div>
                )}
                {ejercicio.alerta && <span className="self-start max-w-[260px] px-2.5 py-1 rounded-lg bg-[#FF3B30]/20 text-[#FFB4AE] text-[12.5px] font-medium">{ejercicio.alerta}</span>}
              </div>
              <ul className="absolute right-3 top-2 flex flex-col gap-1 text-[12px] text-white/75 pointer-events-none" aria-label="Leyenda">
                <li className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#FF3B30]" /> Foco</li>
                {ejercicio.estabilizadores.length > 0 && <li className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#00F5D4]" /> Estabiliza</li>}
                <li className="flex items-center gap-1.5"><span className="w-2.5 h-[2px] bg-[#34C759]" /> Alineación</li>
                <li className="flex items-center gap-1.5"><span className="w-2.5 h-[2px] bg-[#FFD60A]" /> Fuerza</li>
              </ul>
              {ejercicio.respiracion && (
                <div className="absolute left-3 bottom-3 rounded-2xl bg-black/35 backdrop-blur px-3 py-2">
                  <GuiaRespiracion oscuro compacta />
                </div>
              )}
            </>
          )}
        </div>

        <footer className="flex items-center gap-1 px-3 py-3 border-t border-white/10">
          {ejercicio && !error && (
            <>
              <button type="button" onClick={() => setPausa((p) => !p)} aria-label={pausa ? 'Reanudar la animación' : 'Pausar la animación'} className="w-11 h-11 rounded-full flex items-center justify-center hover:bg-white/10">
                {pausa ? <Play className="w-5 h-5" strokeWidth={1.75} /> : <Pause className="w-5 h-5" strokeWidth={1.75} />}
              </button>
              <button type="button" onClick={() => setLento((l) => !l)} aria-pressed={lento} className={`h-11 px-3 rounded-full text-sm font-semibold flex items-center gap-2 ${lento ? 'bg-white/15' : 'hover:bg-white/10'}`}>
                <Gauge className="w-4 h-4" strokeWidth={1.75} /> Lento
              </button>
            </>
          )}
          <span className="flex-1" />
          <a href={videoUrl} target="_blank" rel="noopener noreferrer" className="h-11 px-4 rounded-full bg-white text-ink text-sm font-semibold flex items-center gap-2 active:scale-95 transition">
            <Video className="w-4 h-4" strokeWidth={1.75} /> Vídeo de referencia
          </a>
        </footer>
      </div>
    </div>
  );
};

export default VisorEjercicio;
