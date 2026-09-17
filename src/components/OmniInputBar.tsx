import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Camera, Keyboard, Send } from 'lucide-react';

interface OmniInputBarProps {
  onOpenVisionModal: () => void;
  onSubmitText: (text: string) => void;
  isProcessing: boolean;
}

export const OmniInputBar: React.FC<OmniInputBarProps> = ({
  onOpenVisionModal,
  onSubmitText,
  isProcessing,
}) => {
  const [inputText, setInputText] = useState<string>('');
  const [isFocused, setIsFocused] = useState<boolean>(false);

  const handleSend = () => {
    if (!inputText.trim() || isProcessing) return;
    onSubmitText(inputText);
    setInputText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSend();
    }
  };

  return (
    <div className="fixed bottom-[calc(0.75rem+env(safe-area-inset-bottom,0px))] sm:bottom-6 left-1/2 -translate-x-1/2 w-full max-w-3xl px-3 sm:px-6 z-40 pointer-events-none">
      <motion.div
        initial={{ y: 25, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="pointer-events-auto"
      >
        {/* Subtle quick trigger chip right above floating bar */}
        <div className="flex items-center justify-center gap-1.5 sm:gap-2 mb-2">
          <button
            id="chip-trigger-vision"
            onClick={onOpenVisionModal}
            className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900/90 backdrop-blur-md border border-cyan-500/30 text-cyan-300 hover:text-cyan-200 hover:bg-slate-850 text-[11px] font-semibold transition shadow-md shadow-slate-950/40 cursor-pointer active:scale-95 whitespace-nowrap"
          >
            <Camera className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <span>Escanear Foto u Horario</span>
          </button>
        </div>

        {/* The Omni-Input Bar (Clean iOS / Modern style) */}
        <div
          className={`relative rounded-2xl sm:rounded-full bg-slate-900/95 backdrop-blur-xl border transition-all duration-300 shadow-2xl ${
            isFocused
              ? 'border-indigo-500/60 ring-2 ring-indigo-500/20 shadow-indigo-950/50'
              : 'border-slate-700/70 shadow-slate-950/70 hover:border-slate-600'
          }`}
        >
          {/* Subtle bottom border shimmer */}
          <div className="absolute -inset-px rounded-2xl sm:rounded-full bg-gradient-to-r from-indigo-500/20 via-purple-500/20 to-slate-700/20 -z-10 blur-[1px] opacity-70" />

          <div className="flex items-center gap-1.5 sm:gap-2 p-1.5 sm:px-3 sm:py-2">
            {/* Action: Camera */}
            <button
              id="omni-btn-camera"
              onClick={onOpenVisionModal}
              title="Escanear foto u horario"
              className="relative w-10 h-10 sm:w-9 sm:h-9 rounded-xl sm:rounded-full text-slate-300 hover:text-cyan-400 hover:bg-cyan-500/10 active:scale-95 transition cursor-pointer flex items-center justify-center shrink-0 group"
              aria-label="Escanear foto"
            >
              <Camera className="w-5 h-5 text-cyan-400 group-hover:scale-110 transition-transform" />
              <span className="sr-only">Cámara</span>
            </button>

            {/* Action: Text input field */}
            <div className="flex-1 flex items-center gap-2 min-w-0 px-1 sm:px-2">
              <Keyboard className="w-4 h-4 text-slate-500 hidden sm:block shrink-0" />
              <input
                id="omni-text-input"
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                onKeyDown={handleKeyDown}
                placeholder="Escribe tus tareas (ej: Mañana reunión 10am)..."
                className="w-full bg-transparent text-sm text-slate-100 placeholder:text-slate-500 outline-none font-sans"
              />
            </div>

            {/* Send / Process button */}
            <button
              id="omni-btn-send"
              onClick={handleSend}
              disabled={!inputText.trim() || isProcessing}
              className={`w-10 h-10 sm:w-9 sm:h-9 rounded-xl sm:rounded-full transition cursor-pointer flex items-center justify-center shrink-0 ${
                inputText.trim()
                  ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-md shadow-indigo-500/30 hover:brightness-110 active:scale-95'
                  : 'text-slate-600 bg-slate-800/50 cursor-not-allowed'
              }`}
              aria-label="Guardar tarea"
            >
              {isProcessing ? (
                <div className="w-4 h-4 border-2 border-slate-400 border-t-white rounded-full animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
