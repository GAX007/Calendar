import React, { useState } from 'react';
import { parseRealHours } from '../planner/records';

export function CompleteEntregaDialog({ title, onComplete, onCancel }: {
  title: string; onComplete: (hours: number | null) => Promise<void>; onCancel: () => void;
}) {
  const [hours, setHours] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <div className="fixed inset-0 z-[100] bg-ink/40 flex items-end sm:items-center justify-center sm:p-4" onClick={() => { if (!busy) onCancel(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="complete-entrega-title" onClick={e => e.stopPropagation()}
      className="w-full sm:max-w-md rounded-t-[28px] sm:rounded-3xl bg-white text-ink px-5 pt-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] flex flex-col gap-4 animate-subir">
      <div className="flex flex-col gap-1">
        <h2 id="complete-entrega-title" className="text-2xl font-semibold tracking-[-0.02em]">Entrega completada</h2>
        <p className="text-[15px] text-ink-2">{title}</p>
      </div>
      <form className="flex flex-col gap-3" onSubmit={async e => {
        e.preventDefault(); setError(''); setBusy(true);
        try { await onComplete(parseRealHours(hours)); } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
        finally { setBusy(false); }
      }}>
        <label className="flex flex-col gap-1 text-[13px] text-ink-2">Horas reales · opcional<input autoFocus type="number" min="0.25" max="24" step="0.25" inputMode="decimal" value={hours} onChange={e => setHours(e.target.value)} className="w-full h-11 rounded-xl border border-line-2 bg-white px-3 text-[15px] text-ink outline-none focus:border-ink" /></label>
        <p className="text-[13px] text-ink-2">Puedes dejarlo vacío. Completar no mueve bloques ni cambia la deuda.</p>
        {error && <p role="alert" className="text-sm rounded-2xl bg-red-50 text-red-800 px-4 py-3">{error}</p>}
        <div className="flex flex-col gap-1.5 pt-1">
          <button disabled={busy} type="submit" className="h-[52px] rounded-full bg-ink text-white text-[15px] font-semibold disabled:opacity-40">{busy ? 'Guardando…' : 'Confirmar'}</button>
          <button disabled={busy} type="button" onClick={onCancel} className="h-12 rounded-full text-[15px] font-semibold hover:bg-black/5">Cancelar</button>
        </div>
      </form>
    </section>
  </div>;
}
