import React, { useState } from 'react';
import { parseRealHours } from '../planner/records';

export function CompleteEntregaDialog({ title, onComplete, onCancel }: {
  title: string; onComplete: (hours: number | null) => Promise<void>; onCancel: () => void;
}) {
  const [hours, setHours] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <div className="fixed inset-0 z-[100] bg-slate-950/70 flex items-center justify-center p-4">
    <section role="dialog" aria-modal="true" aria-labelledby="complete-entrega-title" className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 p-5 space-y-3">
      <h2 id="complete-entrega-title" className="text-lg font-bold">Completar entrega</h2><p className="text-sm">{title}</p>
      <form className="space-y-3" onSubmit={async e => {
        e.preventDefault(); setError(''); setBusy(true);
        try { await onComplete(parseRealHours(hours)); } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
        finally { setBusy(false); }
      }}>
        <label className="block text-sm space-y-1">Horas reales · opcional<input autoFocus type="number" min="0.25" max="24" step="0.25" value={hours} onChange={e => setHours(e.target.value)} className="w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2" /></label>
        <p className="text-xs text-slate-500">Puedes dejarlo vacío. Completar no mueve bloques ni cambia la deuda.</p>
        {error && <p role="alert" className="text-sm text-red-600 dark:text-red-300">{error}</p>}
        <div className="flex gap-2"><button disabled={busy} type="submit" className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{busy ? 'Guardando…' : 'Confirmar completada'}</button><button disabled={busy} type="button" onClick={onCancel} className="rounded-xl border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm">Cancelar</button></div>
      </form>
    </section>
  </div>;
}
