import React, { useState } from 'react';
import { Share, PlusSquare, Smartphone, Download, X, Check, ArrowRight } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  // If already running as an installed standalone app, don't show the button
  if (isInstalled) {
    return null;
  }

  return (
    <>
      {/* Install Button in Header */}
      {isInstallable ? (
        <button
          id="btn-pwa-install-app"
          onClick={install}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white text-xs font-semibold shadow-md shadow-indigo-900/30 transition cursor-pointer"
          title="Instalar como app nativa"
        >
          <Download className="w-3.5 h-3.5" />
          <span className="hidden xs:inline">Instalar</span> App
        </button>
      ) : (
        <button
          id="btn-ios-pwa-guide"
          onClick={() => setShowGuide(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-indigo-500/40 bg-indigo-950/40 hover:bg-indigo-900/60 text-indigo-200 text-xs font-semibold shadow-sm transition cursor-pointer"
          title="Cómo añadir a la pantalla de inicio de iPhone"
        >
          <Smartphone className="w-3.5 h-3.5 text-indigo-400" />
          <span>Añadir a iPhone</span>
        </button>
      )}

      {/* Safari / iOS Home Screen Guide Modal */}
      {showGuide && (
        <div
          id="ios-install-guide-modal"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowGuide(false);
          }}
        >
          <div className="relative w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-5 sm:p-6 shadow-2xl text-slate-100 flex flex-col gap-4">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-white">
                    Usar como App en iPhone
                  </h3>
                  <p className="text-xs text-slate-400">
                    Acceso directo sin barras de navegación en Safari
                  </p>
                </div>
              </div>
              <button
                id="btn-close-ios-guide"
                onClick={() => setShowGuide(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* App Icon preview */}
            <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-950/60 border border-slate-800">
              <img
                src="/apple-touch-icon.png"
                alt="CalendarAsist Icon"
                className="w-12 h-12 rounded-xl shadow-md border border-indigo-500/30 object-cover"
              />
              <div className="flex flex-col">
                <span className="font-bold text-sm text-white">CalendarAsist</span>
                <span className="text-xs text-slate-400">Icono para tu pantalla de inicio</span>
              </div>
            </div>

            {/* Step by step */}
            <div className="flex flex-col gap-3 py-1">
              <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-800/40 border border-slate-800">
                <div className="w-7 h-7 rounded-lg bg-indigo-600/30 text-indigo-300 font-mono text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                  1
                </div>
                <div className="text-xs text-slate-300 leading-relaxed">
                  Abre esta página en <strong className="text-white">Safari</strong> y toca el botón de{' '}
                  <span className="inline-flex items-center gap-1 font-semibold text-indigo-300 bg-indigo-950/60 px-1.5 py-0.5 rounded border border-indigo-500/30">
                    <Share className="w-3 h-3" /> Compartir
                  </span>{' '}
                  (en la barra inferior de Safari).
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-800/40 border border-slate-800">
                <div className="w-7 h-7 rounded-lg bg-indigo-600/30 text-indigo-300 font-mono text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                  2
                </div>
                <div className="text-xs text-slate-300 leading-relaxed">
                  Desliza hacia abajo en el menú y selecciona{' '}
                  <span className="inline-flex items-center gap-1 font-semibold text-emerald-300 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-500/30">
                    <PlusSquare className="w-3 h-3" /> Añadir a la pantalla de inicio
                  </span>.
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-800/40 border border-slate-800">
                <div className="w-7 h-7 rounded-lg bg-indigo-600/30 text-indigo-300 font-mono text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                  3
                </div>
                <div className="text-xs text-slate-300 leading-relaxed">
                  Pulsa <strong className="text-white">«Añadir»</strong> en la esquina superior derecha. Se abrirá a pantalla completa como una app real.
                </div>
              </div>
            </div>

            {/* Close / Got it button */}
            <button
              id="btn-confirm-ios-guide"
              onClick={() => setShowGuide(false)}
              className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm transition cursor-pointer shadow-lg shadow-indigo-900/30"
            >
              ¡Entendido!
            </button>
          </div>
        </div>
      )}
    </>
  );
};
