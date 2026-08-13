import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copy .env.example to .env.local ' +
      'and fill in your Supabase project values (Project Settings → API).'
  );
}

// The anon key is safe to ship in client bundles by design — Supabase's
// security model puts enforcement in Postgres Row Level Security
// (see supabase/schema.sql), not in hiding this key. Never put the
// service_role key in client code; that one bypasses RLS entirely and
// belongs only in a trusted server context (a Vercel serverless function
// with the key as a server-only env var, if you ever need one).
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});
