import React, { useState } from 'react';
import { ChevronRight, Copy, Mic, Trash2 } from 'lucide-react';
import { sessionAuthHeaders } from '../lib/supabase';

interface TokenAtajo { id: string; nombre: string; creado_en: string; ultimo_uso: string | null }

async function api<T>(ruta: string, init?: RequestInit): Promise<T> {
  const res = await fetch(ruta, { ...init, headers: { 'Content-Type': 'application/json', ...(await sessionAuthHeaders()), ...(init?.headers || {}) } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Error ${res.status}`);
  return json as T;
}

const fecha = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) : 'nunca';

// "Atajo de iPhone": personal token for the lock-screen shortcut. The token is shown only once; it can be revoked.
export const AtajoIphone: React.FC<{ showToast: (m: string) => void }> = ({ showToast }) => {
  const [abierto, setAbierto] = useState(false);
  const [tokens, setTokens] = useState<TokenAtajo[] | null>(null);
  const [nuevo, setNuevo] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const cargar = async () => {
    try { setTokens((await api<{ tokens: TokenAtajo[] }>('/api/asistente/tokens')).tokens); }
    catch (err) { showToast(err instanceof Error ? err.message : String(err)); setTokens([]); }
  };
  const abrir = () => { setAbierto(a => !a); if (!tokens) void cargar(); };

  const crear = async () => {
    setOcupado(true);
    try {
      const r = await api<{ token: string }>('/api/asistente/tokens', { method: 'POST', body: JSON.stringify({ nombre: 'Atajo de iPhone' }) });
      setNuevo(r.token);
      await cargar();
    } catch (err) { showToast(err instanceof Error ? err.message : String(err)); }
    finally { setOcupado(false); }
  };

  const revocar = async (id: string) => {
    if (!window.confirm('¿Revocar este token? El atajo que lo use dejará de funcionar.')) return;
    try { await api(`/api/asistente/tokens/${id}`, { method: 'DELETE' }); await cargar(); showToast('Token revocado'); }
    catch (err) { showToast(err instanceof Error ? err.message : String(err)); }
  };

  const copiar = async () => {
    try { await navigator.clipboard.writeText(nuevo); showToast('Token copiado. Pégalo en el atajo.'); }
    catch { showToast('No se pudo copiar: mantén pulsado el token para copiarlo.'); }
  };

  return (
    <div className="border-b border-hairline">
      <button type="button" onClick={abrir} aria-expanded={abierto} className="w-full min-h-[60px] py-2.5 flex items-center justify-between gap-3 text-left cursor-pointer">
        <span className="flex items-center gap-3 min-w-0">
          <Mic className="w-5 h-5 text-ink-2 flex-none" strokeWidth={1.75} />
          <span className="min-w-0">
            <span className="block text-base font-medium">Atajo de iPhone</span>
            <span className="block text-[13px] text-ink-2">Habla con el asistente desde la pantalla de bloqueo</span>
          </span>
        </span>
        <ChevronRight className={`w-[18px] h-[18px] text-ink-3 transition-transform ${abierto ? 'rotate-90' : ''}`} strokeWidth={1.75} />
      </button>
      {abierto && (
        <div className="pb-4 flex flex-col gap-3 text-[14.5px]">
          <p className="text-ink-2">Crea un token y pégalo en el atajo «Asistente» de la app Atajos. Las instrucciones paso a paso están en docs/atajo-ios.md.</p>
          {nuevo ? (
            <div className="rounded-2xl bg-surface p-3 flex flex-col gap-2">
              <p className="font-semibold">Tu token (solo se enseña ahora):</p>
              <code className="block break-all select-all text-[13px] bg-white rounded-xl p-2 border border-line-2">{nuevo}</code>
              <div className="flex gap-2">
                <button type="button" onClick={() => void copiar()} className="h-11 px-4 rounded-full bg-ink text-white text-sm font-semibold flex items-center gap-2"><Copy className="w-4 h-4" strokeWidth={1.75} /> Copiar</button>
                <button type="button" onClick={() => setNuevo('')} className="h-11 px-4 rounded-full border border-line-2 text-sm font-semibold">Ya lo he guardado</button>
              </div>
            </div>
          ) : (
            <button type="button" disabled={ocupado} onClick={() => void crear()} className="self-start h-11 px-4 rounded-full bg-ink text-white text-sm font-semibold disabled:opacity-60">
              {ocupado ? 'Creando…' : 'Crear token para el atajo'}
            </button>
          )}
          {tokens && tokens.length > 0 && (
            <ul className="flex flex-col">
              {tokens.map(t => (
                <li key={t.id} className="min-h-11 flex items-center justify-between gap-2">
                  <span className="min-w-0">{t.nombre} <span className="text-ink-2 text-[13px]">· creado {fecha(t.creado_en)} · usado {fecha(t.ultimo_uso)}</span></span>
                  <button type="button" onClick={() => void revocar(t.id)} aria-label={`Revocar ${t.nombre}`} className="w-11 h-11 flex-none rounded-full flex items-center justify-center hover:bg-black/5">
                    <Trash2 className="w-[18px] h-[18px] text-ink-2" strokeWidth={1.75} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};
