import React, { useEffect, useState } from 'react';
import { madridLocal } from '../planner/time';
import { needsTodayCheckin, type DailyCheckin as Checkin } from '../planner/records';
import { loadTodayCheckin, saveTodayCheckin } from '../services/plannerRecordsService';

const field = 'w-full h-11 rounded-xl border border-line-2 bg-white px-3 text-[15px] text-ink outline-none focus:border-ink';
function Escala({ etiqueta, valor, onChange }: { etiqueta: string; valor: number; onChange: (n: number) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[13px] text-ink-2">{etiqueta}</span>
      <div role="group" aria-label={etiqueta} className="grid grid-cols-5 gap-0.5 p-[3px] rounded-[14px] bg-white border border-line">
        {[1, 2, 3, 4, 5].map(n => (
          <button key={n} type="button" aria-pressed={valor === n} onClick={() => onChange(n)}
            className={`h-10 rounded-[11px] text-[15px] transition ${valor === n ? 'bg-ink text-white font-semibold' : 'text-ink-2 font-medium'}`}>{n}</button>
        ))}
      </div>
    </div>
  );
}
export function DailyCheckin({ userId, onSaved }: { userId: string; key?: string; onSaved?: (checkin: Checkin) => void }) {
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
  const resumen = record ? `${Number(record.sueno_h).toLocaleString('es-ES')} h de sueño · energía ${record.energia}/5 · fatiga ${record.fatiga}/5` : '';
  return <section aria-label="Check-in de hoy">
    {loading && <p role="status" className="text-sm text-ink-2">Cargando check-in…</p>}
    {error && <p role="alert" className="text-sm rounded-2xl bg-red-50 text-red-800 px-4 py-3">{error}</p>}
    {!loading && !editing && record ? (
      <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface pl-4 pr-2 py-3">
        <div className="min-w-0 flex flex-col gap-[3px]">
          <span className="text-[13px] text-ink-2">Check-in de hoy</span>
          <span className="text-[15px] font-medium">{resumen}</span>
          {record.nota && <span className="text-[13.5px] text-ink-2 whitespace-pre-wrap">{record.nota}</span>}
        </div>
        <button type="button" className="flex-none h-11 px-3 rounded-full text-sm font-semibold underline underline-offset-4" onClick={() => { populate(record); setEditing(true); }}>Editar</button>
      </div>
    ) : !loading && (
      <form id="checkin-diario-form" className="rounded-2xl bg-surface p-4 flex flex-col gap-4" onSubmit={async e => {
        e.preventDefault(); setSaving(true); setError('');
        try {
          const value = await saveTodayCheckin(userId, today, { energia, sueno_h: sueno.trim() ? Number(sueno) : NaN, fatiga, nota });
          setRecord(value); setEditing(false); onSaved?.(value);
        } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
        finally { setSaving(false); }
      }}>
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-base font-semibold">{needsTodayCheckin(today, record) ? '¿Cómo estás hoy?' : 'Check-in de hoy'}</h2>
          <span className="font-mono text-[13px] text-ink-2">{today.split('-').reverse().join('/')}</span>
        </div>
        <label className="flex flex-col gap-1 text-[13px] text-ink-2">Horas de sueño<input required type="number" min="0" max="16" step="0.5" inputMode="decimal" className={field} value={sueno} onChange={e => setSueno(e.target.value)} /></label>
        <div className="grid sm:grid-cols-2 gap-3">
          <Escala etiqueta="Energía" valor={energia} onChange={setEnergia} />
          <Escala etiqueta="Fatiga física" valor={fatiga} onChange={setFatiga} />
        </div>
        <label className="flex flex-col gap-1 text-[13px] text-ink-2">Nota · opcional<textarea className={`${field} h-auto py-2.5`} rows={2} value={nota} onChange={e => setNota(e.target.value)} /></label>
        <div className="flex gap-2">
          <button type="submit" disabled={saving} className="h-11 rounded-full bg-ink px-5 text-[15px] font-semibold text-white disabled:opacity-40">{saving ? 'Guardando…' : 'Guardar'}</button>
          {record && <button type="button" disabled={saving} className="h-11 rounded-full border border-line-2 bg-white px-4 text-sm font-semibold" onClick={() => setEditing(false)}>Cancelar</button>}
        </div>
      </form>
    )}
  </section>;
}
