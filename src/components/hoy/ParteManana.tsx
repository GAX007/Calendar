import React, { useState } from 'react';
import { ChevronDown, Leaf } from 'lucide-react';
import type { ParteDelDia } from '../../hooks/useParteDelDia';
import { cuandoVence } from '../../asistente/logica';
import { ejecutarTarea } from '../../services/asistenteService';
import { haptic } from '../../utils/haptics';

const num = (n: number | null) => Number((n ?? 0).toFixed(2)).toLocaleString('es-ES');
const hours = (n: number) => `${num(n)} h`;

interface Props {
  parte: ParteDelDia;
  hoy: string;
  showToast: (message: string) => void;
}

// Morning report of the nightly assistant: light-day note, full detail and "prepare it now" when it is missing
export function ParteManana({ parte, hoy, showToast }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [preparando, setPreparando] = useState(false);
  const r = parte.resumen;

  const preparar = async () => {
    setPreparando(true);
    try {
      await ejecutarTarea('parte');
      await parte.recargar();
      haptic(10);
      showToast('Parte de hoy preparado');
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err));
    } finally {
      setPreparando(false);
    }
  };

  if (!r) {
    return (
      <div className="flex items-center justify-between gap-3 flex-wrap rounded-2xl bg-surface px-4 py-3">
        <p className="text-[14.5px] text-ink-2">El parte se prepara cada mañana a las 07:00.</p>
        <button type="button" disabled={preparando} onClick={() => void preparar()}
          className="h-10 px-4 rounded-full border border-line-2 bg-white text-sm font-semibold disabled:opacity-50 active:scale-95 transition">
          {preparando ? 'Preparando…' : 'Prepararlo ahora'}
        </button>
      </div>
    );
  }

  const listas = [
    { titulo: 'Clases y horarios', vacio: 'Nada fijo hoy.', items: r.clases.map(c => `${c.inicio}–${c.fin} · ${c.titulo}`) },
    { titulo: 'Estudio', vacio: 'Sin bloques de estudio.', items: r.bloques.map(b => `${b.inicio}–${b.fin} · ${b.titulo}`) },
    { titulo: 'Entregas en 72 h', vacio: 'Ninguna.', items: r.entregas.map(e => `${e.titulo} · ${cuandoVence(e.vence_local, hoy)} · ${hours(e.horas_planificadas)} planificadas`) },
    { titulo: 'En riesgo', vacio: 'Nada en riesgo.', items: r.en_riesgo.map(x => `${x.titulo} · faltan ${hours(x.horas_pendientes)}`) },
  ];

  return (
    <section aria-label="Parte de la mañana" className="flex flex-col gap-2">
      {r.texto.length > 220 && <p className="text-[15px] leading-[1.45] text-ink-2 text-pretty">{r.texto}</p>}
      {r.dia_ligero && (
        <p className="self-start flex items-center gap-2 rounded-full bg-surface px-3 py-1.5 text-[13.5px] font-medium">
          <Leaf className="w-4 h-4" strokeWidth={1.75} /> Hoy es un día ligero: menos trabajo profundo.
        </p>
      )}
      <button type="button" aria-expanded={abierto} onClick={() => setAbierto(a => !a)}
        className="self-start -ml-3 h-11 px-3 rounded-full text-sm font-semibold flex items-center gap-1.5 hover:bg-black/5">
        Ver el parte de la mañana
        <ChevronDown className={`w-4 h-4 transition-transform ${abierto ? 'rotate-180' : ''}`} strokeWidth={1.75} />
      </button>
      {abierto && (
        <div className="rounded-2xl bg-surface px-4 py-3 flex flex-col gap-3">
          <div className="grid sm:grid-cols-2 gap-3">
            {listas.map(l => (
              <div key={l.titulo}>
                <h3 className="text-[13px] font-semibold text-ink-2 mb-1">{l.titulo}</h3>
                {l.items.length
                  ? <ul className="flex flex-col gap-1 text-[14px]">{l.items.map(i => <li key={i}>{i}</li>)}</ul>
                  : <p className="text-[14px] text-ink-2">{l.vacio}</p>}
              </div>
            ))}
          </div>
          <p className="text-[13px] text-ink-2">Deuda acumulada: {hours(r.deuda_horas)}</p>
        </div>
      )}
    </section>
  );
}
