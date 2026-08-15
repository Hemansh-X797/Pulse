import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

// NOTE (migration from Vite): Vite exposes client env vars via
// import.meta.env.VITE_*. Next.js instead inlines process.env.NEXT_PUBLIC_*
// at build time. Your old VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY values
// are the same values — just rename the keys in .env.local (see
// .env.local.example in this project).
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY. Copy .env.local.example to ' +
      '.env.local and fill in your Supabase project values (Project Settings → API).'
  );
}

// The anon key is safe to ship in client bundles by design — Supabase's
// security model puts enforcement in Postgres Row Level Security
// (see supabase/schema.sql), not in hiding this key. Never put the
// service_role key in client code; that one bypasses RLS entirely and
// belongs only in a trusted server context (a Render cron job / API route
// with the key as a server-only env var).
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});
