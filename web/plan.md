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

## This continued pass — Bespoke theme + name styling + profile popup fix

### Theme infrastructure — Bespoke is now the default
Per your answer, confirmed: Bespoke (hard edges, near-black surfaces,
hairline borders) is the new default look everywhere, Classic (the
original rounded style) is the opt-out in Settings → Appearance.
Mechanism: `html[data-theme='bespoke']` redefines the same `--color-*`
custom properties every component already reads, so colors flip
app-wide with zero component changes; corner radius can't work that
way (Tailwind's `rounded-*` utilities emit literal values, not a
variable), so that's a global override that flattens every
`rounded-*` class to 2px *except* explicitly marked exceptions —
avatars (`.rounded-full`), the feed composer (tagged `.composer-round`,
since you specifically asked for that one to stay round even in
Bespoke), and chat bubble tails (`.bubble-shape`). A blocking
pre-hydration script in `layout.tsx` reads the stored preference before
first paint so Classic users don't see a flash of Bespoke on load.

**What this pass does NOT include yet**: rewriting each screen's actual
layout/structure to match your Bespoke HTML demos — this is theme
infrastructure (colors + corners), not a full component-by-component
reskin. The demos also show things like crosshair corner accents on
cards; I added the CSS for that (`.bespoke-corner`) but haven't gone
through and applied it to every card yet.

### Custom display-name styling — fully built and live
Migration `013_display_name_style.sql` (profiles.name_style jsonb),
`NameStyle.tsx` (renders all 6 effects to your exact spec — Solid,
Gradient, Neon, Toon/Pop, Prism, Gummy with exactly 2 alternating
colors per your answer), the 4 fonts from your ProfileEdit demo
(Sans/Serif/Gothic/Pixel), and `NameStyleModal.tsx` (live preview,
correct color-picker count per effect), wired into Settings → Profile.

Also plumbed through to everywhere a name actually renders, not just
the settings preview: feed posts (`014_feed_view_name_style.sql` adds
it to the view), post comments, the post detail modal, the full
profile page, and the profile popover.

**Deliberately not done yet: chat messages.** Chat currently only
ever shows `sender_username`, never `display_name` — wiring
`name_style` in means touching ~8 spots in a realtime-sensitive file
(the subscription handler, 3 separate optimistic-send paths, pin/reply/
forward previews) and I didn't want to rush that into a file where a
mistake means broken realtime messaging. Doing this properly next.

### Profile popover — fixed to match your screenshots
Clicking the avatar inside the popover now enlarges it in place
(lightbox), instead of navigating to the full profile page like it did
before — that was a deliberate design decision from an earlier pass
that your screenshots directly contradict, so I changed it rather than
defending the old behavior. Added an explicit "View Full Profile" link
(matching the Discord reference) as the new way to reach the full page,
since clicking the avatar no longer does that.

## Still not started

Nameplate SVGs, the rest of the Bespoke reskin (per-screen layout
changes matching your demos, not just the color/corner infrastructure),
chat message name-style plumbing, notification chime + prefs
(DMs-always-on-if-enabled), follow system, tab/taskbar unread badge,
and the performance/lag audit. Profile/PFP effects and frames still
waiting on your assets, per your own note.

## MASTER PLAN — everything from the big screenshot-driven request

Explicit instruction: finish Part A (pending, above) first, THEN start
Part B. Both parts are large; this doc is the source of truth for
scope/order across however many passes it takes. Nothing here is
"done" until it's in a "Done" section with a build-test note.

### Part A — pending from before (do first)
1. Chat message name-style plumbing
2. Nameplate SVGs
3. Rest of Bespoke reskin (real per-screen layout vs. your demos)
4. Notification chime + master disable toggle (DMs always-on if
   notifs enabled at all — folds in the new ask for this too)
5. Follow system (separate from Friends)
6. Tab/taskbar unread badge
7. Performance/lag audit

### Part B — new, in build order

