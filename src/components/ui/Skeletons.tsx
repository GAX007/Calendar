import React from 'react';

const block = 'rounded-2xl bg-slate-200/70 dark:bg-slate-800/70 animate-pulse';

// Placeholder while a lazily loaded module downloads
export const ModuleSkeleton: React.FC = () => (
  <div className="max-w-6xl mx-auto px-2.5 sm:px-6 flex flex-col gap-4" aria-busy="true" aria-label="Cargando">
    <div className={`${block} h-24`} />
    <div className="grid grid-cols-2 gap-3">
      <div className={`${block} h-20`} />
      <div className={`${block} h-20`} />
    </div>
    <div className={`${block} h-64`} />
  </div>
);

// First paint while the session is restored
export const AppShellSkeleton: React.FC = () => (
  <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col" aria-busy="true" aria-label="Iniciando CalendarAsist">
    <div className="h-[calc(env(safe-area-inset-top,0px)+3.75rem)] border-b border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 flex items-end pb-2 gap-2.5">
      <div className={`${block} w-11 h-11`} />
      <div className="flex flex-col gap-1.5">
        <div className={`${block} w-32 h-3 rounded-md`} />
        <div className={`${block} w-20 h-2.5 rounded-md`} />
      </div>
    </div>
    <div className="pt-4">
      <ModuleSkeleton />
    </div>
  </div>
);
