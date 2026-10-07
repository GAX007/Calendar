import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Droplets,
  Plus,
  Minus,
  RotateCcw,
  Sparkles,
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

  const [showResetConfirm, setShowResetConfirm] = useState<boolean>(false);
  const [showGoalPresets, setShowGoalPresets] = useState<boolean>(false);

  // Common goal presets in liters
  const PRESET_GOALS = [1.5, 2.0, 2.5, 3.0, 3.5];

  const formatLiters = (num: number) => {
    return (Math.round(num * 100) / 100).toFixed(2).replace(/\.?0+$/, '');
  };

  const handleAdjustGoal = (delta: number) => {
    const next = Math.max(0.5, Math.min(6.0, Math.round((goalLiters + delta) * 100) / 100));
    setGoal(next);
  };

  // Compact Pill mode (e.g. for small headers)
  if (isCompact) {
    return (
      <div
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-2xl border ${
          isCompleted
            ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
            : 'border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300'
        } text-xs font-semibold shrink-0 ${className}`}
      >
        <Droplets className={`w-3.5 h-3.5 shrink-0 ${isCompleted ? 'text-emerald-600' : 'text-sky-600'}`} />
        <span>{formatLiters(intakeLiters)} / {formatLiters(goalLiters)}L</span>
        <button
          type="button"
          onClick={() => addWater(0.25)}
          className="ml-1 w-5 h-5 rounded-full bg-sky-600 hover:bg-sky-500 text-white flex items-center justify-center transition active:scale-90 cursor-pointer shadow-2xs"
          title="Añadir 250 ml"
        >
          <Plus className="w-3 h-3" />
        </button>
      </div>
    );
  }

  // Full Card Mode (Matches NextActivityCard & GoogleCalendarView design)
  return (
    <div
      id="daily-water-tracker-card"
      className={`w-full rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 transition-all duration-300 p-4 sm:p-5 shadow-xs border-l-4 ${
        isCompleted ? 'border-l-emerald-500' : 'border-l-sky-500'
      } flex flex-col justify-between gap-3.5 ${className}`}
    >
      {/* Top Header: Title & Límite Stepper */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
              isCompleted
                ? 'bg-emerald-50 dark:bg-emerald-500/20 border-emerald-200 dark:border-emerald-500/40 text-emerald-600 dark:text-emerald-400'
                : 'bg-sky-50 dark:bg-sky-500/20 border-sky-200 dark:border-sky-500/40 text-sky-600 dark:text-sky-400'
            }`}
          >
            <Droplets className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Hidratación
              </span>
              {isCompleted && (
                <span className="px-1.5 py-0.2 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-[9px] font-bold">
                  Completado
                </span>
              )}
            </div>
            <h4 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white leading-tight">
              Control de Agua Diario
            </h4>
          </div>
        </div>

        {/* Límite Stepper (Direct +/- adjustment with mobile-friendly touch targets) */}
        <div className="flex items-center gap-2 relative">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            Límite:
          </span>
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700">
            <button
              type="button"
              onClick={() => handleAdjustGoal(-0.25)}
              className="w-8 h-8 rounded-lg bg-white dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 flex items-center justify-center font-black text-sm transition cursor-pointer shadow-2xs active:scale-95 touch-manipulation"
              title="Reducir límite (-250 ml)"
              aria-label="Reducir límite de agua"
            >
              -
            </button>

            <button
              type="button"
              onClick={() => setShowGoalPresets((prev) => !prev)}
              className="px-2 py-1 text-xs sm:text-sm font-extrabold font-mono text-slate-800 dark:text-slate-100 hover:text-sky-600 dark:hover:text-sky-400 transition cursor-pointer"
              title="Toca para elegir una meta rápida"
            >
              {formatLiters(goalLiters)} L
            </button>

            <button
              type="button"
              onClick={() => handleAdjustGoal(0.25)}
              className="w-8 h-8 rounded-lg bg-white dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 flex items-center justify-center font-black text-sm transition cursor-pointer shadow-2xs active:scale-95 touch-manipulation"
              title="Aumentar límite (+250 ml)"
              aria-label="Aumentar límite de agua"
            >
              +
            </button>
          </div>

          {/* Quick preset selector popover */}
          <AnimatePresence>
            {showGoalPresets && (
              <motion.div
                initial={{ opacity: 0, y: -4, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.95 }}
                className="absolute right-0 top-full mt-1.5 z-30 p-1.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl flex items-center gap-1"
              >
                {PRESET_GOALS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      setGoal(preset);
                      setShowGoalPresets(false);
                    }}
                    className={`px-2 py-1 rounded-xl text-xs font-mono font-bold transition cursor-pointer ${
                      goalLiters === preset
                        ? 'bg-sky-600 text-white shadow-2xs'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200'
                    }`}
                  >
                    {preset}L
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Center Stats & Progress Bar */}
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white font-mono tracking-tight">
              {formatLiters(intakeLiters)}
            </span>
            <span className="text-sm sm:text-base font-semibold text-slate-400 font-mono">
              / {formatLiters(goalLiters)} L
            </span>
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 ml-1">
              {isCompleted ? (
                <span className="text-emerald-600 dark:text-emerald-400 font-bold inline-flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  ¡Completado!
                </span>
              ) : (
                `(${formatLiters(Math.max(0, goalLiters - intakeLiters))} L restantes)`
              )}
            </span>
          </div>

          <span
            className={`text-xs sm:text-sm font-extrabold font-mono ${
              isCompleted ? 'text-emerald-600 dark:text-emerald-400' : 'text-sky-600 dark:text-sky-400'
            }`}
          >
            {progressPercent}%
          </span>
        </div>

        {/* Liquid Progress Bar */}
        <div className="w-full h-2.5 sm:h-3 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden relative border border-slate-200/60 dark:border-slate-700/60">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(100, progressPercent)}%` }}
            transition={{ type: 'spring', damping: 20, stiffness: 120 }}
            className={`h-full rounded-full transition-all duration-300 ${
              isCompleted
                ? 'bg-gradient-to-r from-emerald-500 to-teal-400 shadow-sm shadow-emerald-500/30'
                : 'bg-gradient-to-r from-sky-500 to-cyan-400 shadow-sm shadow-sky-500/30'
            }`}
          />
        </div>
      </div>

      {/* Bottom Quick-Add Buttons (Mobile Optimized Grid/Flex) */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
        <div className="grid grid-cols-3 gap-1.5 flex-1">
          <button
            type="button"
            onClick={() => addWater(0.25)}
            className="flex items-center justify-center gap-1 py-2 px-2 rounded-xl bg-sky-50 dark:bg-sky-950/40 hover:bg-sky-100 dark:hover:bg-sky-900/60 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800 text-xs font-bold transition cursor-pointer active:scale-95 touch-manipulation min-h-[40px]"
            title="Añadir 1 vaso (+250 ml)"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>250 ml</span>
          </button>

          <button
            type="button"
            onClick={() => addWater(0.5)}
            className="flex items-center justify-center gap-1 py-2 px-2 rounded-xl bg-sky-50 dark:bg-sky-950/40 hover:bg-sky-100 dark:hover:bg-sky-900/60 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800 text-xs font-bold transition cursor-pointer active:scale-95 touch-manipulation min-h-[40px]"
            title="Añadir 1 botella (+500 ml)"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>500 ml</span>
          </button>

          <button
            type="button"
            onClick={() => addWater(1.0)}
            className="flex items-center justify-center gap-1 py-2 px-2 rounded-xl bg-sky-50 dark:bg-sky-950/40 hover:bg-sky-100 dark:hover:bg-sky-900/60 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800 text-xs font-bold transition cursor-pointer active:scale-95 touch-manipulation min-h-[40px]"
            title="Añadir 1 litro (+1.0 L)"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>1.0 L</span>
          </button>
        </div>

        {/* Right: Undo & Reset */}
        <div className="flex items-center justify-end gap-1.5 self-end sm:self-auto">
          {intakeLiters > 0 && (
            <button
              type="button"
              onClick={() => removeWater(0.25)}
              className="w-10 h-10 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition cursor-pointer active:scale-95 touch-manipulation"
              title="Deshacer (-250 ml)"
              aria-label="Deshacer agua"
            >
              <Minus className="w-4 h-4" />
            </button>
          )}

          {intakeLiters > 0 && (
            showResetConfirm ? (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    resetToday();
                    setShowResetConfirm(false);
                  }}
                  className="px-2.5 py-2 rounded-xl bg-rose-600 text-white text-[11px] font-bold hover:bg-rose-700 transition cursor-pointer active:scale-95 touch-manipulation min-h-[40px]"
                >
                  Confirmar
                </button>
                <button
                  type="button"
                  onClick={() => setShowResetConfirm(false)}
                  className="px-2 py-2 text-slate-400 text-[11px] hover:text-slate-600 cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowResetConfirm(true)}
                className="w-10 h-10 rounded-xl text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 flex items-center justify-center transition cursor-pointer active:scale-95 touch-manipulation"
                title="Reiniciar a cero hoy"
                aria-label="Reiniciar agua hoy"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            )
          )}
        </div>
      </div>
    </div>
  );
};
