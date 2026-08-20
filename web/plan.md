# plan.md — bug fixes this pass + scoping for what's next

Previous plan.md (nav cleanup / popover / cropper / emoji-GIF pickers)
is done — see HANDOVER.md items 8-12. Replacing it with this pass's
scope, per the "write plan.md before building anything non-trivial"
rule.

## Done this pass

### 1. "Message" button doing nothing (Friends list + profile page)
Confirmed the RLS hypothesis from HANDOVER.md: `createOrGetDM()` was
inserting two `channel_members` rows (me + the other user) in one
`insert()` call. The "users can add themselves to a channel" policy
only allows `user_id = auth.uid()`, so the second row was rejected —
Supabase's insert is all-or-nothing, so the whole call threw, and
nothing caught it.

Fix:
- `supabase/migrations/006_fix_dm_creation_rls.sql` — a
  `SECURITY DEFINER` RPC (`create_dm_channel`) that creates the channel
  and both membership rows atomically, re-checks for an existing DM
  server-side (race guard), and enforces blocking at the same layer as
  everything else that checks `blocked_users`.
- `src/lib/api/channels.ts` — `createOrGetDM` now calls the RPC instead
  of doing the two-step insert client-side.
- `src/screens/Friends.tsx` and `src/screens/UserProfile.tsx` — wrapped
  `handleMessage()` in try/catch with a visible dismissible error
  banner (same pattern as `HomeFeed.tsx`'s `composeError`), so this
  bug class (async call throws, nobody's listening) can't reproduce
  silently here again.

**You need to run `006_fix_dm_creation_rls.sql` against Supabase**
before this fix takes effect — it's a new migration, not just a code
change.

### 2. Story upload: "you must be signed in to upload media"
Root cause was the session-timing race flagged in HANDOVER.md, but not
quite the hypothesis there — it wasn't that `/stories` skips waiting
for session hydration (the `(app)` layout already gates all children
behind `useAuthSync`'s `loading`). It's that `uploadMedia()` called
`supabase.auth.getUser()`, which makes its **own separate network
round-trip** to Supabase's auth server to revalidate the JWT — a
second, independent "am I logged in" check from the one that already
gated the page. If that revalidation request is slow or races anything
else on first paint, it can transiently report no user even with a
perfectly valid session already sitting in the store.

Fix: `uploadMedia()` now takes an optional `knownUserId` — when the
caller already has a hydrated session (which every real caller in this
app does, since they're all inside the gated `(app)` layout), it's
passed straight through and the redundant `getUser()` network call is
skipped entirely. Falls back to `getUser()` if not provided. Updated
all four call sites (`Stories.tsx`, `HomeFeed.tsx`, `ChatView.tsx`,
`ProfileSettings.tsx`) to pass `session?.user.id` from the store.

No migration needed for this one, just the code change.

## Also found and fixed: 42P17 infinite recursion on channel_members

You hit this right after the message-button fix went live — real,
separate pre-existing bug, not something migration 006 introduced.
`001_initial_schema.sql`'s "members can view channel membership"
SELECT policy on `channel_members` queried `channel_members` inside
its own `USING` clause — a policy re-entering itself to evaluate
itself, forever. Migration 006's new RPC was just the first thing that
actually exercised a `SELECT` through that exact policy; it's been
sitting there since the first migration.

Fixed in `supabase/migrations/007_fix_channel_members_rls_recursion.sql`:
moved the membership check into a `SECURITY DEFINER` helper function
(`is_channel_member`), which bypasses RLS on the table it checks, so
the policy calls that instead of querying itself. Checked the sibling
policy on `channels` ("members can view their channels") for the same
shape — it queries `channel_members` from a policy defined on a
*different* table, which is a normal cross-table reference, not
self-recursion, so it didn't need the same fix.

**Run 006 and 007 in order** — 007 depends on 006 already having been
applied (it's fixing a bug that got surfaced by it, not one it caused).



### "Spaces" section below Stories
Looked at the current nav before guessing, per your instruction — and
it's genuinely ambiguous, so asking rather than picking wrong again:
**Spaces already render directly below Stories in the left rail**
(`GlobalNav.tsx`: Home → DMs → Stories → separator → space icons →
add-space button). So either:
- (a) you mean something already exists and this was written before
  you'd seen the current rail, or
- (b) you want a *second* surfacing — e.g. a "Spaces" list section in
  the main sidebar (`SecondarySidebar.tsx`, where Friends/DMs or Feed
  filters currently render) so spaces are browsable with names, not
  just as small icon initials in the rail.

Let me know which (or something else) and I'll build it.

## Also done, this continued pass

### Backlog items shipped and build-tested
- **`manifest.json` / `robots.ts` / `sitemap.ts`** — standard Next.js
  metadata files. Uses `public/logo.svg` as the manifest icon (no
  dedicated PNG icon set exists yet — flagged in the file's own
  comment; fine for Chrome/Android install prompts, not sufficient for
  a proper iOS home-screen icon).
- **Tenor GIF support alongside Giphy** — `GifPicker.tsx` rewritten to
  support both providers behind `NEXT_PUBLIC_TENOR_API_KEY` /
  `NEXT_PUBLIC_GIPHY_API_KEY`; shows a tab switcher only when both are
  configured, otherwise silently uses whichever one is.
- **Full markdown support** — new `src/lib/markdown.tsx`. Renders
  directly to React elements, never to an HTML string, so there's no
  `dangerouslySetInnerHTML` anywhere and nothing to sanitize — a
  hostile input just prints back as literal text. Covers everything in
  the original spec: headers, bold/italic/underline/strikethrough,
  `@mention`, `||spoiler||` (click-to-reveal), `--faint--`, code
  blocks, blockquotes, ordered/unordered lists, `[text](link)`. Wired
  into posts, comments, and chat messages. Emoji shortcodes are
  unaffected — those still convert to literal unicode at send time via
  the existing `emoji.ts`, before this renderer ever sees the text.
- **OpenGraph link cards** — `app/api/link-preview/route.ts` (Route
  Handler; has to be server-side since browsers block cross-origin
  reads of arbitrary sites' HTML) with an SSRF guard against
  private/internal hosts, a 5s timeout, a capped read (stops after
  `</head>` or 100KB, whichever's first), and a 30-minute in-memory
  cache. `LinkPreviewCard.tsx` renders it in both chat and feed when a
  URL is detected in the text and there's no image already attached.
- **Video stories** — `009_video_stories.sql` adds `media_type` /
  `duration_seconds` to `stories`; `010_widen_media_bucket_for_video.sql`
  raises the shared media bucket to 40MB and allows `video/webm` +
  `video/mp4` (images stay capped at 10MB client-side — the bucket
  limit went up to fit video, not to quietly let images get bigger
  too). New `VideoRecorderModal.tsx` uses `MediaRecorder`, force-stops
  at exactly 30s via `setTimeout` (not just validated after the fact),
  picks whichever mime type the browser actually supports instead of
  assuming WebM everywhere. `Stories.tsx` now shows a small
  photo-vs-video menu instead of jumping straight to the file picker;
  `StoryViewer.tsx` renders `<video>` for video stories and times the
  progress bar off the story's actual recorded length instead of the
  fixed 5s image duration.

**Run migrations 009 and 010** (in addition to 006/007/008 from
earlier) for video stories to work end to end.

### Also fixed in passing
Copied your `008_fix_space_members_dms_resolve` upload into the repo
as `supabase/migrations/008_fix_space_members_rls_recursion.sql` —
same `42P17` self-reference bug as bug #1's fix, on `space_members`
this time (`servers`/`server_members` pre-rename). Checked every other
membership-table policy in the schema for the same shape; nothing else
had it.

## Deferred — honestly, not silently skipped

These are all real, sizeable pieces of work on their own (new user
flows, asset/registration dependencies on you, or open design
questions), and rushing them isn't worth it just to check a box:

- **More OAuth providers (GitHub, Twitter/X)** — the *code* pattern is
  small (mirrors the existing `linkProvider()`/`unlinkProvider()` +
  Connected Accounts UI), but each one needs a real OAuth app
  registered with that provider and enabled in the Supabase dashboard
  first — that's a you-shaped step, not a code-shaped one. Say the
  word once you've registered one and I'll wire the button in same-day.
  Instagram: still unclear if Supabase Auth supports it directly or
  only via Facebook Login — need to check current docs before
  promising it.
- **Better onboarding flow** — no current flow exists beyond bare
  signup; needs actual UX decisions (steps? interests? starter space
  templates?) I shouldn't make unilaterally.
- **Post redesign** — you called the current one "shit" but the ask
  needs specifics (spacing? typography? card structure? image
  handling?) to redesign toward something, not just away from
  something.
- **Profile popup redesign / nameplates / avatar decorations** — no
  assets exist for these yet (confirmed again in `public/ASSETS.md`).
  Building the structure with placeholder assets is possible if you'd
  rather do that than wait — say so and I will.
- **Custom display-name styling** — unclear scope (font? color? both?
  presets or free-form?).
- **Local caching via Dexie** — you asked to weigh lag/bandwidth cost
  first, and to be careful not to cache RLS-sensitive data without
  thinking through staleness. That's a real design pass, not a quick
  add.

Premium tiers and WebRTC voice/video remain intentionally not-built,
per your own earlier instruction.

## Also done, this continued pass (mobile, onboarding, GitHub, spaces)

### Mobile responsiveness — the actual fix for "friends on phone can't use it"
Root cause: `AppShell.tsx` rendered rail (76px) + sidebar (260px) +
main content in a fixed three-column row, always, with no responsive
behavior at all — on a ~375px phone that's negative space left for
content before it even starts. Fixed with a single-pane-at-a-time
layout below the `md` breakpoint, chosen from the route itself (no
extra state to desync):
- A DM/space *list* route with nothing open shows the sidebar
  full-screen, standing in for `main`.
- Opening an actual chat hides both the rail and sidebar so the whole
  screen is the conversation (added a mobile-only back button to
  `ChatView.tsx`'s header to get back out — the sidebar isn't visible
  to tap back into).
- Everywhere else shows `main` full-screen with the rail as a bottom
  tab bar (`GlobalNav.tsx` — same component, `fixed bottom-0` + row
  layout on mobile, unchanged vertical rail on desktop via `md:`).
- `SettingsShell.tsx` got the same treatment — `/settings` no longer
  redirects straight into Profile *before checking viewport size*
  (that would have made the mobile category list unreachable and
  turned its own back button into a redirect loop); it only
  auto-redirects on desktop now.
- Tightened `px-7` header/content padding down to `px-4` on mobile
  across Home, Friends, Stories, Discover, and chat (was fine on
  desktop, just needlessly cramped on a phone).

The rail's joined-spaces icon list and the desktop-style "+ create
space" button are desktop-only now (no room for a scrollable icon
strip in a 6-item bottom bar — Discord's own mobile app doesn't put
that in the tab bar either) — Discover got a "Yours" tab, mobile-only,
so joined spaces stay reachable without it.

**This is the part I'd actually ask your friends to re-test first** —
tell me what's still broken for them specifically, since I can't see
real devices from here and this was built against the same viewport
sizes, not a phone lab.

### GitHub OAuth
Fully wired end to end, since you'd already enabled it in Supabase:
`signInWithGithub()` in `auth.ts`, a real button in `Login.tsx`, and
GitHub added to Connected Accounts in `AccountSettings.tsx` (that part
really was a one-line change — the UI already looped over a provider
array generically).

### Onboarding
New signups now go through `/onboarding` before `/home`: interest tags
→ optional avatar upload → suggested public spaces matching those
interests (falls back to all public spaces if no tag overlap yet) →
finish. Existing accounts were backfilled to skip it. Hard-gated in
`(app)/layout.tsx` so it can't be bypassed by navigating straight to
`/home` (closed tab mid-flow, OAuth signup landing elsewhere, etc.),
not just relying on the signup button's own redirect.

### Private/public spaces + Discover + global search
Spaces are private by default (invite-link only, unchanged from
before); creating one now has a real toggle to make it public +
taggable, joinable from a new `/discover` page or via search, no
invite code needed. New `CreateSpaceModal.tsx` replaced the old
`window.prompt` placeholder entirely — it now also has a Join tab that
accepts either a bare invite code or a full pasted invite link.
`SearchModal.tsx` searches people and public spaces together, opened
from a new search icon in the rail.

This also resolves the long-open "Spaces below Stories" nav question
from earlier — added a Discover (compass icon) entry directly below
Stories in the rail, literal placement as originally asked; your
already-joined spaces still render below that in their own section on
desktop, unchanged.

**Run migration 011** (`011_onboarding_and_public_spaces.sql`) for
onboarding and public spaces to work.

## Still not started

Unchanged from the list above — nameplate SVGs and the profile popup
redesign matching your reference screenshot. Custom display-name
styling you said to leave for now.

## This continued pass

### Message context-menu parity — already done, found while auditing
Turned out `MessageContextMenu.tsx`, real pin/mark-unread/copy/forward
handlers in `ChatView.tsx`, `ForwardMessageModal.tsx`, and migration
`012_message_reactions_fix_and_pins.sql` (real DB-backed pins and
per-user read-state, not fake toggles) already existed from earlier in
this session. Ran the actual build-test pass on it per rule #1 and
caught two real bugs it had never been checked against before —
`QUICK_REACT_EMOJIS` and `MoreHorizontal` were referenced but never
defined/imported, which would've broken the build outright. Both
fixed. **Run migration 012** if you haven't yet.

### Feed post → widget with side-by-side comments
New `PostDetailModal.tsx` — clicking a post's body/image or its
comment icon now opens the post in a modal (post left, comments in
their own scrollable column on the right, stacks vertically on mobile)
with an X to close, replacing the old expand-inline-below-the-post
behavior entirely. Extracted `CommentRow` (with its real edit/delete)
and `Avatar`/`timeAgo` out of `HomeFeed.tsx` into their own files so
the modal could reuse them without a circular import between the two
files — caught and fixed that during the build-test pass, not
guessed around.

### Terms of Service + Privacy Policy
Real pages at `/terms` and `/privacy` — written to match what
PalSpace actually does and stores (not generic placeholder text):
covers Supabase as the data processor, the OAuth providers you've
actually wired (Google/Discord/GitHub), Giphy/Tenor, and the
link-preview fetcher. Both flagged clearly as a starting template, not
legal advice — have an actual lawyer review before treating either as
final, especially the liability/termination sections and anything
GDPR/CCPA-specific if you ever have EU or California users. Linked
from the signup form's fine print and from Settings → Account, and
added to `sitemap.ts`.

## Still not started (updated)

Nameplate SVGs, the profile popup redesign matching your reference
screenshot, and custom display-name styling (left for now, per you).
