import React, { useEffect, useRef, useState } from 'react';
import { ArrowUp, Camera, Check, ChevronDown, Mic, MessageSquareText, Undo2, X } from 'lucide-react';
import type { AsistenteVoz } from '../hooks/useAsistenteVoz';
import { haptic } from '../utils/haptics';

// Assistant bar of the Hoy screen.
// Folded into a round button by default; unfolds into a text field with camera and microphone.
// While dictating the field keeps its height and older words fade out on the left; when the dictation ends
// the field grows to show the whole text before sending it. The waves float in an oval above the button.

const LS_ABIERTA = 'omni-barra-abierta';
const leerAbierta = () => { try { return localStorage.getItem(LS_ABIERTA) === '1'; } catch { return false; } };
const ALTURAS = [8, 14, 22, 12, 24, 16, 10, 18, 8];

type Fase = 'normal' | 'dictando' | 'revisando';

interface Props {
  voz: AsistenteVoz;
  // With an account the dictated sentence goes to the assistant; without one, to the task parser
  conCuenta: boolean;
  isProcessing: boolean;
  onSubmitText: (text: string, source: 'text' | 'voice') => void;
  onOpenVisionModal: () => void;
  showToast: (message: string) => void;
}

const Ondas: React.FC<{ fondo: string; barra: string; className: string }> = ({ fondo, barra, className }) => (
  <span
    aria-hidden="true"
    className={`pointer-events-none absolute bottom-[calc(100%+10px)] w-[72px] h-10 rounded-full ${fondo} shadow-[0_8px_20px_rgba(20,21,23,0.18)] flex items-center justify-center gap-[3px] animate-aparecer ${className}`}
  >
    {ALTURAS.map((h, i) => (
      <span
        key={i}
        className={`w-[3px] rounded-[2px] ${barra} animate-onda`}
        style={{ height: h, animationDuration: `${(0.7 + (i % 3) * 0.18).toFixed(2)}s`, animationDelay: `${(-0.13 * i).toFixed(2)}s` }}
      />
    ))}
  </span>
);

const Cuadrado: React.FC<{ size?: number }> = ({ size = 14 }) => (
  <span className="block rounded-[3px] bg-white" style={{ width: size, height: size }} />
);

const botonIcono = 'flex-none w-11 h-11 rounded-full flex items-center justify-center text-slate-700 hover:bg-black/5 active:scale-95 transition cursor-pointer touch-manipulation';

