import 'expo-sqlite/localStorage/install';
import './webcrypto';

import { createClient, processLock, type SupabaseClient } from '@supabase/supabase-js';

// The student's Supabase project, from the build's environment
// (docs/setup-supabase.md). Both values are public: row-level security is
// what keeps the data private. Without them the app works as before, only
// without sign-in and backup.
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_KEY;

// The session is kept in expo-sqlite's key-value store, so it survives a
// restart and is readable from the background task.
export const supabase: SupabaseClient | null =
  url && key
    ? createClient(url, key, {
        auth: {
          storage: localStorage,
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false,
          flowType: 'pkce',
          lock: processLock,
        },
      })
    : null;

// The client, for code that only runs once Supabase is configured.
export function client(): SupabaseClient {
  if (supabase === null) throw new Error('Supabase is not configured');
  return supabase;
}
