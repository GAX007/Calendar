import React, { useState } from 'react';
import { BarChart3, Undo2, X } from 'lucide-react';
import type { RepasoSemanal } from '../../asistente/logica';
import type { ParteDelDia } from '../../hooks/useParteDelDia';
import { haptic } from '../../utils/haptics';

const num = (n: number | null) => Number((n ?? 0).toFixed(2)).toLocaleString('es-ES');
const hours = (n: number) => `${num(n)} h`;
const entregas = (n: number) => `${n} ${n === 1 ? 'entrega' : 'entregas'}`;

interface Props {
  parte: ParteDelDia;
  onOpenPlanner: () => void;
  showToast: (message: string) => void;
}

// Notices from the nightly assistant, shown only when there is something to say
export const AvisosDelDia: React.FC<Props> = ({ parte, onOpenPlanner, showToast }) => {
  const [todos, setTodos] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [verRepaso, setVerRepaso] = useState(() => new URLSearchParams(window.location.search).has('repaso'));
  const { avisos, cierre, repaso, error } = parte;

  if (!avisos.length && !cierre && !repaso && !error) return null;

  const deshacer = async () => {
    setOcupado(true);
    try {
      await parte.deshacerCierre();
      haptic(10);
      showToast('Cierre deshecho: esos bloques cuentan como hechos');
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err));
    } finally {
      setOcupado(false);
    }
  };

  const visibles = avisos.slice(0, todos ? avisos.length : 3);

  return (
    <section aria-label="Avisos" className="flex flex-col gap-3">
      {error && <p role="alert" className="text-sm rounded-2xl bg-red-50 text-red-800 px-4 py-3">{error}</p>}

      {visibles.length > 0 && (
        <ul className="flex flex-col border-t border-hairline">
          {visibles.map((a) => {
            const urgente = a.tipo === 'sin_hacer' || a.tipo === 'entrega_24h';
            return (
              <li key={a.clave} className="flex items-start gap-3 py-2.5 border-b border-hairline">
                <span className={`mt-[9px] w-2 h-2 rounded-full shrink-0 ${urgente ? 'bg-alerta' : 'bg-slate-400'}`} aria-hidden="true" />
                <button
                  type="button"
                  className="flex-1 min-w-0 text-left py-0.5"
                  onClick={() => { parte.descartarAviso(a.clave); onOpenPlanner(); }}
                >
                  <span className="block text-[15px] font-medium leading-snug">{a.titulo}</span>
                  <span className="block text-[13.5px] text-ink-2 mt-0.5 leading-snug">{a.cuerpo}</span>
                </button>
                <button
                  type="button"
                  aria-label="Descartar aviso"
                  onClick={() => parte.descartarAviso(a.clave)}
                  className="-mr-2 w-11 h-11 flex items-center justify-center rounded-full text-ink-3 hover:bg-black/5"
                >
                  <X className="w-4 h-4" strokeWidth={1.75} />
                </button>
              </li>
            );
          })}
          {!todos && avisos.length > 3 && (
            <li>
              <button type="button" onClick={() => setTodos(true)} className="min-h-11 text-sm font-semibold underline underline-offset-4">
                {avisos.length === 4 ? 'Ver 1 aviso más' : `Ver ${avisos.length - 3} avisos más`}
              </button>
            </li>
          )}
        </ul>
      )}

      {cierre && (
        <div className="rounded-2xl bg-surface px-4 py-3.5 flex flex-col gap-2.5">
          <p className="text-[14.5px] leading-[1.45] text-slate-700">
            Anoche moví {cierre.items.length === 1 ? 'un bloque que no marcaste como hecho' : `${cierre.items.length} bloques que no marcaste como hechos`} y rehíce el plan:{' '}
            {cierre.items.map((i) => `${i.titulo} (${i.inicio_local}–${i.fin_local})`).join(', ')}.
          </p>
          <button
            type="button"
            disabled={ocupado}
            onClick={() => void deshacer()}
            className="self-start h-11 px-4 rounded-full border border-line-2 bg-white text-sm font-semibold flex items-center gap-2 disabled:opacity-50"
          >
            <Undo2 className="w-4 h-4" strokeWidth={1.75} />
            {ocupado ? 'Deshaciendo…' : 'Sí los hice, deshacer'}
          </button>
        </div>
      )}

      {repaso && (
        <button
          type="button"
          onClick={() => setVerRepaso(true)}
          className="self-start h-11 px-4 rounded-full border border-line-2 bg-white text-sm font-semibold flex items-center gap-2"
        >
          <BarChart3 className="w-4 h-4" strokeWidth={1.75} /> Ver tu repaso semanal
        </button>
      )}
      {repaso && verRepaso && (
        <RepasoSheet
          repaso={repaso}
          onClose={() => {
            setVerRepaso(false);
            if (window.location.search.includes('repaso')) window.history.replaceState(null, '', window.location.pathname);
          }}
        />
      )}
    </section>
  );
};

