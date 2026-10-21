import 'react-native-url-polyfill/auto';
import { AppState, Platform } from 'react-native';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

const { supabaseUrl, supabaseAnonKey } = Constants.expoConfig?.extra ?? {};

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing supabaseUrl/supabaseAnonKey in app.json extra config');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// The access token lasts about an hour and supabase-js refreshes it on a
// timer, but iOS/Android pause that timer while the app is in the
// background. Without this, reopening the app after a while sent requests
// with an expired token: the cards fetch got a 401 and Home showed
// "No pudimos cargar tus tarjetas · Reintentar" (20 Oct 2026). This is the
// setup Supabase recommends for React Native: refresh only while active.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

// An error caused by the session (expired or rejected token) rather than
// the network or the data: refreshing the session first can fix it.
export function isAuthError(e: unknown): boolean {
  const err = e as { status?: number; code?: string; message?: string } | null;
  if (!err) return false;
  if (err.status === 401 || err.code === 'PGRST301' || err.code === 'PGRST303') return true;
  return /jwt|token.*expired|not authenticated|invalid claim/i.test(String(err.message ?? ''));
}
