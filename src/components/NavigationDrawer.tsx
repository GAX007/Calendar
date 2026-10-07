import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Calendar,
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
  activeTab: 'agenda' | 'university' | 'gym';
  setActiveTab: (tab: 'agenda' | 'university' | 'gym') => void;
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
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop Blur Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs cursor-pointer"
          />

          {/* Left Drawer Panel */}
          <motion.aside
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 26, stiffness: 260 }}
            className="fixed inset-y-0 left-0 z-50 w-72 sm:w-80 bg-white dark:bg-slate-900 border-r border-slate-200/90 dark:border-slate-800 shadow-2xl flex flex-col justify-between overflow-hidden"
          >
            {/* Drawer Header */}
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-600/30">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-slate-900 dark:text-white leading-tight">
                    Navegación
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {clock.dayName}, {clock.dayNumber} {clock.monthName}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                title="Cerrar panel lateral"
              >
                <PanelLeftClose className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Center Body: Tabs & Quick Actions */}
            <div className="p-4 flex-1 overflow-y-auto flex flex-col gap-5">
              {/* Primary Navigation Tabs */}
              <div className="flex flex-col gap-1.5">
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

            {/* Drawer Footer: User profile */}
            <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 flex flex-col gap-2.5">
              {/* User session row */}
              <div className="flex items-center justify-between">
                {user ? (
                  <>
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-950/50 flex items-center justify-center text-indigo-600 shrink-0">
                        <User className="w-3.5 h-3.5" />
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
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer"
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
