# HANDOVER.md — PalSpace

Read this before touching anything. This is a running log across many
build passes in one long conversation that's now being split off — the
person you're working with has been very hands-on and will push back
hard (rightly) on half-built features, generic "AI slop" UI, or
anything shipped without being actually build-tested. Match that bar.

## Ground rules learned the hard way in this conversation

1. **Always run a real `next build` before saying something is done.**
   Every single pass in this project has caught at least one real bug
   this way — see "Bugs found via build-testing" below. Typechecking
   alone is not enough; several bugs were structural (Next.js routing
   quirks) that only a full build catches.
2. **Never ship a UI toggle/button that nothing enforces server-side.**
   The unread-counts bug, the notification-preferences bug, and the
   blocked-users feature all taught this lesson: a setting is fake if
   nothing checks it. Wire toggles all the way to a DB trigger or RLS
   policy, not just to a `useState`.
3. **Never let an async call fail silently.** Multiple "nothing happens
   when I click X" bugs turned out to be a missing `try/catch` around a
   function that threw correctly but nobody caught it. Always show a
   real error state.
4. **Write `plan.md` before building anything non-trivial**, listing
   what's in-scope now vs. explicitly deferred. The person reads these
   and reacts well to honesty about scope, badly to silent corner-cutting.
5. **The person's tone is blunt/frustrated at times — that's about the
   product, not you.** Stay factual, keep fixing things, don't get
   defensive.
6. **Don't add gratuitous visual effects** (glows, blur blooms, ambient
   gradients) — was explicitly called out as "AI slop" once already and
   removed. Keep the presence-gradient identity system (see below) but
   nothing beyond hard-edged rings/fills.

## Repo layout (important, caused a real deploy bug once)

```
<repo-root>/
  assets/          <- source assets, NOT inside web/
  web/             <- this Next.js app (Vercel root directory = "web")
```
`scripts/copy-assets.mjs` (wired into `predev`/`prebuild`) mirrors
`../assets/` into `web/public/` automatically. See `public/ASSETS.md`
for the exact file → path mapping.

## Stack

- Next.js 15 App Router — **pin `next` to an exact patched version in
  package.json, no caret.** Already been bitten twice: once by a bogus
  `15.5.23` sandbox build, once by a real CVE (CVE-2025-66478) in
  `15.1.6` that Vercel actively blocks deploys for. Currently pinned to
  `15.1.9`. Check for newer CVEs before bumping.
- Supabase (Postgres + Auth + Storage + Realtime) — all business logic
  enforcement lives in RLS policies and DB triggers, not just app code.
- Tailwind v4, `next/font/google` (Fraunces/Inter/IBM Plex Mono).
- No Twilio (real per-message carrier cost, can't be made free — cut by
  request). No voice/video yet (see backlog).

## What's built (chronological, latest last)

1. **Vite → Next.js App Router migration**, PalSpace rebrand,
   servers→spaces / channels→topics terminology.
2. **Bug fixes**: image upload (was silently failing, no try/catch),
   unread counts (fetch existed, nothing called it), reactions/comments
   UX, posts had no UPDATE/DELETE RLS policy at all.
3. **Vercel deploy fixes**: `@me`-named folder is a reserved Next.js
   parallel-route slot, not a literal segment (moved to `channels/me` +
   rewrite); `src/pages/` collides with the legacy Pages Router
   (renamed to `src/screens/`); the CVE pin above.
