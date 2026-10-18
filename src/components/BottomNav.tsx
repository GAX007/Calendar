import React from 'react';
import { Calendar, ClipboardList, Clock3, Dumbbell, GraduationCap } from 'lucide-react';
import { haptic } from '../utils/haptics';

export type AppTab = 'agenda' | 'university' | 'gym' | 'moodle' | 'planner';

interface NavProps {
  activeTab: AppTab;
  onChange: (tab: AppTab) => void;
}

const ITEMS: Array<{ id: AppTab; label: string; largo: string; Icon: React.ComponentType<{ className?: string; strokeWidth?: number }> }> = [
  { id: 'agenda', label: 'Hoy', largo: 'Hoy', Icon: Calendar },
  { id: 'planner', label: 'Plan', largo: 'Plan', Icon: Clock3 },
  { id: 'moodle', label: 'Moodle', largo: 'Moodle', Icon: ClipboardList },
  { id: 'university', label: 'Uni', largo: 'Universidad', Icon: GraduationCap },
  { id: 'gym', label: 'Gym', largo: 'Gym', Icon: Dumbbell },
];

const pulsar = (id: AppTab, activeTab: AppTab, onChange: (tab: AppTab) => void) => {
  if (id === activeTab) {
    // Tapping the current tab goes back to the top
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  haptic(6);
  onChange(id);
};

// Mobile tab bar (desktop uses TopNav)
export const BottomNav: React.FC<NavProps> = ({ activeTab, onChange }) => (
  <nav
    aria-label="Secciones"
    className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-track-2 pb-[env(safe-area-inset-bottom,0px)]"
  >
    <div className="grid grid-cols-5 h-16 px-1">
      {ITEMS.map(({ id, label, Icon }) => {
        const activo = activeTab === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => pulsar(id, activeTab, onChange)}
            aria-current={activo ? 'page' : undefined}
            className={`flex flex-col items-center justify-center gap-[3px] touch-manipulation active:scale-95 transition text-xs ${
              activo ? 'text-ink font-semibold' : 'text-ink-2 font-medium'
            }`}
          >
            <span className={`flex items-center justify-center w-14 h-[30px] rounded-full transition ${activo ? 'bg-accent' : ''}`}>
              <Icon className="w-[21px] h-[21px]" strokeWidth={1.75} />
            </span>
            <span className="leading-none">{label}</span>
          </button>
        );
      })}
    </div>
  </nav>
);

// Desktop header with the same sections
export const TopNav: React.FC<NavProps & { iniciales: string; onOpenCuenta: () => void }> = ({ activeTab, onChange, iniciales, onOpenCuenta }) => (
  <header className="hidden md:block sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-line">
    <div className="max-w-6xl mx-auto h-16 px-6 flex items-center justify-between gap-6">
      <span className="text-[17px] font-semibold tracking-[-0.01em]">CalendarAsist</span>
      <nav aria-label="Secciones" className="flex items-center gap-0.5 p-[3px] rounded-[15px] bg-surface-2">
        {ITEMS.map(({ id, largo, Icon }) => {
          const activo = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => pulsar(id, activeTab, onChange)}
              aria-current={activo ? 'page' : undefined}
              className={`h-10 px-4 rounded-xl flex items-center gap-2 text-sm transition cursor-pointer ${
                activo ? 'bg-white text-ink font-semibold shadow-[0_1px_2px_rgba(20,21,23,0.08)]' : 'text-ink-2 font-medium hover:text-ink'
              }`}
            >
              <Icon className="w-4 h-4" strokeWidth={1.75} />
              {largo}
            </button>
          );
        })}
      </nav>
      <button
        type="button"
        onClick={onOpenCuenta}
        aria-label="Cuenta y ajustes"
        className="w-11 h-11 rounded-full bg-surface-2 text-sm font-semibold flex items-center justify-center cursor-pointer hover:bg-line"
      >
        {iniciales}
      </button>
    </div>
  </header>
);