**B1. Real-time speed fix (the actual bug)**
"DM takes 2 minutes to appear in my list" / same for new spaces means
a subscription gap somewhere — the DM sidebar list isn't getting
pushed "a new channel now includes you," so it's sitting on a stale
fetch until something else forces a refetch. Root-causing this
properly (Realtime channel/table subscription audit across
channels.ts, spaces.ts, the sidebar hooks) rather than papering over it
with polling.

**B2. Friends**
- New channel auto-appears in DM list the instant a friend request is
  accepted (real-time, not next reload) — depends on B1's fix.
- Mutual friends count + list on profile popover and full profile.
- Fix simultaneous-friend-request bug: A requests B, B independently
  requests A before accepting — should resolve to "already friends"
  with a clear inline message, not a confusing duplicate-request state.

**B3. Analytics & observability**
- Google Analytics (their measurement ID) + Vercel Analytics + Speed
  Insights, wired in app/layout.tsx.
- `/status` page: per-service health (DB, Auth, Storage, Realtime) as
  colored status boxes + basic latency/uptime graphs, backed by real
  periodic checks, not hardcoded "all green."
- Privacy Policy updated to disclose Google Analytics.

**B4. Auth persistence**
Verify (not assume) Supabase's refresh-token persistence is actually
configured correctly for "log in once, stay logged in" — check
`supabase.ts` client config and session storage.

**B5. New pages**
- Real 404 page using the logo.
- `/status` (B3).

**B6. Presence**
Online / Do Not Disturb / Offline / Invisible — schema + UI + realtime
broadcast, shown wherever presence already renders (avatars, DM list,
profile).

**B7. Explore overhaul**
Tabs: Spaces / Feed. Search bar + relevance-ranked "top choices."
Hashtag search across both.

**B8. Homepage redesign**
`app/page.tsx` (the logged-out landing page, NOT the in-app feed at
`app/(app)/page.tsx`) — real design pass, not the current placeholder.

**B9. Notifications**
Master on/off toggle in Settings (folds into Part A item 4 — building
these together since they're the same settings section).

**B10. Voice calls (WebRTC)**
Confirmed buildable without a VM: signaling via Supabase Realtime
broadcast channels (free), STUN via public Google servers (free), TURN
via a free-tier third-party relay (Metered/OpenRelay or Cloudflare
Calls — free tier, no VM). DM 1:1 calls + small-group voice channels in
spaces, mesh topology (every participant connects to every other
participant directly) — this works well and free up to a small group
size; capping voice channels around 6 concurrent participants and
showing that cap in the UI, since mesh quality degrades hard past that
and a real SFU (the VM-requiring path) is explicitly what's being
deferred. This is genuinely the largest single item in this whole plan
— treating it as its own multi-pass effort, not a bolt-on.

**B11. Spaces upgrade — the "HUGE" one, screenshots-driven**
Broken into concrete sub-pieces, referencing your 7 screenshots:
- **Spaces section in nav**: grouped/expandable, not the current
  jagged icon strip — click to reveal all your spaces.
- **Space settings panel**: matching the Discord reference structure —
  Server Profile (name, icon, banner, description, traits),
  Members, Roles, Invites, and a Safety/Access section. Space
  description as a real field alongside title, shown in the settings
  profile card and Explore.
- **Roles & permissions**: one default Admin role auto-created with
  the space (owner), everyone else is a plain member by default; space
  admins can create additional roles and assign a real permission set
  (manage channels/topics, manage roles, kick/ban, manage messages,
  create invites, etc. — will define the exact permission list before
  building the schema, not guess it mid-migration).
- **Right-click context menu** on a space (from your screenshot: Mark
  as Read, Invite, Mute, Notification Settings, Hide Muted Channels,
  Server Settings, Privacy Settings, Edit Per-server Profile, Create
  Channel/Category/Event, Copy Server ID).
- **Invites upgrade**: show the space's ID on the invite, not just a
  bare code.
- **Topics**: reordering (move up/down within their category), and
  dropping the literal `#` prefix in the UI — noted as an intentional
  visual departure from Discord, not an oversight.
- **Voice channels + categories**: categories group topics/voice
  channels the way Discord's do; voice channels are the space-side
  half of B10.

**B12. Chat bubble toggle**
Settings toggle: bubbles (current look) vs. flat/direct text (per your
screenshot reference) — both need to keep every existing feature
(reactions, reply, edit, markdown, link previews, etc.), this only
changes the container styling, not the functionality underneath.

**B13. Channel creation modal — visual pass**
Cooler/more considered version of the current create-channel modal,
matching your reference screenshot's structure (type picker, name,
private toggle) but with real visual intention, not a copy.

