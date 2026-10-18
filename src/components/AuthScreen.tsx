import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const campo = 'w-full h-12 rounded-xl border border-line-2 bg-white px-3.5 text-[15px] text-ink outline-none focus:border-ink';

export const AuthScreen: React.FC = () => {
  const { signIn, signUp, continueAsGuest } = useAuth();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!email || !password) {
      setErrorMessage('Introduce tu correo y tu contraseña.');
      return;
    }

    if (password.length < 6) {
      setErrorMessage('La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'login') {
        const { error } = await signIn(email, password);
        if (error) {
          setErrorMessage(error);
        }
      } else {
        const { error, needsEmailConfirmation } = await signUp(email, password);
        if (error) {
          setErrorMessage(error);
        } else if (needsEmailConfirmation) {
          setSuccessMessage('Cuenta creada. Te hemos enviado un enlace de confirmación al correo; ábrelo y vuelve para entrar.');
          setMode('login');
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const cambiarModo = (m: 'login' | 'register') => {
    setMode(m);
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  return (
    <div className="min-h-screen bg-white text-ink flex justify-center px-5 pt-[calc(env(safe-area-inset-top,0px)+4rem)] pb-10 font-sans">
      <div className="w-full max-w-sm flex flex-col gap-8">
        <header className="flex flex-col gap-2">
          <span className="w-11 h-11 rounded-full bg-accent" aria-hidden="true" />
          <h1 className="mt-4 text-[34px] leading-[1.05] font-semibold tracking-[-0.025em]">CalendarAsist</h1>
          <p className="text-[15px] leading-[1.45] text-ink-2">Tu agenda, tus entregas y tu entreno en un sitio.</p>
        </header>

        <nav aria-label="Acceso" className="grid grid-cols-2 gap-0.5 p-[3px] rounded-[15px] bg-surface-2">
          {([['login', 'Entrar'], ['register', 'Crear cuenta']] as const).map(([m, etiqueta]) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => cambiarModo(m)}
              className={`h-11 rounded-xl text-[14.5px] transition ${mode === m ? 'bg-white font-semibold shadow-[0_1px_2px_rgba(20,21,23,0.08)]' : 'text-ink-2 font-medium'}`}
            >
              {etiqueta}
            </button>
          ))}
        </nav>

        {errorMessage && <p role="alert" className="-mt-4 rounded-2xl bg-red-50 text-red-800 px-4 py-3 text-[14.5px]">{errorMessage}</p>}
        {successMessage && <p role="status" className="-mt-4 rounded-2xl bg-surface px-4 py-3 text-[14.5px]">{successMessage}</p>}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 -mt-2">
          <label className="flex flex-col gap-1.5 text-[13px] text-ink-2">
            Correo
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@correo.com"
              autoComplete="email"
              className={campo}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-[13px] text-ink-2">
            Contraseña
            <span className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                className={`${campo} pr-12`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                className="absolute right-0.5 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full flex items-center justify-center text-ink-2 hover:text-ink"
              >
                {showPassword ? <EyeOff className="w-[18px] h-[18px]" strokeWidth={1.75} /> : <Eye className="w-[18px] h-[18px]" strokeWidth={1.75} />}
              </button>
            </span>
          </label>

          <button
            type="submit"
            disabled={loading}
            className="mt-2 h-[54px] rounded-full bg-ink text-white text-[15.5px] font-semibold disabled:opacity-50 active:scale-[0.99] transition cursor-pointer"
          >
            {loading ? 'Un momento…' : mode === 'login' ? 'Entrar' : 'Crear mi cuenta'}
          </button>
        </form>

        <p className="text-[13.5px] text-ink-2 -mt-2">Tus datos son privados y solo los ves tú.</p>

        <button
          type="button"
          onClick={continueAsGuest}
          className="self-start -ml-3 h-11 px-3 rounded-full text-sm font-semibold underline underline-offset-4 hover:bg-black/5"
        >
          Seguir sin cuenta (solo en este navegador)
        </button>
      </div>
    </div>
  );
};
