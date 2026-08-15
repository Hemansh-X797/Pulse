# PalSpace — Phase 1 Migration Guide (Vite → Next.js + rebrand)

This covers **only Phase 1**: moving `web/` from Vite+TanStack Router to
Next.js App Router, and renaming Pulse → PalSpace / servers → spaces /
channels-in-a-space → topics. It does not touch image upload, Friends,
onboarding, the Discord-signup removal, Twilio, or the visual redesign —
those are Phases 2–4 from the plan, done as separate follow-ups so each is
reviewable on its own.

## 1. Install & run

```bash
cd palspace-web
npm install
cp .env.local.example .env.local   # fill in your real Supabase anon key
npm run dev
```

## 2. Apply the database migration

Your Supabase project already has the old schema (`servers`, `server_id`,
etc.) from `supabase/schema.sql`. Run the new migration against it:

```bash
# via Supabase SQL editor, or:
psql "$SUPABASE_DB_URL" -f supabase/migrations/002_rename_servers_to_spaces.sql
```

**Take a backup first if you have real user data.** This is a structural
migration (table renames, dropped/recreated trigger functions), wrapped in
a transaction, but structural changes are exactly the kind of thing you
want a rollback point for regardless.

What it does, concretely:
- `servers` → `spaces`, `server_members` → `space_members`
- `server_id` columns → `space_id`
- Recreates the three trigger functions that create a default topic on
  space creation, grant topic access on join, etc. — their *bodies*
  referenced the old names as literal SQL text, so a plain table rename
  alone would have silently broken them at next execution
- Adds `transfer_space_ownership()` and `leave_or_delete_space()` RPCs
  that enforce your rule server-side: sole real member of a space must
  delete it to leave; owner with other members must transfer ownership
  first. (Real vs. bot is via a new `profiles.is_bot` column, defaulted
  to `false` for everyone until bots exist — the rule activates
  automatically once you add bot accounts, no second migration needed.)
- Widens the `notifications.type` check constraint to allow
  `space_invite`, `friend_request`, `friend_accept` (used once Friends
  ships in Phase 2)

**Regenerate `database.types.ts` for real** once this is live:
```bash
supabase gen types typescript --project-id zfuctxrbvdvrkxagqtvg > src/lib/database.types.ts
```
The version in this project is hand-edited to match the migration, same
as the original was hand-written — treat it as a starting point, not the
source of truth going forward.

## 3. What changed in the app code

| Old (Vite) | New (Next.js) |
|---|---|
| `import.meta.env.VITE_SUPABASE_URL` | `process.env.NEXT_PUBLIC_SUPABASE_URL` |
| TanStack Router (`createRoute`, `<Link to=... params=...>`) | Next.js App Router (`app/**/page.tsx`, `next/link`, `next/navigation`) |
| `src/routes/router.tsx` central route tree | file-based routes under `app/` |
| `beforeLoad` session guard (redirects before render) | `app/(app)/layout.tsx` client-side guard via `useEffect` (redirects one frame after mount — see comment in that file for why, and the Phase 4 hardening note about moving to `@supabase/ssr` + `middleware.ts` for zero-flash protection) |
| `servers.ts` API module, `Server`/`Channel` types, `guildId` param | `spaces.ts`, `Space`/`Topic` types, `spaceId` param |
| Route `/channels/$guildId` | Route `/spaces/[spaceId]` |
| Route `/channels/$guildId/$channelId` | Route `/spaces/[spaceId]/[topicId]` |
| "?" avatar button = instant logout | avatar links to `/settings`, logout lives there with a confirm step |

Everything else (ChatView, HomeFeed, feed/media/profile API modules,
realtime.ts, the Zustand store shape besides the guild→space rename) is
functionally unchanged — same logic, just relocated into the new file
layout and, where relevant, re-typed against the renamed tables.

## 4. Known gaps, intentionally not fixed in this pass

- **Login page**: still email/password + Google/Discord buttons side by
  side. The "Google-only signup, link everything else after" flow is a
  Phase 3 item.
- **Settings page**: minimal shell (just logout, with confirmation). Full
  profile customization is Phase 2.
- **Image upload bug**: not investigated yet in this pass — likely a
  Supabase Storage bucket policy or MIME-type allowlist issue given it's
  scoped to "posts" specifically. Phase 2.
- **Friends, onboarding (interests + contacts), search/hashtags, visual
  redesign, Twilio, OAuth account linking, Render cron/realtime setup**:
  all later phases, none started yet.

## 5. Deploying

- **Frontend**: Vercel (Next.js is a first-class target — remove the old
  `vercel.json` from `web/`, Next's zero-config detection handles it).
- **Backend / cron**: still Render, as before — nothing in this phase
  changes that plan.

Next step, whenever you're ready: Phase 2 (image upload fix + Friends +
onboarding + Settings profile panel + edit/delete + ownership rules wired
into the UI).
