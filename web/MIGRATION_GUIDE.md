# PalSpace — Phase 1 Migration Guide (Vite → Next.js + rebrand)

This covers **only Phase 1**: moving `web/` from Vite+TanStack Router to
Next.js App Router, and renaming Pulse → PalSpace / servers → spaces /
channels-in-a-space → topics. It does not touch image upload, Friends,
onboarding, the Discord-signup removal, or the visual redesign —
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
  redesign, OAuth account linking, Render cron/realtime setup**:
  all later phases, none started yet.

## 5. Deploying

- **Frontend**: Vercel (Next.js is a first-class target — remove the old
  `vercel.json` from `web/`, Next's zero-config detection handles it).
- **Backend / cron**: still Render, as before — nothing in this phase
  changes that plan.

Next step, whenever you're ready: Phase 2 (image upload fix + Friends +
onboarding + Settings profile panel + edit/delete + ownership rules wired
into the UI).

## 6. Phase 2, pass 1 — bug fixes (image upload, unread counts, comments/reactions)

This pass focused on the three "this feels broken" issues, at real
production depth — not stubs. Also ran an actual `next build` against the
whole project to catch structural bugs, not just eyeballing the code; it
found real ones (see below).

### Image upload

**Root cause: silent failure, not a PNG-specific bug.** `uploadMedia()`
always threw a real error on failure, but neither `HomeFeed.tsx` nor
`ChatView.tsx` had a `try/catch` around the call — the error just became
an unhandled promise rejection with nothing shown on screen. That almost
certainly explains "nothing happens when I try to post an image": it
wasn't that PNGs specifically failed, it's that *every* failure was
invisible, so whichever files you happened to test with looked broken.

Also fixed while in there:
- Client-side size cap raised from a leftover 5MB to 10MB, matching the
  bucket setting you already made
- MIME-type detection now falls back to the file extension when
  `file.type` comes back empty (a real, if uncommon, browser/OS quirk)
- The storage bucket + its RLS policies are now codified in
  `supabase/migrations/003_storage_and_engagement_fixes.sql` instead of
  being dashboard-only instructions in a doc — a missing/incomplete
  policy there is the single most likely other cause, and it's exactly
  the kind of setup step that's easy to half-do by hand
- Both HomeFeed and ChatView now show a real inline error + a loading
  spinner on the attach button while uploading

### Unread counts

**Root cause: the plumbing existed but was never connected.**
`getUnreadCounts()` worked fine in isolation; nothing ever called it, and
nothing kept it live. `unreadByChannel` sat at `{}` forever, so the
badge always read zero regardless of actual unread messages.

Fixed with a new `useUnreadCounts()` hook: fetches once on session-ready,
then tops up live via a realtime subscription to `messages` INSERT
events (unscoped subscription, but RLS still enforces you only ever
receive rows for channels you're actually a member of — see the comment
in `realtime.ts`). Wired into `app/(app)/layout.tsx` so it runs globally.
Per-topic unread badges now also show in `SecondarySidebar`, which
didn't exist before at all.

### Comments & reactions

- Reactions are now properly **toggleable** (click again to remove —
  previously you could only ever add, never remove, and there was no way
  to see your own reaction state)
- Reaction counts are now actually rendered (they existed in
  `feed_view.reaction_count` but nothing displayed them)
- `feed_view` now also returns `my_reactions` (migration 003) so the UI
  can highlight which reactions are yours
- Comments now show a real avatar, display name, and timestamp instead
  of just a bare username + text
- Comment send button (and Enter-to-send) now correctly disables on
  empty/whitespace-only input — same for post edits
- **Posts had no UPDATE/DELETE RLS policy in the database at all** —
  edit/delete on posts was structurally impossible server-side, not a
  missing-button problem. Migration 003 adds both, plus matching
  policies for comments, plus `edited_at` columns on both tables for the
  "edited" label

### Real bugs `next build` caught (worth knowing about)

- **`app/(app)/channels/@me/` never actually worked.** A folder named
  `@something` is reserved by the App Router for *parallel route slots*,
  not a literal URL segment — it was silently compiling to plain
  `/channels` with zero warning, never `/channels/@me`. Fixed by moving
  the real route to `app/(app)/channels/me/` and adding a `rewrites()`
  entry in `next.config.ts` so `/channels/@me` still works as the public
  URL (verified with a real build + server smoke test, not just reading
  the config).
- `src/pages/` as a folder name silently collides with Next's legacy
  Pages Router auto-detection, which broke every screen component's
  build ("found pages without a React Component as default export").
  Renamed to `src/screens/`.
- `usePathname()` / `useParams()` are typed as nullable in this Next
  version; a few components assumed non-null. Fixed with real
  null-coalescing / narrowing, not blanket `any`.
