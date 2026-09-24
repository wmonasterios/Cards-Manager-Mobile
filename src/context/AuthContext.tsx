import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../supabase/client';
import { signInWithOAuthProvider, signInWithApple as signInWithAppleNative } from '../supabase/oauth';

type AuthContextValue = {
  session: Session | null;
  loading: boolean;
  signUp: (email: string, password: string) => Promise<{ error: string | null; needsConfirmation: boolean }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  confirmSignup: (email: string, code: string) => Promise<{ error: string | null }>;
  resendConfirmation: (email: string) => Promise<{ error: string | null }>;
  signInWithGoogle: () => Promise<{ error: string | null }>;
  signInWithApple: () => Promise<{ error: string | null }>;
};

const AUTH_TIMEOUT_MS = 12000;
const TIMEOUT_MESSAGE = 'Network timeout. Check your connection and try again.';

function withTimeout<T>(promise: PromiseLike<T>, ms = AUTH_TIMEOUT_MS): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(TIMEOUT_MESSAGE)), ms);
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let settled = false;
    const finish = (nextSession: Session | null) => {
      if (settled) return;
      settled = true;
      setSession(nextSession);
      setLoading(false);
    };

    // Never let a stalled or failed session check block the whole app from rendering.
    const timeout = setTimeout(() => finish(null), 4000);

    supabase.auth
      .getSession()
      .then(({ data }) => {
        clearTimeout(timeout);
        finish(data.session);
      })
      .catch(() => {
        clearTimeout(timeout);
        finish(null);
      });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => {
      clearTimeout(timeout);
      sub.subscription.unsubscribe();
    };
  }, []);

  const signUp = async (email: string, password: string) => {
    try {
      const { data, error } = await withTimeout(supabase.auth.signUp({ email, password }));
      if (error) return { error: error.message, needsConfirmation: false };
      return { error: null, needsConfirmation: !data.session };
    } catch (e: any) {
      return { error: e?.message ?? TIMEOUT_MESSAGE, needsConfirmation: false };
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await withTimeout(supabase.auth.signInWithPassword({ email, password }));
      return { error: error?.message ?? null };
    } catch (e: any) {
      return { error: e?.message ?? TIMEOUT_MESSAGE };
    }
  };

  const signOut = async () => {
    try {
      await withTimeout(supabase.auth.signOut());
    } catch {
      // Best-effort: local session state is cleared via onAuthStateChange regardless.
    }
  };

  const confirmSignup = async (email: string, code: string) => {
    try {
      const { error } = await withTimeout(supabase.auth.verifyOtp({ email, token: code, type: 'signup' }));
      return { error: error?.message ?? null };
    } catch (e: any) {
      return { error: e?.message ?? TIMEOUT_MESSAGE };
    }
  };

  const resendConfirmation = async (email: string) => {
    try {
      const { error } = await withTimeout(supabase.auth.resend({ type: 'signup', email }));
      return { error: error?.message ?? null };
    } catch (e: any) {
      return { error: e?.message ?? TIMEOUT_MESSAGE };
    }
  };

  const signInWithGoogle = () => signInWithOAuthProvider('google');
  const signInWithApple = () => signInWithAppleNative();

  const value = useMemo(
    () => ({
      session,
      loading,
      signUp,
      signIn,
      signOut,
      confirmSignup,
      resendConfirmation,
      signInWithGoogle,
      signInWithApple,
    }),
    [session, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
