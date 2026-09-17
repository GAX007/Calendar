import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isGuest: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string) => Promise<{ error: string | null; needsEmailConfirmation?: boolean }>;
  signOut: () => Promise<void>;
  continueAsGuest: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function mapAuthError(err: any): string {
  if (!err) return 'Error desconocido al autenticar.';
  const msg = (err.message || String(err)).toLowerCase();

  if (msg.includes('invalid login credentials') || msg.includes('invalid_credentials')) {
    return 'Correo o contraseña incorrectos.';
  }
  if (msg.includes('user already registered') || msg.includes('already exists')) {
    return 'Ya existe una cuenta con este correo electrónico. Inicia sesión.';
  }
  if (msg.includes('password should be at least 6') || msg.includes('weak_password')) {
    return 'La contraseña debe contener al menos 6 caracteres.';
  }
  if (msg.includes('email not confirmed')) {
    return 'Por favor confirma tu correo electrónico antes de iniciar sesión.';
  }
  if (msg.includes('rate limit')) {
    return 'Demasiados intentos. Espera unos momentos e inténtalo de nuevo.';
  }
  return err.message || 'Error en la autenticación.';
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isGuest, setIsGuest] = useState<boolean>(() => {
    return localStorage.getItem('calendarasist_guest_mode') === 'true';
  });

  useEffect(() => {
    if (!isSupabaseConfigured() || !supabase) {
      setLoading(false);
      return;
    }

    // Check active session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        setIsGuest(false);
        localStorage.removeItem('calendarasist_guest_mode');
      }
      setLoading(false);
    });

    // Listen to auth events
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        setIsGuest(false);
        localStorage.removeItem('calendarasist_guest_mode');
      }
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    if (!supabase) return { error: 'Supabase no está configurado.' };
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) return { error: mapAuthError(error) };
      setUser(data.user);
      setSession(data.session);
      setIsGuest(false);
      localStorage.removeItem('calendarasist_guest_mode');
      return { error: null };
    } catch (err: any) {
      return { error: mapAuthError(err) };
    }
  };

  const signUp = async (email: string, password: string) => {
    if (!supabase) return { error: 'Supabase no está configurado.' };
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });
      if (error) return { error: mapAuthError(error) };

      // If user is returned without active session, email confirmation might be required
      const needsEmailConfirmation = !data.session && Boolean(data.user);
      if (data.session) {
        setUser(data.user);
        setSession(data.session);
        setIsGuest(false);
        localStorage.removeItem('calendarasist_guest_mode');
      }
      return { error: null, needsEmailConfirmation };
    } catch (err: any) {
      return { error: mapAuthError(err) };
    }
  };

  const signOut = async () => {
    if (supabase) {
      await supabase.auth.signOut();
    }
    setUser(null);
    setSession(null);
    setIsGuest(false);
    localStorage.removeItem('calendarasist_guest_mode');
  };

  const continueAsGuest = () => {
    setIsGuest(true);
    localStorage.setItem('calendarasist_guest_mode', 'true');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        isGuest,
        signIn,
        signUp,
        signOut,
        continueAsGuest,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
