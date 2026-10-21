// Supabase's REST API for the routine's scripts, with the service role.
//
// SUPABASE_URL names the project. The service-role key is a network secret
// of the routine's environment: the agent proxy adds it to requests for the
// Supabase host, so it is never in this session. Run anywhere else, the key
// is read from SUPABASE_SERVICE_ROLE_KEY.

import { createHash } from 'node:crypto';

import { EnvHttpProxyAgent, fetch } from 'undici';

// Node's own fetch ignores HTTPS_PROXY and connects straight to Supabase,
// so in the routine's environment a request would miss the agent proxy and
// arrive without the key (401, "No API key found in request"). Requests go
// through the proxy whenever the environment names one.
const dispatcher = process.env.HTTPS_PROXY || process.env.https_proxy ? new EnvHttpProxyAgent() : undefined;

export async function supabase(path: string, init: { method?: string; body?: string } = {}): Promise<unknown> {
  const url = process.env.SUPABASE_URL;
  if (!url) throw new Error('Set SUPABASE_URL to the Supabase project URL (https://<project-ref>.supabase.co).');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (key) {
    headers.apikey = key;
    // A legacy service_role key is a JWT and also goes in Authorization; a
    // secret key (sb_secret_…) goes in apikey only.
    if (!key.startsWith('sb_')) headers.Authorization = `Bearer ${key}`;
  }
  const response = await fetch(`${url.replace(/\/+$/, '')}/rest/v1/${path}`, { ...init, headers, dispatcher });
  const text = await response.text();
  if (!response.ok) throw new Error(`${path} failed (${response.status}): ${text}`);
  return JSON.parse(text);
}

export async function rpc(name: string, args: Record<string, unknown>): Promise<string> {
  return (await supabase(`rpc/${name}`, { method: 'POST', body: JSON.stringify(args) })) as string;
}

// Whether `text` is the part's Transcript text the phone sent: its SHA-256
// matches the digest the phone stored for the part (`transcript_digests`).
export async function isSentTranscript(lessonId: string, partIndex: number, text: string): Promise<boolean> {
  const rows = (await supabase(`lessons?id=eq.${lessonId}&select=transcript_digests`)) as {
    transcript_digests: string[];
  }[];
  const sent = rows[0]?.transcript_digests[partIndex];
  return sent !== undefined && sent === createHash('sha256').update(text, 'utf8').digest('hex');
}

export async function fail(lessonId: string, partIndex: number, reason: string): Promise<void> {
  const status = await rpc('fail_lesson_part', { p_lesson_id: lessonId, p_part_index: partIndex, p_error: reason });
  console.log(`Recorded part ${partIndex} of Lesson ${lessonId} as failed. The Lesson is now ${status}.`);
}
