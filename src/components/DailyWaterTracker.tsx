import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Droplets,
  Plus,
  Minus,
  RotateCcw,
  Pencil,
  Check,
  X,
  Sparkles,
  Waves,
} from 'lucide-react';
import { useHydrationTracker } from '../hooks/useHydrationTracker';

interface DailyWaterTrackerProps {
  dateStr: string;
  className?: string;
  isCompact?: boolean;
}

export const DailyWaterTracker: React.FC<DailyWaterTrackerProps> = ({
  dateStr,
  className = '',
  isCompact = false,
}) => {
  const {
    intakeLiters,
    goalLiters,
    progressPercent,
    isCompleted,
    addWater,
    removeWater,
    resetToday,
    setGoal,
  } = useHydrationTracker(dateStr);

  const [isEditingGoal, setIsEditingGoal] = useState<boolean>(false);
  const [tempGoalInput, setTempGoalInput] = useState<string>(goalLiters.toString());
  const [showResetConfirm, setShowResetConfirm] = useState<boolean>(false);

  const PRESET_GOALS = [2.0, 2.5, 3.0, 3.5, 4.0, 5.0];

  const handleOpenEditGoal = () => {
    setTempGoalInput(goalLiters.toString());
    setIsEditingGoal(true);
  };

  const handleSaveGoal = (val?: number) => {
    const target = val ?? parseFloat(tempGoalInput.replace(',', '.'));
    if (!isNaN(target) && target > 0) {
      setGoal(target);
      setIsEditingGoal(false);
    }
  };

  // Format liters cleanly: 1 -> "1", 1.5 -> "1.5", 1.25 -> "1.25"
  const formatLiters = (num: number) => {
    return (Math.round(num * 100) / 100).toFixed(2).replace(/\.?0+$/, '');
  };

  // Compact Pill mode (e.g. for header)
  if (isCompact) {
    return (
      <div className={`relative flex items-center gap-1.5 p-1 rounded-full bg-slate-900 border ${
        isCompleted ? 'border-emerald-500/50 bg-emerald-950/30' : 'border-cyan-500/40 bg-slate-900/90'
      } text-xs ${className}`}>
        <button
          type="button"
          onClick={handleOpenEditGoal}
          className="flex items-center gap-1.5 px-2 py-0.5 text-cyan-300 hover:text-cyan-200 transition cursor-pointer"
          title="Consumo de agua hoy. Haz clic para cambiar tu objetivo."
        >
          <Droplets className={`w-3.5 h-3.5 ${isCompleted ? 'text-emerald-400' : 'text-cyan-400'}`} />
          <span className="font-bold font-mono">
            {formatLiters(intakeLiters)}/{formatLiters(goalLiters)}L
          </span>
        </button>

        {/* Quick + button */}
        <button
          type="button"
          onClick={() => addWater(0.25)}
          className="w-6 h-6 rounded-full bg-cyan-600 hover:bg-cyan-500 text-white flex items-center justify-center transition active:scale-90 cursor-pointer shadow-sm shadow-cyan-600/30"
          title="Añadir 1 vaso (+250 ml)"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  // Full Card Mode (for Daily Dashboard)
  return (
    <div
      id="daily-water-tracker-card"
      className={`w-full rounded-2xl border transition-all duration-300 p-4 sm:p-5 shadow-lg backdrop-blur-sm relative overflow-hidden ${
        isCompleted
          ? 'bg-gradient-to-r from-emerald-950/40 via-slate-900 to-slate-900/90 border-emerald-500/50 shadow-emerald-950/30 ring-1 ring-emerald-500/20'
          : 'bg-gradient-to-r from-cyan-950/30 via-slate-900 to-slate-900/90 border-cyan-500/40 shadow-cyan-950/20'
      } ${className}`}
    >
      {/* Subtle liquid backdrop glow */}
      <div className="absolute -top-12 -right-12 w-36 h-36 rounded-full bg-cyan-500/10 blur-2xl pointer-events-none" />

      <div className="flex flex-col gap-4">
        {/* Top Header row */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border shadow-inner ${
                isCompleted
                  ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                  : 'bg-cyan-500/20 border-cyan-500/40 text-cyan-400'
              }`}
            >
              <Droplets className="w-5 h-5 animate-pulse" />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider border ${
                    isCompleted
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
                  Control de Hidratación
                </span>

                <span className="text-[10px] font-mono text-slate-400 hidden sm:inline">
                  &bull; Se reinicia cada día
                </span>
              </div>

              <h3 className="text-base sm:text-lg font-bold text-white tracking-tight mt-0.5">
                Seguimiento de Agua Diario
              </h3>
            </div>
          </div>

          {/* Right Action: Edit Goal & Reset */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={handleOpenEditGoal}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-750 text-xs text-slate-300 hover:text-white transition cursor-pointer"
              title="Modificar objetivo diario (ej. 2L, 3.5L, 5L)"
            >
              <Pencil className="w-3 h-3 text-cyan-400" />
              <span>Objetivo: <strong className="text-cyan-300">{formatLiters(goalLiters)}L</strong></span>
            </button>

            {/* Reset day button */}
            {intakeLiters > 0 && (
              <button
                type="button"
                onClick={() => setShowResetConfirm((prev) => !prev)}
                className="p-1.5 rounded-lg border border-slate-800 bg-slate-855 hover:bg-rose-950/40 hover:border-rose-500/40 text-slate-400 hover:text-rose-300 transition cursor-pointer"
                title="Reiniciar contador de hoy a 0L"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Reset Confirmation Prompt */}
        <AnimatePresence>
          {showResetConfirm && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="flex items-center justify-between p-2.5 rounded-xl bg-slate-850 border border-slate-700 text-xs"
            >
              <span className="text-slate-300">¿Deseas reiniciar a 0L el consumo de agua de hoy?</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    resetToday();
                    setShowResetConfirm(false);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold transition cursor-pointer"
                >
                  Sí, reiniciar
                </button>
                <button
                  type="button"
                  onClick={() => setShowResetConfirm(false)}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Editable Goal Selector Dropdown / Inline Editor */}
        <AnimatePresence>
          {isEditingGoal && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="p-3.5 rounded-xl bg-slate-900 border border-cyan-500/40 flex flex-col gap-2.5 shadow-xl"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-cyan-300 flex items-center gap-1.5">
                  <Pencil className="w-3.5 h-3.5" />
                  Elige tu objetivo diario de agua:
                </span>
                <button
                  type="button"
                  onClick={() => setIsEditingGoal(false)}
                  className="text-slate-400 hover:text-white transition"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Presets */}
              <div className="flex flex-wrap items-center gap-1.5">
                {PRESET_GOALS.map((preset) => (
                  <button
                    type="button"
                    key={preset}
                    onClick={() => handleSaveGoal(preset)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                      goalLiters === preset
                        ? 'bg-cyan-600 text-white border-cyan-400 shadow-sm'
                        : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-750 hover:text-white'
                    }`}
                  >
                    {preset} L
                  </button>
                ))}
              </div>

              {/* Custom Number Input */}
              <div className="flex items-center gap-2 pt-1">
                <span className="text-xs text-slate-400">O escribe una cantidad:</span>
                <input
                  type="number"
                  step="0.1"
                  min="0.5"
                  max="10.0"
                  value={tempGoalInput}
                  onChange={(e) => setTempGoalInput(e.target.value)}
                  className="w-20 px-2 py-1 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs font-mono font-bold focus:outline-none focus:border-cyan-400"
                  placeholder="3.5"
                />
                <span className="text-xs text-slate-400 font-mono">Litros</span>

                <button
                  type="button"
                  onClick={() => handleSaveGoal()}
                  className="ml-auto px-3 py-1 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
                >
                  <Check className="w-3 h-3" />
                  <span>Guardar</span>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Center Progress Stats: X / Goal L + Percentage */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
          <div className="flex items-baseline gap-2">
            <span className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight font-mono">
              {formatLiters(intakeLiters)}
            </span>
            <span className="text-xl sm:text-2xl font-bold text-slate-400 font-mono">
              / {formatLiters(goalLiters)} L
            </span>

            {isCompleted ? (
              <span className="ml-2 px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center gap-1 animate-bounce">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                ¡Meta alcanzada!
              </span>
            ) : (
              <span className="ml-2 text-xs font-mono text-cyan-400/90 font-medium">
                (Faltan {formatLiters(Math.max(0, goalLiters - intakeLiters))} L)
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 self-start sm:self-end">
            <span className="text-xs font-mono font-bold text-slate-400">Progreso:</span>
            <span
              className={`text-sm font-mono font-extrabold ${
                isCompleted ? 'text-emerald-400' : 'text-cyan-400'
              }`}
            >
              {progressPercent}%
            </span>
          </div>
        </div>

        {/* Fluid Progress Bar */}
        <div className="w-full h-3 sm:h-3.5 rounded-full bg-slate-800/90 border border-slate-700/60 overflow-hidden relative shadow-inner">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(100, progressPercent)}%` }}
            transition={{ type: 'spring', damping: 20, stiffness: 120 }}
            className={`h-full rounded-full relative transition-all duration-300 ${
              isCompleted
                ? 'bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-400 shadow-md shadow-emerald-500/40'
                : 'bg-gradient-to-r from-cyan-600 via-cyan-400 to-blue-500 shadow-md shadow-cyan-500/40'
            }`}
          >
            {/* Water shine animation */}
            <div className="absolute inset-0 bg-white/20 animate-pulse" />
          </motion.div>
        </div>

        {/* Bottom Actions Row: The "PLUS" Button + Quick Options */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-slate-800/80">
          {/* Quick-add glass / bottle buttons */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            <span className="text-xs font-semibold text-slate-400 hidden sm:inline">Añadir rápido:</span>

            <button
              type="button"
              id="water-btn-add-250"
              onClick={() => addWater(0.25)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-cyan-500/30 bg-cyan-950/30 hover:bg-cyan-900/50 text-cyan-300 hover:text-white text-xs font-medium transition cursor-pointer active:scale-95"
              title="Añadir 1 vaso (250 ml)"
            >
              <Plus className="w-3 h-3" />
              <span>250 ml</span>
              <span className="text-[10px] text-slate-400 hidden md:inline">(Vaso)</span>
            </button>

            <button
              type="button"
              id="water-btn-add-500"
              onClick={() => addWater(0.5)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-cyan-500/30 bg-cyan-950/30 hover:bg-cyan-900/50 text-cyan-300 hover:text-white text-xs font-medium transition cursor-pointer active:scale-95"
              title="Añadir 1 botella (500 ml)"
            >
              <Plus className="w-3 h-3" />
              <span>500 ml</span>
              <span className="text-[10px] text-slate-400 hidden md:inline">(Botella)</span>
            </button>

            <button
              type="button"
              id="water-btn-add-1000"
              onClick={() => addWater(1.0)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-cyan-500/30 bg-cyan-950/30 hover:bg-cyan-900/50 text-cyan-300 hover:text-white text-xs font-medium transition cursor-pointer active:scale-95"
              title="Añadir 1 litro (1000 ml)"
            >
              <Plus className="w-3 h-3" />
              <span>1.0 L</span>
            </button>
          </div>

          {/* Right Action: Big Plus button & Undo button */}
          <div className="flex items-center gap-2 ml-auto">
            {/* Minus/Undo button */}
            {intakeLiters > 0 && (
              <button
                type="button"
                id="water-btn-minus"
                onClick={() => removeWater(0.25)}
                className="w-8 h-8 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-rose-300 flex items-center justify-center transition active:scale-95 cursor-pointer"
                title="Deshacer / Restar 250 ml"
              >
                <Minus className="w-4 h-4" />
              </button>
            )}

            {/* Main Primary PLUS button */}
            <button
              type="button"
              id="water-btn-primary-plus"
              onClick={() => addWater(0.25)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs sm:text-sm shadow-md shadow-cyan-600/30 transition active:scale-95 cursor-pointer"
              title="Pulsar para añadir agua (+250 ml)"
            >
              <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center">
                <Plus className="w-3.5 h-3.5 text-white" />
              </div>
              <span>Beber Agua (+250 ml)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
