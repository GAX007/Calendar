import React, { useState } from 'react';
import { Calendar, Mail, Lock, Eye, EyeOff, Sparkles, ArrowRight, ShieldCheck, AlertCircle, CheckCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

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
      setErrorMessage('Por favor introduce tu correo y contraseña.');
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
          setSuccessMessage(
            '¡Cuenta creada exitosamente! Se ha enviado un enlace de confirmación a tu correo. Revísalo para iniciar sesión.'
          );
          setMode('login');
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4 relative overflow-hidden font-sans">
      {/* Subtle background glow effect */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-cyan-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
        {/* App Logo & Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-600 to-indigo-500 text-white shadow-xl shadow-indigo-600/30 mb-4 ring-1 ring-white/20">
            <Calendar className="w-7 h-7" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
            CalendarAsist
          </h1>
          <p className="text-sm text-slate-400 mt-1.5 flex items-center justify-center gap-1.5">
            <span>Agenda inteligente multimodal</span>
            <Sparkles className="w-3.5 h-3.5 text-cyan-400 inline" />
          </p>
        </div>

        {/* Card */}
        <div className="bg-slate-900/90 backdrop-blur-xl border border-slate-800/80 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-black/60">
          {/* Mode Switcher Tabs */}
          <div className="flex p-1 bg-slate-950/80 rounded-2xl border border-slate-800/70 mb-6">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setErrorMessage(null);
                setSuccessMessage(null);
              }}
              className={`flex-1 py-2 text-xs font-semibold rounded-xl transition cursor-pointer ${
                mode === 'login'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Iniciar Sesión
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setErrorMessage(null);
                setSuccessMessage(null);
              }}
              className={`flex-1 py-2 text-xs font-semibold rounded-xl transition cursor-pointer ${
                mode === 'register'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Crear Cuenta
            </button>
          </div>

          {/* Notifications */}
          {errorMessage && (
            <div className="mb-5 p-3 rounded-xl bg-red-950/60 border border-red-800/60 text-red-200 text-xs flex items-start gap-2 animate-fadeIn">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="mb-5 p-3 rounded-xl bg-emerald-950/60 border border-emerald-800/60 text-emerald-200 text-xs flex items-start gap-2 animate-fadeIn">
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Correo Electrónico
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ejemplo@correo.com"
                  autoComplete="email"
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-slate-950/90 border border-slate-800 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Contraseña
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-slate-950/90 border border-slate-800 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition cursor-pointer p-1"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-semibold shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 transition cursor-pointer"
            >
              {loading ? (
                <span>Cargando...</span>
              ) : (
                <>
                  <span>{mode === 'login' ? 'Acceder a mi calendario' : 'Crear mi cuenta'}</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Privacy badge */}
          <div className="mt-6 pt-5 border-t border-slate-800/80 flex items-center justify-center gap-2 text-slate-400 text-xs">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Tus eventos son 100% privados y exclusivos para tu cuenta</span>
          </div>
        </div>

        {/* Guest fallback option */}
        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={continueAsGuest}
            className="text-xs text-slate-400 hover:text-slate-200 underline underline-offset-4 transition cursor-pointer"
          >
            Continuar en modo invitado (almacenamiento local en este navegador)
          </button>
        </div>
      </div>
    </div>
  );
};
