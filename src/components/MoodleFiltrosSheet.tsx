import React, { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import type { AsignaturaItem, EntregaItem } from '../services/moodleTypes';
import { motivoDescarte, normalizarFiltros, type FiltrosMoodle } from '../utils/moodleFiltros';

interface Props {
  filtros: FiltrosMoodle;
  asignaturas: AsignaturaItem[];
  entregas: EntregaItem[];
  onCancel: () => void;
  // Saves the filters and discards the pending deliverables they match
  onSave: (filtros: FiltrosMoodle, descartar: EntregaItem[]) => Promise<void>;
}

// "Filtros": words or whole subjects whose deliverables are discarded now and in every later sync
export const MoodleFiltrosSheet: React.FC<Props> = ({ filtros, asignaturas, entregas, onCancel, onSave }) => {
  const [palabras, setPalabras] = useState<string[]>(filtros.palabras);
  const [codigos, setCodigos] = useState<string[]>(filtros.asignaturas);
  const [nueva, setNueva] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const borrador = useMemo(() => normalizarFiltros({ palabras, asignaturas: codigos }), [palabras, codigos]);
  // Preview: pending deliverables these filters would discard right now
  const afectadas = useMemo(() => entregas.filter(e => e.estado === 'pendiente' && motivoDescarte(e, borrador)), [entregas, borrador]);

  const anadir = () => {
    const p = nueva.trim().replace(/\s+/g, ' ');
    if (p.length < 2) return;
    setPalabras(prev => prev.some(x => x.toLowerCase() === p.toLowerCase()) ? prev : [...prev, p]);
    setNueva('');
  };

  const guardar = async () => {
    setGuardando(true); setError('');
    try { await onSave(borrador, afectadas); }
    catch (err) { setError(err instanceof Error ? err.message : 'No se pudieron guardar los filtros'); setGuardando(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/40" role="dialog" aria-modal="true" aria-labelledby="moodle-filtros-titulo">
      <div className="bg-white w-full sm:max-w-md max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 id="moodle-filtros-titulo" className="text-[20px] font-semibold">Filtros</h2>
          <button type="button" onClick={onCancel} aria-label="Cerrar filtros" className="w-11 h-11 -mr-2 rounded-full flex items-center justify-center hover:bg-black/5">
            <X className="w-5 h-5" strokeWidth={1.75} />
          </button>
        </div>
        <p className="text-[14px] text-ink-2">Las entregas que coincidan se descartan ahora y en cada sincronización. Puedes restaurarlas en «Descartadas».</p>

        <section className="flex flex-col gap-2">
          <h3 className="text-[15px] font-semibold">Palabras en el título</h3>
          <div className="flex gap-2">
            <label htmlFor="moodle-filtro-palabra" className="sr-only">Nueva palabra</label>
            <input id="moodle-filtro-palabra" value={nueva} onChange={e => setNueva(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); anadir(); } }}
              placeholder="p. ej. Foroa, tutoría…" className="flex-1 min-w-0 h-11 rounded-full border border-line-2 px-4 text-[15px]" />
            <button type="button" onClick={anadir} className="h-11 px-4 rounded-full bg-surface-2 text-sm font-semibold">Añadir</button>
          </div>
          {palabras.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {palabras.map(p => (
                <li key={p}>
                  <button type="button" onClick={() => setPalabras(prev => prev.filter(x => x !== p))} aria-label={`Quitar el filtro ${p}`}
                    className="h-9 pl-3 pr-2 rounded-full bg-surface-2 text-[14px] flex items-center gap-1">
                    {p} <X className="w-4 h-4" strokeWidth={1.75} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-1">
          <h3 className="text-[15px] font-semibold">Asignaturas enteras</h3>
          {asignaturas.map(a => (
            <label key={a.codigo} className="min-h-11 flex items-center gap-3 text-[15px] cursor-pointer">
              <input type="checkbox" className="w-5 h-5" checked={codigos.includes(a.codigo)}
                onChange={e => setCodigos(prev => e.target.checked ? [...prev, a.codigo] : prev.filter(c => c !== a.codigo))} />
              <span className="min-w-0">{a.nombre} <span className="text-ink-2 text-[13px]">{a.codigo}</span></span>
            </label>
          ))}
        </section>

        <p role="status" className="rounded-2xl bg-surface px-4 py-3 text-[14.5px]">
          {afectadas.length === 0 ? 'Ahora no descartan ninguna entrega pendiente.'
            : `Descartarán ${afectadas.length} ${afectadas.length === 1 ? 'entrega pendiente' : 'entregas pendientes'}.`}
        </p>
        {error && <p role="alert" className="rounded-2xl bg-red-50 text-red-800 px-4 py-3 text-[14.5px]">{error}</p>}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="h-11 px-4 rounded-full border border-line-2 text-sm font-semibold">Cancelar</button>
          <button type="button" onClick={guardar} disabled={guardando} className="h-11 px-5 rounded-full bg-ink text-white text-sm font-semibold disabled:opacity-60">
            {guardando ? 'Guardando…' : afectadas.length ? `Guardar y descartar ${afectadas.length}` : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
};
