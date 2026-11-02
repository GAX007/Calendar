import React, { useEffect, useState } from 'react';

// Breathing guide for the nightly decompression: 4 s inhaling through the nose, 6 s exhaling slowly
export const INHALAR_MS = 4000;
export const EXHALAR_MS = 6000;

export const GuiaRespiracion: React.FC<{ oscuro?: boolean; compacta?: boolean }> = ({ oscuro = false, compacta = false }) => {
  const [inhalando, setInhalando] = useState(true);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const fase = (inhala: boolean) => {
      setInhalando(inhala);
      timer = setTimeout(() => fase(!inhala), inhala ? INHALAR_MS : EXHALAR_MS);
    };
    fase(true);
    return () => clearTimeout(timer);
  }, []);

  const tam = compacta ? 56 : 84;
  return (
    <div className={`flex items-center gap-3 ${oscuro ? 'text-white' : 'text-ink'}`} role="status" aria-live="polite">
      <div className="relative flex-none flex items-center justify-center" style={{ width: tam, height: tam }}>
        <div className={`absolute inset-0 rounded-full ${oscuro ? 'border border-white/15' : 'border border-line-2'}`} />
        <div
          className={`rounded-full ${oscuro ? 'bg-[#4CC9F0]/35' : 'bg-agua-suave border border-agua/30'}`}
          style={{
            width: tam,
            height: tam,
            transform: `scale(${inhalando ? 1 : 0.45})`,
            transition: `transform ${inhalando ? INHALAR_MS : EXHALAR_MS}ms ease-in-out`,
          }}
        />
      </div>
      <div className="flex flex-col">
        <span className={`font-semibold ${compacta ? 'text-sm' : 'text-[15px]'}`}>{inhalando ? 'Inhala por la nariz' : 'Exhala lento'}</span>
        <span className={`text-[13px] ${oscuro ? 'text-white/60' : 'text-ink-2'}`}>{inhalando ? '4 segundos' : '6 segundos'} · activa el parasimpático</span>
      </div>
    </div>
  );
};