- The `package.json` had `next: "^15.5.0"` which resolved to a
  non-existent, broken `15.5.23` build in testing — pinned to the
  verified-working `15.1.6` exactly (no caret), so `npm install`
  reproduces what was actually tested here.

### What's still not done (next passes)

Friends system, onboarding (interests + contacts), full Settings profile
panel, the visual redesign, OAuth account linking, Render
cron/realtime infra. None started yet — this pass was scoped to the
three items you picked first, done properly rather than five things done
halfway.

### Assets

Per `assets/req.md`: default avatars, space icons, empty-state
illustrations, and a notification sound are referenced by path
(`/avatars/default-N.png`, `/illustrations/empty-feed.svg`, etc.) but not
bundled — you mentioned you've already prepared these but didn't upload
them here (they're heavy). Drop them into `public/avatars/`,
`public/illustrations/`, `public/space-icons/`, and `public/sounds/`
respectively and they'll pick up automatically; the empty-feed
illustration in particular is already wired with a graceful fallback (no
broken-image icon) if the file isn't there yet.

## 7. Visual correction pass — glow removed, Settings actually built

Two real misses from the previous pass, fixed here:

**The glow was overdesigned.** Diffuse gradient blooms behind text, soft
shadow halos on active nav items — that reads as generic "AI-generated
UI," not intentional design, and it wasn't consistent with the density
and restraint of the references you pointed at (Instagram's rail,
Discord's DM list). Removed: `.presence-glow` (soft blur-shadow) is gone
entirely, and the body's ambient radial-gradient background wash is gone
too. What's left of the presence-gradient system is just a **hard-edged
ring** on avatars (`.presence-ring`) — closer to Instagram's own
story-ring treatment than a glow effect — plus flat gradient fills on
avatars/space icons themselves. No blur, no bloom.

**Settings was still a stub with no way to actually customize a
profile**, despite `updateProfile()` already existing and working fine
in `profile.ts` — same pattern as the unread-counts bug from earlier:
the plumbing existed, nothing used it. Built out for real: avatar +
banner upload (reusing the same `uploadMedia()` used elsewhere, so it
gets the same error handling and MIME fallback), display name, pronouns,
status, bio, and an accent-color picker (6 presets + two native color
inputs) that feeds directly into the presence-gradient system — so
changing your colors here is what makes your avatar/messages/posts look
like *yours* everywhere else in the app.

**Assets were pointing at the wrong path.** Your repo has `assets/`
sitting next to this app (`<repo-root>/assets/`, `<repo-root>/web/`),
not nested inside it — the code was looking in the wrong place, would
never have found the files no matter what you did. Added
`scripts/copy-assets.mjs`, wired into `predev`/`prebuild`, which mirrors
`../assets/` into `public/` automatically on every build. See
`public/ASSETS.md` for the exact mapping.

## 8. Friends, account linking, unique usernames, Instagram-style feed

See `plan.md` for the scoping rationale. Summary of what actually
shipped in this pass (all verified with a real build, 10/10 routes):

- **Friends system built from scratch** — there was no `friends` table
  at all before this, not a UI gap. `supabase/migrations/004_friends_and_usernames.sql`
  adds `friend_requests` + RLS + a `friends_view`, plus notification
  triggers reusing the `friend_request`/`friend_accept` types already
  added in migration 003. New `/friends` screen (All / Pending / Add
  Friend tabs) and a real DM conversation list in the sidebar (previously
  a permanent empty-state placeholder).
- **Fixed a real bug while building the DM list**: `createOrGetDM` never
  deduped — messaging the same friend twice silently created a second,
  separate empty channel every time. Fixed by checking for an existing
  1:1 channel first (RLS on `channel_members` naturally scopes the check
  to shared channels, so no extra query needed).
- **Unique, editable usernames** — added the missing UNIQUE index +
  `is_username_available()` RPC, wired a debounced live check into
  Settings (green check / red X while typing).
- **Account linking** — `supabase.auth.linkIdentity()`/`unlinkIdentity()`
  wired into a new Connected Accounts section in Settings, so Google +
  Discord can live on one account instead of being separate sign-ups.
  **Requires "Manual Linking" enabled in Supabase Dashboard →
  Authentication → Providers** — off by default, this won't work until
  you toggle it.
- **Feed redesigned to the Instagram interaction model** — single heart
  (turns red + fills when liked, click again to unlike) replacing the
  3-emoji bar; comment button is now icon-only; added a share button
  (native share sheet on mobile, copies a link otherwise).
- **Fixed the profile-click bug** — post authors' names/avatars, and
  comment authors' names/avatars, were never actually wrapped in a
  `<Link>`. They looked clickable and weren't. Real bug, not a styling
  gap.

### Still queued (see plan.md)

Stories (full feature: expiring media + upload + viewer — not stubbed
in), and the Discord-style categorized Settings layout (the
functionality added this pass needs a home in that structure, not
retrofitted into the current single-scroll panel).
