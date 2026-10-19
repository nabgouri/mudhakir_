import * as WebBrowser from 'expo-web-browser';

import { supabase } from './client';

// Where Google sign-in returns to the app. It must be listed under the
// Supabase project's redirect URLs (docs/setup-supabase.md).
export const AUTH_REDIRECT = 'mudhakir://auth-callback';

export type SignInResult = 'signed-in' | 'cancelled';

// Signs in with Google through Supabase Auth, in the phone's browser. The
// browser comes back with a one-time code, which is exchanged for the
// session here.
export async function signInWithGoogle(): Promise<SignInResult> {
  if (supabase === null) throw new Error('Supabase is not configured');
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: AUTH_REDIRECT, skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } },
  });
  if (error) throw error;

  const result = await WebBrowser.openAuthSessionAsync(data.url, AUTH_REDIRECT);
  if (result.type !== 'success') return 'cancelled';

  const params = new URL(result.url).searchParams;
  const code = params.get('code');
  if (code === null) throw new Error(params.get('error_description') ?? 'Sign-in returned no code');
  const exchanged = await supabase.auth.exchangeCodeForSession(code);
  if (exchanged.error) throw exchanged.error;
  return 'signed-in';
}

// The signed-in account's email, or null when signed out.
export async function signedInEmail(): Promise<string | null> {
  if (supabase === null) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user.email ?? null;
}