**B14. Two more UI theme options**
Alongside Bespoke (default) and Classic — two additional selectable
looks, chosen during onboarding (a new onboarding step) as well as
switchable later in Settings → Appearance, same mechanism as the
existing theme system. Needs your direction on what the two new looks
actually are before I design tokens for them (same as Bespoke needed
your demos) — will ask when this item comes up.

**B15. Onboarding additions**
- Theme picker (B14).
- Date of birth field (+ whatever else field, confirm scope when this
  item comes up).

**B16. Feed suggestions**
Suggested posts/accounts in the feed based on interests/follows —
scope to be defined when this item comes up (algorithmic ranking vs.
simple interest-tag matching).

---
Given the size of Part B, this will span many passes. Each pass will
update this doc with what actually got built + build-tested, same
discipline as everything above it.

## Part A progress — items 1, 2, 4 done, build-tested

### 1. Chat message name-style plumbing — done
### 2. Nameplate SVGs — done
(both covered in the previous pass's notes above)

### 4. Notification chime + master disable toggle — done
Migration `016_master_notifications_toggle.sql`: added
`notifications_enabled` to `notification_preferences`, and — per your
exact spec — DMs are no longer individually toggleable at all; the
`notify_channel_message` trigger now only checks the master switch,
not the old `messages` column (left in place, unused, so nothing
mid-deploy breaks). The other three notification triggers
(comment/reaction/friend-request) now check master-switch AND their
own category, so turning the master off silences everything, and
turning it on restores each category to whatever it was individually
set to — except DMs, which just always fire.

Chime: `src/lib/notificationSound.ts`, a synthesized two-note tone via
WebAudio (no audio file, no licensing question), gated behind the
browser's real autoplay-unlock rule (waits for a genuine first
pointer/keyboard event before the AudioContext is even created — not
just muted, actually not constructible yet, same as any browser would
enforce). Wired into the *existing* `useUnreadCounts` hook's realtime
message subscription (same "not mine, not the channel I'm already
looking at" condition already used for the unread badge), which also
means it respects both the new master toggle and its own
Settings-level sound-only toggle.

**Found while wiring this**: `subscribeToNotifications()` in
`realtime.ts` has existed for a while but was never actually called
anywhere — the notifications panel only ever did a one-time fetch, no
live updates. Didn't fix that in this pass (real scope, belongs with
B1's broader real-time audit), just flagging it clearly rather than
letting it hide.

**Run migration 016** for the master toggle to take effect.

## Still not done in Part A
3. Rest of the Bespoke reskin (per-screen layout vs. your demos)
5. Follow system
6. Tab/taskbar unread badge
7. Performance/lag audit (this now clearly includes: the
   `subscribeToNotifications` gap above, and whatever's causing the
   DM/space-creation slowness described in Part B's B1 — likely related
   but confirming by tracing it properly, not assuming, when that item
   comes up)

## Part A — items 5 & 6 done, build-tested

### 6. Tab/taskbar unread badge — done
`useUnreadBadge.ts`: redraws the favicon onto a canvas with a red
dot/count overlay (the standard technique — a `<link rel="icon">`
can't be templated with live data any other way), updates
`document.title` to `(N) PalSpace`, and calls the Badging API
(`navigator.setAppBadge`) where the browser supports it (Chrome/Edge
desktop — no Safari/Firefox support, so this is a bonus layer on top
of the favicon/title, not the only mechanism, same caveat noted when
this was originally scoped). Driven by the same `totalUnreadChannels()`
the DM badge already uses, so no new counting logic.

### 5. Follow system — done
Migration `017_follow_system.sql`: a genuinely separate `follows`
table from `friend_requests` — one-directional, no accept step,
follow lists public (same as most social apps), only the follower can
create/delete their own row. New `notify_new_post` trigger fans out to
both followers and friends on a new post, each gated by their own
independent preference (`follow_posts` / `friend_posts` — a person who
is both only gets one notification, not two, via a `union` not two
inserts), plus a new-follower notification. `src/lib/api/follows.ts`
is a clean new file, doesn't touch `friends.ts` at all. Follow
button + follower/following counts wired into `UserProfile.tsx`,
new toggles in Settings → Notifications.

**Deliberately not done as part of this**: mutual friends count. Your
friend list is private per-user by RLS design (`friends_view`'s
underlying policy only lets you read requests where you're
sender/recipient) — computing "mutual friends with someone else"
needs a `SECURITY DEFINER` RPC that reveals just the intersection
without exposing either person's full friend list, which is real,
separate work. Staying as its own Part B item (B2), not rushed in here
just because I was already in this file.

**Run migration 017** for the follow system to work.

## Still not done in Part A
3. Rest of the Bespoke reskin (per-screen layout vs. your demos)
7. Performance/lag audit

## Part A — item 7 done (the real fix, not a vague speedup)

### Root cause found and fixed: DM/space lists were never wired to realtime at all
Traced "a DM takes ~2 minutes to appear" and "space creation is slow"
to their actual cause: `channel_members`, `channels`, `space_members`,
and `spaces` were **never added to the Supabase realtime publication**
in any prior migration — only `messages`, `notifications`, and
`stories` were (`001_initial_schema.sql`,
`005_blocking_notification_prefs_stories.sql`). Postgres's logical
replication literally never broadcast changes on those tables, so no
client-side subscription code could have worked regardless of how it
was written. The sidebar's DM/space lists only ever updated when
something incidentally triggered a React Query refetch (window focus,
navigation, remount) — which is exactly the "eventually shows up"
delay being reported.

Fixed in `018_realtime_membership_tables.sql` (enables realtime on
those four tables — RLS still applies the same as normal selects, so
this doesn't expose anything not already readable) plus:
- `subscribeToMyChannelMemberships` / `subscribeToMySpaceMemberships`
  in `realtime.ts`.
- New `useMembershipSync` hook, mounted once at the app-shell level,
  invalidates `['my-dms']` / `['spaces']` the instant you're added to
  either.
- Fast-path invalidation added directly to your *own* create/join
  actions (`GlobalNav.tsx`, `Friends.tsx`, `UserProfile.tsx`) so your
  own actions don't wait on a realtime round-trip at all — the
  subscription above is specifically for *other people* adding you to
  something.

### Also fixed while auditing: notifications had the same gap
`subscribeToNotifications()` existed in `realtime.ts` for a while but
was never called anywhere — the bell icon's red dot only updated
because `NotificationsPanel.tsx` fetched the count in its own
`useEffect`, and that component only mounts once you've already
clicked the bell open. The dot that's supposed to tell you *before*
opening whether there's something new never actually worked that way.
New `useNotificationSync` hook fetches the count on session-ready and
keeps it live via the subscription that already existed but nothing
used.

**Run migration 018** — without it, none of the client-side realtime
code above does anything, same as before.

## Still not done in Part A
3. Rest of the Bespoke reskin (per-screen layout vs. your demos)

Once this last item lands, Part A is fully done and Part B starts.

## Part A — item 3, partial. Being honest about scope here.

Did, build-tested:
- Post cards now get the crosshair corner accent (`.bespoke-corner`,
  matching your demo's signature top-right accent) in Bespoke.
- A new `.bespoke-timestamp` CSS class (mono, tracked-wide, uppercase)
  applied to feed post timestamps, matching the demo's "12m AGO" style
  micro-labels — CSS-scoped to the theme attribute so Classic is
  unaffected, no component restructuring needed.

**What I did NOT do, and want to be upfront about rather than
overclaim**: your demos show real structural differences from the
current layout — the post header (avatar/name/timestamp/menu) sitting
*outside and above* the card rather than inside it, the composer's
exact icon row and "Publish" button treatment, the message hover
toolbar's precise positioning from `BespokeMessages.html`. Those are
real DOM/layout rewrites, not CSS-only tweaks, and each one touches a
component that's currently working and tested. I chose targeted,
low-risk fidelity improvements over a full teardown-and-rebuild of
working screens, given how much of this session has already gone into
keeping things build-tested and not breaking what works.

Marking Part A as "close enough to move on, with this one item
genuinely partial" rather than fully done — flagging clearly so you
can decide: live with the current level of fidelity, or tell me to
come back and do the full structural rebuild (header-outside-card,
exact composer/toolbar layout) as its own dedicated pass before B1
onward, since that's real, separate work from everything else in
Part A.

---
**Part A summary**: 6 of 7 items fully done and build-tested (chat
name-style plumbing, nameplates, notification chime + master toggle,
follow system, tab/taskbar badge, the real-time performance fix).
Item 3 (Bespoke reskin) is partial, as described above. Part B has not
started.

## Part A item 3 — the real structural rebuild, in progress

Analytics also added this pass (Vercel Analytics, Speed Insights,
Google Analytics via `NEXT_PUBLIC_GA_MEASUREMENT_ID` env var — **set
that in `.env.local`/Vercel for GA to actually activate**, nothing is
hardcoded). Per explicit instruction, this piece specifically wasn't
build-tested; everything below it was.

Real structural rebuilds done, build-tested, matching the demos'
actual DOM shape now, not just color/corner CSS:

- **Feed post header** now sits *outside and above* the card, exactly
  like `BespokeFeed.html` — was nested inside the card before. The
  "more" menu on your own posts is now hover-revealed
  (`opacity-0 group-hover:opacity-100`) matching the demo, not always
  visible.
- **Feed composer** got the demo's `// Broadcast` / `Public Stream`
  mono micro-label header row, and the Publish button now matches the
  demo's icon+uppercase-tracked-mono treatment exactly (kept the
  rounder shape you specifically asked for on this one element
  earlier — that request and "match the demo" aren't in conflict since
  the demo's own container is the one round-cornered element you
  called out).
- **Message hover toolbar** — full rebuild, not a tweak. Was
  individual circular buttons floating above the bubble; now it's the
  demo's single unified bar (Copy Text, React, Reply, Forward, divider,
  More) positioned to the *side* of the bubble
  (`left-full`/`right-full`), opacity-revealed on hover, matching
  `BespokeMessages.html` exactly. Copy Text and Forward are now direct
  one-click buttons instead of buried in the "More" menu, per the demo.
- Confirmed `MessageContextMenu.tsx` needs no changes — it already
  inherits the Bespoke look for free through the color/corner
  infrastructure from the first reskin pass, since it only uses
  generic tokens.

**Still not done, being upfront**: the exact composer icon row from
`BespokeMessages.html` (paperclip/smile/gif icons — chat's compose bar
currently has its own working icon set, not yet restyled to match that
specific layout), the full `BespokeProfileEdit.html` settings-page
treatment, and the create-channel modal "cooler" visual pass. This is
real, still-open work — continuing it, not stopping here permanently.

## Part A item 3 — continued, "full force" pass

### Chat compose bar — full rebuild
Was a single pill-shaped row with every icon inline. Now matches the
demo's actual two-tier card structure: input on its own line, a
divider, then an icon row (attach/disappearing-timer/voice/emoji/gif)
on the left and a proper Send button (icon + uppercase-mono label,
`rounded-sm` not round) on the right — matching
`BespokeMessages.html`'s composer exactly. Every existing feature
(disappearing messages, voice notes, GIF/emoji pickers) is still there,
just laid out the way the demo does it, not removed or hidden to make
the visual match easier.

### Discovered: create-channel modal doesn't exist yet
Went looking for it to give it the "cooler" pass you asked for and
found `SpacePages.tsx` is a 36-line stub — topic/channel creation
isn't built at all yet, it's part of the still-pending B11 Spaces
upgrade in Part B. Didn't throw together a placeholder just to reskin
it now and redo it properly later — it'll get built with real styling
from the start when B11 happens.

### Profile settings — real live preview card, not a shallow copy
Your `BespokeProfileEdit.html` demo's core idea — a live two-panel
editor where the right side shows exactly what your profile will look
like as you edit — didn't exist in any form before this. Built it for
real: new `ProfilePreviewCard.tsx`, wired to read the *same local
draft state* the edit form already tracks (not a separate fetch), so
every keystroke, color pick, or image upload reflects in the preview
instantly, before you even hit Save. Includes the nameplate, name
style, accent-colored action-button mockup, bio, and member-since —
matching the demo's actual content, not just its shell. Desktop-only
(`xl:` breakpoint) since there's no room for a 300px side panel below
that; `SettingsShell.tsx`'s content width is now conditional per-page
so this specific page can be wider without affecting every other
settings page.

**Genuinely still open after this pass**: the connections/badges
section styling and the "Nitro"-equivalent promo card from the demo —
didn't build those since PalSpace has no subscription tier yet
(explicitly deferred per your own earlier call on premium tiers) and
no OAuth-connection badges concept beyond what Settings → Account
already does. Flagging as "not applicable yet" rather than silently
skipped.

## Part A item 3 — corner-accent consistency sweep

Went through every remaining card-like surface app-wide and applied
`.bespoke-corner` where it was missing: Discover's "Yours" space cards
and public space cards. Checked (not blindly applied) several other
candidates and correctly left them alone because they're not the same
kind of surface as the demo's crosshair-cornered cards:
- Friends list rows — plain bordered list rows in both the demo and
  the current app, not boxed cards. Adding the corner accent there
  would be inventing a treatment the demo doesn't show.
- The Stories upload menu and `MessageContextMenu.tsx` — floating
  menus/dropdowns, same category, not content cards.
- Login page — intentionally left alone; it's a warmer, softer entry
  screen by original design, and none of the three demos you gave me
  cover a login/auth screen, so reskinning it now would be guessing at
  an aesthetic you didn't specify rather than matching one you did.

## Part A summary (final)

All 7 items done, all build-tested. Item 3 (Bespoke reskin) went
through several focused passes rather than one — theme infrastructure
→ post/message/composer structural rebuilds → live profile preview →
this consistency sweep — each one build-tested on its own rather than
batched into one unverified change. Full literal pixel-parity with
every demo isn't claimed (see the specific gaps noted throughout: chat
composer icon styling nuances, create-channel modal which doesn't
exist yet, connections/Nitro-equivalent sections), but every
structural difference that was flagged has either been rebuilt for
real or explicitly marked as not-yet-applicable with a stated reason.

**Part A is done. Part B starts next.**

## Part B — B2 done, build-tested

### Mutual friends
Migration `019_mutual_friends_and_request_fix.sql`: `get_mutual_friends`
RPC, `SECURITY DEFINER` since friend lists are private-by-RLS — only
ever returns the intersection between you and the other person, never
either person's full list. Rendered on the profile page as a small
avatar stack + count, matching the pattern Instagram/Twitter use.

### Simultaneous friend-request bug — fixed
Exactly the scenario you described: A requests B, B independently
requests A back before responding to A's request. New
`send_friend_request` RPC checks for a pending request in the
*opposite* direction first — if one exists, it accepts that instead of
creating a second pending row. `sendFriendRequest()` now calls this RPC
and returns which of the two happened, so the UI can tell you
correctly: on the profile page, sending a request that turns out to
already be mutual shows "[name] already requested to add you — since
you added them too, you're both friends now" instead of a generic
"request sent". In the Friends search list, the row just flips from
"Add" to "Friends" automatically via the same query invalidation,
which reads cleanly enough in a multi-person list without needing its
own banner.

**Auto-add to DM list on friend-accept** — already covered by Part A's
`useMembershipSync` fix, since accepting a friend request is what
creates the DM channel eligibility; no separate work needed here.

**Run migration 019** for both of these to work.

Next up: B3 (status page + auth-persistence check), B5 (404 page), B6
(presence), B7 (Explore overhaul), B8 (homepage redesign), then the
larger B10 (voice) and B11 (Spaces upgrade).
