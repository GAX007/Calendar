import React from 'react';

const CHUNK_RELOAD_KEY = 'omniagenda_chunk_reload_at';
// After a deploy the old lazy chunks no longer exist on the server
const isChunkLoadError = (error: Error) =>
  /dynamically imported module|Importing a module script failed|ChunkLoadError|Unable to preload CSS/i.test(error.message);

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

// Keeps a crash inside one section from unmounting the whole app (blank screen on the phone)
export class ModuleErrorBoundary extends React.Component<Props, State> {
  // The project has no @types/react, so React.Component members are not typed
  declare props: Readonly<Props>;
  declare setState: (state: State) => void;
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('Error en la sección:', error);
    if (!isChunkLoadError(error)) return;
    try {
      // Reload once to fetch the new version; avoid a reload loop if the server is down
      const last = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) || 0);
      if (Date.now() - last > 30000) {
        sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
        window.location.reload();
      }
    } catch {
      // sessionStorage unavailable: show the error card
    }
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div role="alert" className="max-w-xl mx-4 sm:mx-auto mt-6 rounded-2xl border border-red-200 bg-red-50 p-5 text-slate-800">
        <h2 className="text-lg font-bold">No se ha podido abrir esta sección</h2>
        <p className="text-sm mt-1 text-slate-600 break-words">{error.message}</p>
        <div className="flex gap-2 mt-4 flex-wrap">
          <button type="button" onClick={() => this.setState({ error: null })} className="min-h-11 rounded-xl bg-indigo-600 px-4 text-sm font-bold text-white hover:bg-indigo-700">
            Reintentar
          </button>
          <button type="button" onClick={() => window.location.reload()} className="min-h-11 rounded-xl border border-slate-300 px-4 text-sm hover:bg-slate-100">
            Recargar la app
          </button>
        </div>
      </div>
    );
  }
}
