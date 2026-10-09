import React, { useEffect, useState } from 'react';
import { madridLocal } from '../planner/time';
import { needsTodayCheckin, type DailyCheckin as Checkin } from '../planner/records';
import { loadTodayCheckin, saveTodayCheckin } from '../services/plannerRecordsService';

const field = 'w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm';
export function DailyCheckin({ userId }: { userId: string; key?: string }) {
  const [today, setToday] = useState(() => madridLocal(new Date()).slice(0, 10));
  const [record, setRecord] = useState<Checkin | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(true);
  const [error, setError] = useState('');
  const [energia, setEnergia] = useState(3);
  const [sueno, setSueno] = useState('');
  const [fatiga, setFatiga] = useState(3);
  const [nota, setNota] = useState('');
  useEffect(() => {
    const timer = window.setInterval(() => setToday(madridLocal(new Date()).slice(0, 10)), 60000);
    return () => window.clearInterval(timer);
  }, []);
  const populate = (value: Checkin | null) => {
    setEnergia(value?.energia ?? 3); setSueno(value ? String(value.sueno_h) : '');
    setFatiga(value?.fatiga ?? 3); setNota(value?.nota || '');
  };
  useEffect(() => {
    let active = true;
    setLoading(true); setError(''); setRecord(null); setEditing(true); populate(null);
    loadTodayCheckin(userId, today).then(value => {
      if (!active) return;
      setRecord(value); populate(value); setEditing(!value);
    }).catch(e => { if (active) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [userId, today]);
  return <section className="space-y-3" aria-label="Check-in de hoy">
    {!loading && needsTodayCheckin(today, record) && <p className="rounded-xl bg-amber-50 dark:bg-amber-950/30 px-4 py-2 text-sm">
      Falta tu check-in de hoy. <a href="#checkin-diario-form" className="underline font-medium">Completar check-in</a>
    </p>}
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 sm:p-5">
      <div className="flex justify-between items-center gap-3"><h2 className="font-bold">Check-in de hoy</h2><span className="text-xs text-slate-500">{today.split('-').reverse().join('/')}</span></div>
      {loading && <p role="status" className="text-sm mt-2">Cargando check-in…</p>}
      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-300 mt-2">{error}</p>}
      {!loading && !editing && record ? <div className="flex items-center justify-between gap-3 flex-wrap mt-3">
        <div className="text-sm"><p>Energía: {record.energia}/5 · Sueño: {Number(record.sueno_h).toLocaleString('es-ES')} h · Fatiga física: {record.fatiga}/5</p>{record.nota && <p className="mt-1 whitespace-pre-wrap">{record.nota}</p>}</div>
        <button type="button" className="rounded-xl border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm" onClick={() => { populate(record); setEditing(true); }}>Editar check-in</button>
      </div> : !loading && <form id="checkin-diario-form" className="space-y-3 mt-3" onSubmit={async e => {
        e.preventDefault(); setSaving(true); setError('');
        try {
          const value = await saveTodayCheckin(userId, today, { energia, sueno_h: sueno.trim() ? Number(sueno) : NaN, fatiga, nota });
          setRecord(value); setEditing(false);
        } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
        finally { setSaving(false); }
      }}>
        <div className="grid sm:grid-cols-3 gap-3">
          <label className="text-sm space-y-1 block">Energía (1–5)<select className={field} value={energia} onChange={e => setEnergia(Number(e.target.value))}>{[1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}</select></label>
          <label className="text-sm space-y-1 block">Horas de sueño<input required type="number" min="0" max="16" step="0.5" className={field} value={sueno} onChange={e => setSueno(e.target.value)} /></label>
          <label className="text-sm space-y-1 block">Fatiga física (1–5)<select className={field} value={fatiga} onChange={e => setFatiga(Number(e.target.value))}>{[1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}</select></label>
        </div>
        <label className="text-sm space-y-1 block">Nota · opcional<textarea className={field} rows={2} value={nota} onChange={e => setNota(e.target.value)} /></label>
        <div className="flex gap-2"><button type="submit" disabled={saving} className="rounded-xl bg-indigo-600 text-white px-4 py-2 text-sm font-bold disabled:opacity-50">{saving ? 'Guardando…' : 'Guardar check-in'}</button>
          {record && <button type="button" disabled={saving} className="px-3 py-2 text-sm" onClick={() => setEditing(false)}>Cancelar</button>}
        </div>
      </form>}
    </div>
  </section>;
}
