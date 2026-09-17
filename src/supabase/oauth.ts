import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { supabase } from './client';

WebBrowser.maybeCompleteAuthSession();

export function getOAuthRedirectUrl() {
  return Linking.createURL('auth-callback');
}

async function applySessionFromUrl(url: string): Promise<{ error: string | null }> {
  const parsed = Linking.parse(url.replace('#', '?'));
  const params = parsed.queryParams as Record<string, string | undefined> | null;
  if (!params) return { error: 'No response from the sign-in page.' };
  if (params.error) return { error: params.error_description ?? params.error ?? 'Sign-in failed.' };
  if (!params.access_token || !params.refresh_token) return { error: 'No session returned.' };

  const { error } = await supabase.auth.setSession({
    access_token: params.access_token,
    refresh_token: params.refresh_token,
  });
  return { error: error?.message ?? null };
}

export async function signInWithOAuthProvider(provider: 'google' | 'apple'): Promise<{ error: string | null }> {
  const redirectTo = getOAuthRedirectUrl();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) return { error: error.message };
  if (!data?.url) return { error: 'Could not start sign-in.' };

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type === 'cancel' || result.type === 'dismiss') return { error: null };
  if (result.type !== 'success' || !result.url) return { error: 'Sign-in was not completed.' };

  return applySessionFromUrl(result.url);
}
