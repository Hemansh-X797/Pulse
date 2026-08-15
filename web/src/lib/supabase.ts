import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

// NOTE (migration from Vite): Vite exposes client env vars via
// import.meta.env.VITE_*. Next.js instead inlines process.env.NEXT_PUBLIC_*
// at build time. Your old VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY values
// are the same values — just rename the keys in .env.local (see
// .env.local.example in this project).
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// IMPORTANT: this module must not throw at import time. Next.js
// statically prerenders each route's server shell during `next build` —
// including routes that only render client components — and that
// prerender step imports this module in the build process itself. If it
// throws here (as an earlier version of this file did), the *entire
// build* fails with a prerender error on whichever route happened to
// import it first, even though the actual problem is just "env vars
// aren't visible to this build step" — a deploy-config issue, not a
// reason to hard-crash compilation. Warn instead, and let the real
// error surface naturally at runtime (as a failed network request) if
// someone actually tries to use a real Supabase call without the vars
// configured.
if (!supabaseUrl || !supabaseAnonKey) {
  const message =
    'NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are not set. Copy .env.local.example to ' +
    '.env.local locally, and add both as Environment Variables in your Vercel project settings for ' +
    'Production/Preview/Development — this is a per-environment setting, not something a committed ' +
    '.env file alone satisfies on Vercel.';
  if (typeof window !== 'undefined') {
    // eslint-disable-next-line no-console
    console.error(message);
  }
}

// The anon key is safe to ship in client bundles by design — Supabase's
// security model puts enforcement in Postgres Row Level Security
// (see supabase/schema.sql), not in hiding this key. Never put the
// service_role key in client code; that one bypasses RLS entirely and
// belongs only in a trusted server context (a Render cron job / API route
// with the key as a server-only env var).
export const supabase = createClient<Database>(supabaseUrl || 'https://placeholder.supabase.co', supabaseAnonKey || 'placeholder-anon-key', {
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});
