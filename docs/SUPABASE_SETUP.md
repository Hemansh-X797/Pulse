# Setting up Supabase for Pulse (web client)

~10 minutes, no credit card required for the free tier (fine for
building and testing; upgrade when real usage shows up).

## 1. Create the project

1. [supabase.com](https://supabase.com) → New project.
2. Pick a region close to your users, set a database password (save it
   somewhere — you won't need it day-to-day since the client uses the
   anon key, but you'll want it for direct `psql` access later).

## 2. Run the schema

1. Project dashboard → **SQL Editor** → **New query**.
2. Paste the entire contents of `supabase/schema.sql`, run it top to
   bottom. It creates every table, RLS policy, trigger, and the
   `feed_view`/`channel_unread_counts` helpers in one pass.
3. Verify: **Table Editor** should now show `profiles`, `servers`,
   `channels`, `messages`, `posts`, `notifications`, etc.

## 3. Enable Realtime

The schema already runs `alter publication supabase_realtime add table
...` for `messages` and `notifications` — check **Database → Replication**
to confirm both show as enabled. If not, toggle them on there.

## 4. Enable Google & Discord sign-in

**Authentication → Providers** in the dashboard:

- **Google**: toggle on, paste in a Client ID/Secret from a Google Cloud
  OAuth app (same app-creation steps as before — see the "Google" section
  of `docs/OAUTH_SETUP.md`, which still applies here; only the redirect
  URI changes). Set the redirect URI in Google Cloud Console to the
  callback URL Supabase shows you on this page (looks like
  `https://<project-ref>.supabase.co/auth/v1/callback`).
- **Discord**: same shape — toggle on, paste Client ID/Secret from a
  Discord Developer Portal app, set that same Supabase callback URL as
  the Discord app's redirect.

This is the entire OAuth integration. No code, no TLS client, no token
exchange to write — Supabase Auth does the whole authorization-code flow.

## 5. Create the media storage bucket

**Storage → New bucket**:
- Name: `media`
- Public bucket: **on** (so uploaded images/avatars are viewable via
  their public URL without a signed-request round-trip)

Add a policy allowing authenticated users to upload (Storage → `media`
bucket → Policies → New policy → "Give users authenticated access" preset
covers this in one click, or write it manually:
```sql
create policy "authenticated users can upload media"
on storage.objects for insert
with check (bucket_id = 'media' and auth.role() = 'authenticated');

create policy "media is publicly readable"
on storage.objects for select
using (bucket_id = 'media');
```

## 6. Get your API keys

**Project Settings → API**:
- **Project URL** → `VITE_SUPABASE_URL`
- **anon public** key → `VITE_SUPABASE_ANON_KEY`

Copy `web/.env.example` to `web/.env.local` and fill both in.

**Never** copy the `service_role` key into the web client — that key
bypasses RLS entirely. It only belongs in a trusted server context (a
Vercel serverless function with it set as a server-only env var), and
nothing in this project needs one yet.

## 7. Run it locally

```bash
cd web
npm install
npm run dev
```

## 8. Deploy on Vercel

This is the part that's genuinely just three clicks with this
architecture — no VM, no Dockerfile, no managing a persistent process:

1. Push the repo to GitHub.
2. [vercel.com/new](https://vercel.com/new) → import the repo.
3. Set **Root Directory** to `web`.
4. Add the two env vars from Step 6 under **Environment Variables**.
5. Deploy.

`web/vercel.json` already handles the SPA rewrite (every path serves
`index.html` so TanStack Router's client-side routing works on refresh
and direct links). No further config needed.

## Regenerating types for real

`web/src/lib/database.types.ts` is hand-written right now (matching
`supabase/schema.sql` exactly) since there's no live project to generate
against yet. Once yours exists, replace it with the real generated
version and never hand-edit again:

```bash
npx supabase gen types typescript --project-id <your-project-ref> > src/lib/database.types.ts
```

## What this replaced from the C++/Postgres version

| Old (C++ server) | New (Supabase) |
|---|---|
| Hand-built OpenSSL TLS client + Google/Discord OAuth flow (`server/src/auth/oauth.hpp`, `https_client.hpp`) | Two toggles in the dashboard |
| Hand-built RFC 6455 WebSocket server (`server/src/chat/chat_server.hpp`) | `supabase.channel().on('postgres_changes', ...)` |
| `libpqxx` + a mutex serializing every DB call (the concurrency bug from the Postgres migration) | Supabase manages connection pooling server-side |
| Base64-JSON media upload workaround (`media_store.hpp`) | Direct `File` upload to Storage |
| Manual permission checks in every endpoint (`is_server_member()`, `message_sender() == uid`, etc.) | Row Level Security policies in `supabase/schema.sql` |
| A VM/Render service that has to stay running | Nothing to keep running — Vercel serves static files, Supabase manages the backend |

The C++ server and `client-web/` (the vanilla-JS client) still exist in
this repo and still work — they're the path to a native
desktop/mobile client later, once there's real usage data suggesting
raw performance actually matters. Building that now would be optimizing
for a problem you don't have yet.
