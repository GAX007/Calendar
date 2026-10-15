import React from 'react';
import { Calendar, CalendarDays, Dumbbell, GraduationCap, Sparkles } from 'lucide-react';
import { haptic } from '../utils/haptics';

export type AppTab = 'agenda' | 'university' | 'gym' | 'moodle' | 'planner';

interface BottomNavProps {
  activeTab: AppTab;
  onChange: (tab: AppTab) => void;
}

const ITEMS: Array<{ id: AppTab; label: string; Icon: React.ComponentType<{ className?: string }>; active: string }> = [
  { id: 'agenda', label: 'Agenda', Icon: Calendar, active: 'text-indigo-600 dark:text-indigo-400' },
  { id: 'planner', label: 'Plan', Icon: Sparkles, active: 'text-indigo-600 dark:text-indigo-400' },
  { id: 'moodle', label: 'Moodle', Icon: CalendarDays, active: 'text-amber-600 dark:text-amber-400' },
  { id: 'university', label: 'Uni', Icon: GraduationCap, active: 'text-blue-600 dark:text-blue-400' },
  { id: 'gym', label: 'Gym', Icon: Dumbbell, active: 'text-rose-600 dark:text-rose-400' },
];

// Mobile-only tab bar (desktop keeps the header tabs)
export const BottomNav: React.FC<BottomNavProps> = ({ activeTab, onChange }) => (
  <nav
    aria-label="Secciones"
    className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200/80 dark:border-slate-800 pb-[env(safe-area-inset-bottom,0px)]"
  >
    <div className="grid grid-cols-5 h-14">
      {ITEMS.map(({ id, label, Icon, active }) => {
        const isActive = activeTab === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => {
              if (!isActive) haptic(6);
              onChange(id);
            }}
            aria-current={isActive ? 'page' : undefined}
            className={`flex flex-col items-center justify-center gap-0.5 touch-manipulation active:scale-95 transition ${
              isActive ? active : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <span
              className={`flex items-center justify-center w-12 h-7 rounded-full transition ${
                isActive ? 'bg-slate-100 dark:bg-slate-800' : ''
              }`}
            >
              <Icon className="w-5 h-5" />
            </span>
            <span className={`text-[10px] leading-none ${isActive ? 'font-bold' : 'font-medium'}`}>{label}</span>
          </button>
        );
      })}
    </div>
  </nav>
);