4. **Visual design pass**: presence-gradient identity system (every
   person/space's `accent_color_top/bottom` renders as a ring/fill
   across avatars, messages, posts — this is the actual visual
   signature of the app, keep it, don't add unrelated effects on top).
   Later had to strip out glow/blur effects that read as generic.
5. **Settings restructured** into real categories:
   `app/(app)/settings/{profile,account,privacy,notifications,appearance}/`.
6. **Friends system** (built from scratch, table didn't exist before):
   requests, accept/decline, friends list, search. `Friends.tsx`,
   migration `004_friends_and_usernames.sql`.
7. **Blocking, with real enforcement** (`blocked_users` table + 3
   triggers: feed filtering, friend-request rejection, message
   rejection), **notification preferences** (5 toggles, each gated in
   the trigger that fires that notification type), **Stories** (24h
   expiry via RLS filter, tray with gradient rings, tap-through viewer)
   — all in migration `005_blocking_notification_prefs_stories.sql`.
8. **Nav cleanup**: removed redundant Friends rail icon (Friends now
   lives only at the top of the DM sidebar — matches Discord's own
   structure, which doesn't have a separate Friends app icon either).
   Logo swapped in for the brand dot, no "PalSpace" text next to it.
9. **Profile popover**: click a name/avatar (feed posts, chat messages)
   → compact card; click the avatar *inside the popover* → full profile
   page. `src/components/profile/ProfilePopover.tsx`.
10. **Real image cropper** for avatar/banner upload — drag to pan, zoom
    slider, circular/rect guide, canvas export.
    `src/components/settings/CropModal.tsx`.
11. **Emoji picker** (reuses the existing `emoji.ts` shortcode map) and
    **GIF picker** (real Giphy search, needs
    `NEXT_PUBLIC_GIPHY_API_KEY`, free tier) in the chat compose bar.
12. **Compact mode** toggle (Settings → Appearance), real, wired to
    `ChatView` spacing.

## KNOWN BUGS — reported by the person, not yet fixed

### 1. "Message" button does nothing when clicked from Friends list
`Friends.tsx`'s `handleMessage()` and (check) `UserProfile.tsx`'s
equivalent call `createOrGetDM(username)` **with no try/catch**. If it
throws, the click silently does nothing — same bug class as #3 in "what
was fixed" above, just not caught here yet.

**Leading suspect for *why* it throws**: `createOrGetDM` (in
`src/lib/api/channels.ts`) inserts two `channel_members` rows in one
`insert()` call for a brand-new channel. If the `channel_members` INSERT
RLS policy requires you to already be a member of the channel to insert
into it (a very plausible policy shape for "only members can manage
membership"), that's a chicken-and-egg failure for the *first* two rows
of a new channel — RLS would reject the insert. **Check
`supabase/schema.sql`'s policy on `channel_members` INSERT first.** If
that's the cause, the fix is either a `SECURITY DEFINER` RPC that
creates the channel + both member rows atomically, or a policy carve-out
for "you can insert yourself + one other user when creating a new
1:1 channel you're initiating."

Second thing to fix regardless of root cause: **add try/catch + a
visible error message** in both call sites, same pattern used
everywhere else in this project (`uploadError` state, etc.) — silent
failure should never happen again per rule #3 above.

### 2. Story upload: "you must be signed in to upload media"
Fires from `MediaUploadError` in `src/lib/api/media.ts`, meaning
`supabase.auth.getUser()` returned no user at the moment of upload.
Rest of the app (chat image upload, avatar upload) apparently works, so
this isn't a broken auth setup — likely a **session-hydration timing
race** specific to how `/stories` is reached (possibly a hard
navigation/fresh load before the Supabase client finishes restoring the
session from storage, if `/stories` was opened directly rather than
navigated to from within the app). Investigate:
- Does `getSession()`/`getUser()` get awaited anywhere before the file
  input becomes clickable on `/stories`?
- Compare against `HomeFeed.tsx`'s upload flow (reportedly working) for
  what's different about the auth-readiness assumption.
- Consider gating the upload button on `useAppStore(s => s.session)`
  being non-null (already available in the store) rather than trusting
  a fresh `getUser()` call to always succeed.

## Explicit new instruction from this message, not yet done

**Add a "Spaces" section directly below the Stories section** in the
nav — the person didn't specify exact placement beyond "just below
stories," so read the current `GlobalNav.tsx`/`SecondarySidebar.tsx`
structure and use judgment on whether this means: (a) a new rail item,
or (b) surfacing the spaces list somewhere in the main sidebar/tray
area near Stories rather than only in the rail. Ask if genuinely
ambiguous rather than guessing wrong on nav structure again.

## Feature backlog (from the message that triggered this handover)

**Long-term / do NOT build now — keep in plan.md only:**
- Premium tiers: "Exclusive Pal" $5.99/mo, "Gold Pal" $9.99/mo. No
  scope defined yet (what's exclusive, what's gold-only). Needs a real
  scoping conversation (payment provider — Stripe is the obvious
  free-to-integrate choice since it only charges on successful
  transactions, unlike a fixed monthly cost — plus what each tier
  actually unlocks) before any implementation.
- Zero-latency WebRTC voice/video — real infrastructure project
  (signaling server, SFU or mesh, TURN/STUN), not a feature-sized task.
  Already flagged once before in this conversation; still not started.

**Near-term, concrete asks not yet built:**
- **Fix bugs #1 and #2 above first** — they're regressions, not new
  features.
- **Post redesign** — explicitly called "shit" as of this message,
  despite earlier passes touching reactions/icons. Needs a fresh look
  at `HomeFeed.tsx`'s `PostCard`, likely a real visual/layout rework,
  not just icon swaps this time. Ask for specifics on what's wrong if
  unclear (spacing? typography? card structure? image handling?).
- **Full markdown support** in posts/messages: `#`/`##`/`###`/`####`
  headers, `**bold**`, `*italic*`, `__underline__`, `~~strikethrough~~`,
  `@mention`, `||spoiler||`, ordered/unordered lists, ` ``` ` code
  blocks, `[text](link)` hyperlinks, `>` blockquote, `--text--` for
  small/faint text. Current `emoji.ts`-based renderer only handles
  emoji shortcodes — this needs a real markdown parser (consider a
  small library rather than hand-rolling all of the above; `||spoiler||`
  and `--faint--` are non-standard Discord-style extensions worth
  writing custom regex passes for on top of a base parser).
- **Video stories** — up to 30 seconds, "click to go live from camera."
  Needs `MediaRecorder` API for capture, a duration cap enforced during
  recording (not just after), and a `stories` schema change (currently
  image-only — `media_url` field could stay, but may need a
  `media_type` column added, mirroring how `messages` already
  distinguishes image/audio).
- **`manifest.json`, `robots.ts`, `sitemap.ts`** — quick, standard
  Next.js metadata files, no real design decisions needed beyond
  confirming PalSpace's brand colors/icons for the manifest.
- **Local caching via Dexie** (IndexedDB) — person explicitly asked to
  weigh lag/bandwidth cost first. Reasonable candidates: cached
  feed/message history for instant paint on reload, NOT a replacement
  for Supabase Realtime as source of truth. Scope this carefully; don't
  cache things RLS-sensitive without thinking through staleness.
- **More connected-account providers**: GitHub, Twitter/X, and
  Instagram *if Supabase supports it* (check current Supabase Auth
  provider list — Instagram support has historically been limited/via
  Facebook Login, verify before promising it). Extends the existing
  `linkProvider()`/`unlinkProvider()` pattern in
  `src/lib/api/auth.ts` and the Connected Accounts section in
  `AccountSettings.tsx` — same pattern as Google/Discord, just more
  provider buttons, but each needs its own OAuth app registered.
- **Better onboarding** during signup and space creation — no current
  onboarding flow exists beyond bare signup; needs actual design work
  (steps? interests? starter space templates?), not just polish.
- **Tenor GIF support** alongside Giphy — reasonable since it's also
  free-tier; today only Giphy is wired (`GifPicker.tsx`).
- **OpenGraph cards for links** posted in chat/feed — needs a
  server-side fetch-and-parse step (can't fetch arbitrary URLs from the
  client due to CORS), likely a small Next.js Route Handler that fetches
  a URL's `<meta>` tags and returns title/description/image, cached.
- **Profile popup redesign** to match the Discord reference screenshot
  from a few messages back — bottom section with nameplate, pfp, name,
  and quick actions. Needs asset input from the person: **nameplates
  and avatar decorations don't exist as a concept in the schema or UI
  yet** — ask them to describe the visual style/dimensions if they want
  these built, or treat as a placeholder-first build (structure now,
  real assets later).
- **Custom display-name styling** (mentioned alongside nameplates) —
  unclear scope, ask for clarification (font? color? both?).

## Assets status

See `public/ASSETS.md` in the repo for the current mapping. Nameplates
and avatar decorations (new asks) have no assets yet — flag to the
person that these need either provided files or a description
(dimensions, style) before they can be built for real rather than
guessed at.

## Migrations, in order

Run against Supabase in this exact order if not already applied:
`001_initial_schema.sql` (baseline) → `002_rename_servers_to_spaces.sql`
→ `003_storage_and_engagement_fixes.sql` →
`004_friends_and_usernames.sql` →
`005_blocking_notification_prefs_stories.sql`. Also: "Manual Linking"
must be enabled in Supabase Dashboard → Authentication → Providers for
the Google/Discord account-linking feature to work at all.

## Immediate next steps for whoever picks this up

1. Read this whole doc.
2. Fix bug #1 (message button) — check the RLS policy hypothesis first,
   it's the most likely root cause.
3. Fix bug #2 (story upload auth error) — investigate the session-
   timing hypothesis.
4. Write a fresh `plan.md` for the redesigned posts + markdown +
   manifest/robots/sitemap slice (the concrete, bounded items from the
   backlog above) before building any of it.
5. Confirm the "Spaces section below Stories" nav placement with the
   person if it's not obvious from context once you're looking at the
   current nav code.