function Dato({ etiqueta, valor, detalle }: { etiqueta: string; valor: string; detalle?: string }) {
  return (
    <div className="rounded-2xl bg-surface p-3.5">
      <p className="text-[13px] text-ink-2">{etiqueta}</p>
      <p className="text-[22px] font-semibold tracking-[-0.02em] mt-0.5">{valor}</p>
      {detalle && <p className="text-[13px] text-ink-2 mt-0.5">{detalle}</p>}
    </div>
  );
}

function RepasoSheet({ repaso, onClose }: { repaso: RepasoSemanal; onClose: () => void }) {
  const fecha = (d: string) => d.split('-').reverse().slice(0, 2).join('/');
  const c = repaso.checkins;
  return (
    <div role="dialog" aria-modal="true" aria-label="Repaso semanal" className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-ink/40" onClick={onClose}>
      <div
        className="w-full sm:max-w-lg max-h-[88vh] overflow-y-auto rounded-t-[28px] sm:rounded-3xl bg-white px-5 pt-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))] animate-subir"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sm:hidden flex justify-center pb-3" aria-hidden="true"><span className="w-9 h-[5px] rounded-full bg-line-3" /></div>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold tracking-[-0.02em]">Tu semana</h2>
            <p className="text-sm text-ink-2 mt-0.5">Del {fecha(repaso.desde)} al {fecha(repaso.hasta)}</p>
          </div>
          <button type="button" aria-label="Cerrar" onClick={onClose} className="w-11 h-11 -mr-2 flex items-center justify-center rounded-full hover:bg-black/5">
            <X className="w-5 h-5" strokeWidth={1.75} />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-5">
          <Dato etiqueta="Estudio confirmado" valor={hours(repaso.horas_hechas)} detalle={`de ${hours(repaso.horas_planificadas)} planificadas`} />
          <Dato etiqueta="Sin hacer" valor={hours(repaso.horas_no_hechas)} detalle={repaso.horas_sin_confirmar ? `${hours(repaso.horas_sin_confirmar)} sin confirmar` : undefined} />
          <Dato etiqueta="Horas reales registradas" valor={hours(repaso.horas_reales_registradas)} detalle={entregas(repaso.entregas_con_horas)} />
          <Dato etiqueta="Deuda acumulada" valor={hours(repaso.deuda_horas)} />
          <Dato
            etiqueta="Check-in medio"
            valor={c.dias ? `${num(c.energia)}/5 energía` : 'Sin check-ins'}
            detalle={c.dias ? `${num(c.sueno_h)} h de sueño · fatiga ${num(c.fatiga)}/5 · ${c.dias} ${c.dias === 1 ? 'día' : 'días'}` : undefined}
          />
          <Dato
            etiqueta="Próxima semana"
            valor={hours(repaso.proxima.horas_profundas + repaso.proxima.horas_ligeras)}
            detalle={`${hours(repaso.proxima.horas_profundas)} profundas · ${entregas(repaso.proxima.entregas.length)}${repaso.proxima.en_riesgo ? ` · ${repaso.proxima.en_riesgo} en riesgo` : ''}`}
          />
        </div>
        {repaso.calibracion.length > 0 && (
          <div className="mt-5">
            <h3 className="text-[15px] font-semibold">Lo que tardas de verdad</h3>
            <ul className="mt-1.5 space-y-1 text-sm text-slate-700">
              {repaso.calibracion.map((k) => <li key={k.asignatura}>{k.asignatura}: tus estimaciones se multiplican por {k.factor.toLocaleString('es-ES')} ({k.muestras} entregas medidas)</li>)}
            </ul>
          </div>
        )}
        {repaso.aplazadas.length > 0 && (
          <div className="mt-5">
            <h3 className="text-[15px] font-semibold">Se te acumulan</h3>
            <ul className="mt-1.5 space-y-1 text-sm text-slate-700">
              {repaso.aplazadas.map((a) => <li key={a.titulo}>{a.titulo}: aplazada {a.aplazamientos} veces</li>)}
            </ul>
          </div>
        )}
        {repaso.proxima.entregas.length > 0 && (
          <div className="mt-5">
            <h3 className="text-[15px] font-semibold">Entregas de la próxima semana</h3>
            <ul className="mt-1.5 space-y-1 text-sm text-slate-700">
              {repaso.proxima.entregas.map((e) => <li key={e.titulo + e.vence_local}>{e.titulo} · {fecha(e.vence_local.slice(0, 10))} a las {e.vence_local.slice(11, 16)}</li>)}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
