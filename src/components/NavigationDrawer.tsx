import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Calendar,
  CalendarDays,
  GraduationCap,
  Dumbbell,
  X,
  PlusCircle,
  Camera,
  User,
  LogOut,
  RefreshCw,
  PanelLeftClose,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react';
import { RealTimeClockState } from '../hooks/useRealTimeClock';

interface NavigationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: 'agenda' | 'university' | 'gym' | 'moodle';
  setActiveTab: (tab: 'agenda' | 'university' | 'gym' | 'moodle') => void;
  clock: RealTimeClockState;
  isDark?: boolean;
  toggleTheme?: () => void;
  user: any;
  signOut: () => void;
  onOpenNewTaskModal: () => void;
  onOpenVisionModal: () => void;
  onOpenSyncModal?: () => void;
  onOpenLinkCalendarModal?: () => void;
  onCheckUpdates?: () => void;
}

export const NavigationDrawer: React.FC<NavigationDrawerProps> = ({
  isOpen,
  onClose,
  activeTab,
  setActiveTab,
  clock,
  user,
  signOut,
  onOpenNewTaskModal,
  onOpenVisionModal,
  onOpenLinkCalendarModal,
  onCheckUpdates,
}) => {
  // Prevent background scrolling and bouncing on mobile when drawer is open
  useEffect(() => {
    if (isOpen) {
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prevOverflow;
      };
    }
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop Blur Overlay with high z-index and touch dismissal */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-xs cursor-pointer touch-manipulation"
          />

          {/* Left Drawer Panel with swipe-to-close on mobile */}
          <motion.aside
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 280 }}
            drag="x"
            dragConstraints={{ left: -320, right: 0 }}
            dragElastic={0.08}
            onDragEnd={(_, info) => {
              if (info.offset.x < -60 || info.velocity.x < -200) {
                onClose();
              }
            }}
            className="fixed inset-y-0 left-0 z-[90] w-[82vw] max-w-80 bg-white dark:bg-slate-900 border-r border-slate-200/90 dark:border-slate-800 shadow-2xl flex flex-col justify-between overflow-hidden touch-pan-y"
          >
            {/* Drawer Header (Respects iPhone Notch Safe Area) */}
            <div className="p-4 pt-[max(env(safe-area-inset-top,0px),1rem)] border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-600/30 shrink-0">
                  <Calendar className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-white leading-tight">
                    Navegación
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 capitalize truncate">
                    {clock.dayName}, {clock.dayNumber} {clock.monthName}
                  </p>
                </div>
              </div>

              {/* Generous 44x44px touch close button */}
              <button
                type="button"
                onClick={onClose}
                className="w-11 h-11 rounded-2xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition cursor-pointer active:scale-95 touch-manipulation"
                title="Cerrar menú"
                aria-label="Cerrar menú"
              >
                <PanelLeftClose className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Center Body: Tabs & Quick Actions */}
            <div className="p-4 flex-1 overflow-y-auto overscroll-contain flex flex-col gap-5">
              {/* Primary Navigation Tabs */}
              <div className="flex flex-col gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-2">
                  Vistas Principales
                </span>

                {/* Tab: Google Calendar & Agenda */}
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('agenda');
                    onClose();
                  }}
                  className={`w-full flex items-center justify-between p-3 rounded-2xl font-bold text-xs transition cursor-pointer ${
                    activeTab === 'agenda'
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/25'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/80'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-xl ${activeTab === 'agenda' ? 'bg-white/20' : 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400'}`}>
                      <Calendar className="w-4 h-4" />
                    </div>
                    <div className="text-left">
                      <p className="font-extrabold">Calendario & Horarios</p>
                      <p className={`text-[10px] font-normal ${activeTab === 'agenda' ? 'text-indigo-100' : 'text-slate-400'}`}>
                        Google Calendar & horas libres
                      </p>
                    </div>
                  </div>
                  <ChevronRight className={`w-4 h-4 ${activeTab === 'agenda' ? 'text-white' : 'text-slate-300 dark:text-slate-600'}`} />
                </button>

                {/* Tab: Deberes & Universidad */}
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('university');
                    onClose();
                  }}
                  className={`w-full flex items-center justify-between p-3 rounded-2xl font-bold text-xs transition cursor-pointer ${
                    activeTab === 'university'
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/25'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/80'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-xl ${activeTab === 'university' ? 'bg-white/20' : 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400'}`}>
                      <GraduationCap className="w-4 h-4" />
                    </div>
                    <div className="text-left">
                      <p className="font-extrabold">Deberes & Universidad</p>
                      <p className={`text-[10px] font-normal ${activeTab === 'university' ? 'text-blue-100' : 'text-slate-400'}`}>
                        Asignaturas, entregas y fechas
                      </p>
                    </div>
                  </div>
                  <ChevronRight className={`w-4 h-4 ${activeTab === 'university' ? 'text-white' : 'text-slate-300 dark:text-slate-600'}`} />
                </button>

                {/* Tab: Entregas Moodle (Fase 1) */}
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('moodle');
                    onClose();
                  }}
                  className={`w-full flex items-center justify-between p-3 rounded-2xl font-bold text-xs transition cursor-pointer ${
                    activeTab === 'moodle'
                      ? 'bg-amber-600 text-white shadow-md shadow-amber-600/25'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/80'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-xl ${activeTab === 'moodle' ? 'bg-white/20' : 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400'}`}>
                      <CalendarDays className="w-4 h-4" />
                    </div>
                    <div className="text-left">
                      <p className="font-extrabold">Entregas Moodle</p>
                      <p className={`text-[10px] font-normal ${activeTab === 'moodle' ? 'text-amber-100' : 'text-slate-400'}`}>
                        ICS oficial, fechas límite y filtros
                      </p>
                    </div>
                  </div>
                  <ChevronRight className={`w-4 h-4 ${activeTab === 'moodle' ? 'text-white' : 'text-slate-300 dark:text-slate-600'}`} />
                </button>

                {/* Tab: Gym & Rutinas */}
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('gym');
                    onClose();
                  }}
                  className={`w-full flex items-center justify-between p-3 rounded-2xl font-bold text-xs transition cursor-pointer ${
                    activeTab === 'gym'
                      ? 'bg-rose-600 text-white shadow-md shadow-rose-600/25'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/80'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-xl ${activeTab === 'gym' ? 'bg-white/20' : 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400'}`}>
                      <Dumbbell className="w-4 h-4" />
                    </div>
                    <div className="text-left">
                      <p className="font-extrabold">Gym & Rutinas</p>
                      <p className={`text-[10px] font-normal ${activeTab === 'gym' ? 'text-rose-100' : 'text-slate-400'}`}>
                        Karate, fuerza e hipertrofia
                      </p>
                    </div>
                  </div>
                  <ChevronRight className={`w-4 h-4 ${activeTab === 'gym' ? 'text-white' : 'text-slate-300 dark:text-slate-600'}`} />
                </button>
              </div>

              {/* Direct Quick Action Buttons */}
              <div className="flex flex-col gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-2">
                  Acciones Rápidas
                </span>

                <button
                  type="button"
                  onClick={() => {
                    onOpenNewTaskModal();
                    onClose();
                  }}
                  className="w-full flex items-center gap-3 p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/30 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/80 text-xs font-bold transition cursor-pointer active:scale-98"
                >
                  <PlusCircle className="w-4 h-4 text-indigo-600" />
                  <span>Crear nueva tarea</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onOpenLinkCalendarModal?.();
                    onClose();
                  }}
                  className="w-full flex items-center justify-between p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/80 text-xs font-bold transition cursor-pointer active:scale-98"
                >
                  <div className="flex items-center gap-3">
                    <Calendar className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <span>Mi Google Calendar</span>
                  </div>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 font-semibold">
                    Configurar
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onOpenVisionModal();
                    onClose();
                  }}
                  className="w-full flex items-center gap-3 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 text-xs font-bold transition cursor-pointer active:scale-98"
                >
                  <Camera className="w-4 h-4 text-cyan-500" />
                  <span>Escanear horario (Foto)</span>
                </button>
              </div>
            </div>

            {/* Drawer Footer: User profile with Safe Area Padding */}
            <div className="p-4 pb-[max(env(safe-area-inset-bottom,0px),1rem)] border-t border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/60 flex flex-col gap-2.5">
              {/* User session row */}
              <div className="flex items-center justify-between gap-2">
                {user ? (
                  <>
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-950/50 flex items-center justify-center text-indigo-600 shrink-0">
                        <User className="w-4 h-4" />
                      </div>
                      <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[150px]">
                        {user.email}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        signOut();
                        onClose();
                      }}
                      title="Cerrar sesión"
                      aria-label="Cerrar sesión"
                      className="w-10 h-10 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center justify-center transition cursor-pointer active:scale-95 touch-manipulation"
                    >
                      <LogOut className="w-4 h-4" />
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      signOut();
                      onClose();
                    }}
                    className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs transition cursor-pointer"
                  >
                    <User className="w-3.5 h-3.5" />
                    <span>Iniciar sesión</span>
                  </button>
                )}
              </div>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
};