export const AsistenteBarra: React.FC<Props> = ({ voz, conCuenta, isProcessing, onSubmitText, onOpenVisionModal, showToast }) => {
  const [abierta, setAbierta] = useState<boolean>(leerAbierta);
  const [fase, setFase] = useState<Fase>('normal');
  const [texto, setTexto] = useState('');
  const [dictado, setDictado] = useState('');
  const prefijo = useRef('');
  const areaRef = useRef<HTMLTextAreaElement>(null);

  const cambiarAbierta = (valor: boolean) => {
    setAbierta(valor);
    try { localStorage.setItem(LS_ABIERTA, valor ? '1' : '0'); } catch { /* private mode */ }
  };

  // The reviewed text grows with its content
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [dictado, fase]);

  const dictar = async (continuar = false) => {
    haptic(10);
    prefijo.current = continuar ? dictado.trim() : '';
    setFase('dictando');
    const r = await voz.dictar();
    const completo = `${prefijo.current} ${r.texto}`.trim();
    if (r.error) showToast(r.error);
    if (completo && conCuenta && !r.cancelado) {
      // Sent by itself when the sentence ends (silence): no tap on stop or send
      setFase('normal');
      setDictado('');
      voz.enviar(completo, true);
    } else if (completo && (!r.cancelado || prefijo.current)) {
      setDictado(completo);
      setFase('revisando');
    } else {
      setFase('normal');
    }
  };

  const enviarDictado = () => {
    const t = dictado.trim();
    if (!t) return;
    haptic(10);
    setFase('normal');
    setDictado('');
    if (conCuenta) voz.enviar(t, true);
    else onSubmitText(t, 'voice');
  };

  const enviarTexto = () => {
    const t = texto.trim();
    if (!t || isProcessing) return;
    onSubmitText(t, 'text');
    setTexto('');
  };

  const zona = (contenido: React.ReactNode) => (
    <div className="fixed inset-x-0 bottom-[var(--bottom-nav-h)] z-40 bg-white md:bg-transparent pointer-events-none">
      <div className="max-w-3xl mx-auto px-4 pt-2 pb-2.5 md:pb-6 pointer-events-auto">{contenido}</div>
    </div>
  );

  // Answer panel: the day read aloud or the answer to what was said
  if (voz.modo) {
    const hablando = voz.estado === 'hablando';
    const pensando = voz.estado === 'pensando';
    // Conversation: after a question the microphone reopens by itself
    const escuchando = voz.estado === 'escuchando';
    const fraseActual = voz.frases[voz.actual] ?? voz.frases[0] ?? '';
    const ocupado = hablando || pensando || escuchando;
    return zona(
      <section
        aria-label={voz.modo === 'dia' ? 'Resumen hablado de tu día' : 'Respuesta del asistente'}
        className="relative grid grid-cols-[minmax(0,1fr)_52px] gap-3.5 items-end rounded-3xl bg-surface pl-[18px] pr-3.5 pt-4 pb-3.5 animate-subir"
      >
        <div className="min-w-0 self-center flex flex-col gap-3">
          {escuchando ? (
            <div aria-live="polite" className="flex flex-col gap-1">
              <p className="text-[13px] leading-[1.35] text-ink-2 line-clamp-2">{voz.frases.join(' ')}</p>
              <p className="text-[17px] leading-[1.42] font-semibold text-ink flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" aria-hidden="true" />
                {voz.oidoDefinitivo || (voz.pendiente ? 'Te escucho… di «sí» o «no»' : 'Te escucho…')}
              </p>
            </div>
          ) : pensando ? (
            <p className="text-[17px] leading-[1.42] text-slate-500" aria-live="polite">{voz.conversando && voz.oidoDefinitivo ? `«${voz.oidoDefinitivo}» · Pensando…` : 'Pensando…'}</p>
          ) : hablando ? (
            <p className="text-[17px] leading-[1.42] text-ink text-pretty" aria-live="polite">{fraseActual}</p>
          ) : (
            <div className="max-h-44 overflow-y-auto no-scrollbar" aria-live="polite">
              <p className="text-[17px] leading-[1.42] text-ink text-pretty">{voz.frases.join(' ')}</p>
              {voz.local && <p className="mt-1 text-xs text-ink-2">Modo básico: el asistente inteligente no responde ahora.</p>}
            </div>
          )}
          {!ocupado && (voz.pendiente || voz.ultima) && (
            <div className="flex flex-wrap gap-2">
              {voz.pendiente ? (
                <>
                  <button type="button" onClick={voz.confirmarPendiente} className="h-11 px-4 rounded-full bg-ink text-white text-sm font-semibold flex items-center gap-2 active:scale-95 transition">
                    <Check className="w-4 h-4" strokeWidth={2} /> Sí, hazlo
                  </button>
                  <button type="button" onClick={voz.descartarPendiente} className="h-11 px-4 rounded-full border border-line-2 bg-white text-sm font-semibold active:scale-95 transition">
                    No
                  </button>
                </>
              ) : voz.ultima ? (
                <button type="button" onClick={voz.deshacerAhora} className="h-11 px-4 rounded-full border border-line-2 bg-white text-sm font-semibold flex items-center gap-2 active:scale-95 transition">
                  <Undo2 className="w-4 h-4" strokeWidth={1.75} /> Deshacer «{voz.ultima.titulo}»
                </button>
              ) : null}
            </div>
          )}
        </div>
        {ocupado ? (
          <button type="button" onClick={voz.detener} aria-label={escuchando ? 'Terminar la conversación' : pensando ? 'Cancelar' : 'Parar la lectura'} className="w-[52px] h-[52px] rounded-full bg-ink flex items-center justify-center active:scale-95 transition cursor-pointer">
            <Cuadrado />
          </button>
        ) : (
          <button type="button" onClick={voz.cerrar} aria-label="Cerrar" className="w-[52px] h-[52px] rounded-full bg-white border border-line-2 flex items-center justify-center active:scale-95 transition cursor-pointer">
            <X className="w-5 h-5" strokeWidth={1.75} />
          </button>
        )}
        {hablando && <Ondas fondo="bg-accent" barra="bg-ink" className="right-1" />}
        {escuchando && <Ondas fondo="bg-ink" barra="bg-white" className="right-1" />}
      </section>
    );
  }

  // Dictating: fixed height, the newest words on the right and the older ones fading out on the left
  if (fase === 'dictando') {
    const definitivo = `${prefijo.current} ${voz.oidoDefinitivo}`.trim();
    const provisional = voz.oidoProvisional;
    const vacio = !definitivo && !provisional;
    return zona(
      <section aria-label="Dictado" className="relative flex items-center gap-0.5 h-[54px] px-[5px] rounded-full bg-surface-2 animate-subir">
        <button
          type="button"
          onClick={() => voz.cancelarDictado()}
          aria-label="Cancelar el dictado"
          className={botonIcono}
        >
          <X className="w-[19px] h-[19px]" strokeWidth={1.75} />
        </button>
        <div
          aria-live="polite"
          className="flex-1 min-w-0 h-11 pr-1.5 flex items-center justify-end overflow-hidden whitespace-nowrap [mask-image:linear-gradient(to_right,transparent_0,#000_64px)]"
        >
          <span className="flex-none text-base text-ink">
            {vacio ? <span className="text-ink-3">Te escucho…</span> : definitivo}
            {provisional && <span className="text-ink-3">{definitivo ? ' ' : ''}{provisional}</span>}
            <span aria-hidden="true" className="inline-block w-[2px] h-[18px] ml-[3px] align-[-3px] rounded-[1px] bg-ink animate-parpadeo" />
          </span>
        </div>
        <button
          type="button"
          onClick={() => voz.terminarDictado()}
          aria-label="Terminar el dictado"
          className="flex-none w-11 h-11 rounded-full bg-alerta flex items-center justify-center active:scale-95 transition cursor-pointer touch-manipulation"
        >
          <Cuadrado />
        </button>
        <Ondas fondo="bg-ink" barra="bg-accent" className="right-[-9px]" />
      </section>
    );
  }

  // Dictation finished: the field grows to read and fix the whole text
  if (fase === 'revisando') {
    return zona(
      <section aria-label="Texto dictado" className="flex flex-col gap-2 rounded-3xl bg-surface-2 pt-4 px-[5px] pb-[5px] overflow-hidden animate-crecer">
        <label htmlFor="asistente-dictado" className="sr-only">Texto dictado</label>
        <textarea
          id="asistente-dictado"
          ref={areaRef}
          rows={2}
          value={dictado}
          onChange={(e) => setDictado(e.target.value)}
          className="w-full resize-none bg-transparent px-[13px] text-[17px] leading-[1.45] text-ink outline-none"
        />
        <div className="flex items-center gap-0.5">
          <button type="button" onClick={() => { setDictado(''); setFase('normal'); voz.cancelarDictado(); }} aria-label="Descartar el texto" className={botonIcono}>
            <X className="w-[19px] h-[19px]" strokeWidth={1.75} />
          </button>
          <span className="flex-1" />
          <button type="button" onClick={() => void dictar(true)} aria-label="Seguir dictando" className={botonIcono}>
            <Mic className="w-5 h-5" strokeWidth={1.75} />
          </button>
          <button
            type="button"
            onClick={enviarDictado}
            disabled={!dictado.trim()}
            aria-label="Enviar"
            className="flex-none w-11 h-11 rounded-full bg-ink text-white flex items-center justify-center disabled:opacity-40 active:scale-95 transition cursor-pointer"
          >
            <ArrowUp className="w-[19px] h-[19px]" strokeWidth={1.75} />
          </button>
        </div>
      </section>
    );
  }

  if (abierta) {
    return zona(
      <form
        onSubmit={(e) => { e.preventDefault(); enviarTexto(); }}
        className="flex items-center gap-0.5 h-[54px] px-[5px] rounded-full bg-surface-2 animate-subir"
      >
        <button type="button" onClick={() => cambiarAbierta(false)} aria-label="Ocultar el asistente" className={botonIcono}>
          <ChevronDown className="w-5 h-5" strokeWidth={1.75} />
        </button>
        <label htmlFor="asistente-texto" className="sr-only">Añadir a la agenda</label>
        <input
          id="asistente-texto"
          type="text"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Escribe o dicta…"
          enterKeyHint="send"
          autoComplete="off"
          className="flex-1 min-w-0 h-11 px-1 bg-transparent text-base sm:text-[15px] text-ink outline-none"
        />
        {texto.trim() ? (
          <button type="submit" aria-label="Enviar" disabled={isProcessing} className="flex-none w-11 h-11 rounded-full bg-ink text-white flex items-center justify-center disabled:opacity-60 active:scale-95 transition cursor-pointer">
            {isProcessing ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <ArrowUp className="w-[19px] h-[19px]" strokeWidth={1.75} />}
          </button>
        ) : (
          <>
            <button type="button" onClick={onOpenVisionModal} aria-label="Escanear un horario con la cámara" className={botonIcono}>
              <Camera className="w-[21px] h-[21px]" strokeWidth={1.75} />
            </button>
            <button type="button" onClick={() => void dictar()} aria-label="Dictar" className="flex-none w-11 h-11 rounded-full bg-ink text-white flex items-center justify-center active:scale-95 transition cursor-pointer touch-manipulation">
              {isProcessing ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <Mic className="w-5 h-5" strokeWidth={1.75} />}
            </button>
          </>
        )}
      </form>
    );
  }

  return (
    <button
      type="button"
      onClick={() => cambiarAbierta(true)}
      aria-label="Abrir el asistente"
      className="fixed right-5 md:right-8 bottom-[calc(var(--bottom-nav-h)+1rem)] md:bottom-8 z-40 w-14 h-14 rounded-full bg-ink text-white flex items-center justify-center shadow-[0_6px_20px_rgba(20,21,23,0.22)] animate-aparecer active:scale-95 transition cursor-pointer touch-manipulation"
    >
      {isProcessing ? (
        <span className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
      ) : (
        <MessageSquareText className="w-[22px] h-[22px]" strokeWidth={1.75} />
      )}
    </button>
  );
};
