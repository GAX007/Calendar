import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Camera, Keyboard, Send, PlusCircle } from 'lucide-react';

interface OmniInputBarProps {
  onOpenVisionModal?: () => void;
  onOpenNewTaskModal?: () => void;
  onSubmitText?: (text: string) => void;
  onProcessInput?: (text: string, sourceType?: 'voice' | 'text') => void;
  isProcessing: boolean;
}

export const OmniInputBar: React.FC<OmniInputBarProps> = ({
  onOpenVisionModal,
  onOpenNewTaskModal,
  onSubmitText,
  onProcessInput,
  isProcessing,
}) => {
  const [inputText, setInputText] = useState<string>('');
  const [isFocused, setIsFocused] = useState<boolean>(false);

  const handleSend = () => {
    if (!inputText.trim() || isProcessing) return;
    const textToSend = inputText.trim();
    if (onSubmitText) {
      onSubmitText(textToSend);
    } else if (onProcessInput) {
      onProcessInput(textToSend, 'text');
    }
    setInputText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
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
        {/* Quick trigger chips */}
        <div className="flex items-center justify-center gap-1.5 sm:gap-2 mb-2 px-2 max-w-full">
          {onOpenNewTaskModal && (
            <button
              id="chip-trigger-manual-add"
              onClick={onOpenNewTaskModal}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-800 text-indigo-600 dark:text-indigo-400 hover:bg-slate-50 dark:hover:bg-slate-850 text-xs font-semibold transition shadow-xs cursor-pointer active:scale-95 whitespace-nowrap shrink-0"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Añadir Manual</span>
            </button>
          )}

          <button
            id="chip-trigger-vision"
            onClick={onOpenVisionModal}
            className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-800 text-sky-600 dark:text-sky-400 hover:bg-slate-50 dark:hover:bg-slate-850 text-xs font-semibold transition shadow-xs cursor-pointer active:scale-95 whitespace-nowrap shrink-0"
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Escanear Foto</span>
          </button>
        </div>

        {/* The Omni-Input Bar (Clean modern style) */}
        <div
          className={`relative rounded-2xl sm:rounded-full bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border transition-all duration-300 shadow-lg ${
            isFocused
              ? 'border-indigo-500 ring-2 ring-indigo-500/20'
              : 'border-slate-200/90 dark:border-slate-700/80 hover:border-slate-300 dark:hover:border-slate-600'
          }`}
        >
          <div className="flex items-center gap-1 sm:gap-2 p-1.5 sm:px-3 sm:py-2">
            {/* Action: Manual Add Button */}
            {onOpenNewTaskModal && (
              <button
                id="omni-btn-manual-add"
                onClick={onOpenNewTaskModal}
                title="Añadir tarea manualmente"
                className="w-10 h-10 sm:w-9 sm:h-9 rounded-xl sm:rounded-full text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 active:scale-95 transition cursor-pointer flex items-center justify-center shrink-0 touch-manipulation"
                aria-label="Añadir tarea manualmente"
              >
                <PlusCircle className="w-5 h-5 sm:w-4.5 sm:h-4.5" />
              </button>
            )}

            {/* Action: Camera */}
            <button
              id="omni-btn-camera"
              onClick={onOpenVisionModal}
              title="Escanear foto u horario"
              className="w-10 h-10 sm:w-9 sm:h-9 rounded-xl sm:rounded-full text-slate-500 dark:text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/40 active:scale-95 transition cursor-pointer flex items-center justify-center shrink-0 touch-manipulation"
              aria-label="Escanear foto"
            >
              <Camera className="w-5 h-5 sm:w-4.5 sm:h-4.5" />
            </button>

            {/* Action: Text input field (16px base font prevents iOS Safari auto-zoom) */}
            <div className="flex-1 flex items-center gap-2 min-w-0 px-1 sm:px-2">
              <Keyboard className="w-4 h-4 text-slate-400 hidden sm:block shrink-0" />
              <input
                id="omni-text-input"
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                onKeyDown={handleKeyDown}
                placeholder="Escribe tus tareas (ej: Mañana clase 10am, entrega viernes)..."
                className="w-full bg-transparent text-base sm:text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 outline-none font-sans"
              />
            </div>

            {/* Send button */}
            <button
              id="omni-btn-send"
              onClick={handleSend}
              disabled={!inputText.trim() || isProcessing}
              className={`w-10 h-10 sm:w-9 sm:h-9 rounded-xl sm:rounded-full transition cursor-pointer flex items-center justify-center shrink-0 touch-manipulation ${
                inputText.trim()
                  ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs active:scale-95'
                  : 'text-slate-400 bg-slate-100 dark:bg-slate-800 cursor-not-allowed'
              }`}
              aria-label="Guardar tarea"
            >
              {isProcessing ? (
                <div className="w-4 h-4 border-2 border-white/60 border-t-white rounded-full animate-spin" />
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
