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

## Deferred (unchanged from HANDOVER.md backlog, not started)
- Post redesign (`HomeFeed.tsx`'s `PostCard`)
- Full markdown support in posts/messages
- Video stories (30s cap, `MediaRecorder`)
- `manifest.json` / `robots.ts` / `sitemap.ts`
- Local caching via Dexie
- More OAuth providers (GitHub, Twitter/X, maybe Instagram)
- Better onboarding flow
- Tenor GIF support alongside Giphy
- OpenGraph link cards
- Profile popup redesign (nameplates/decorations — no assets yet)
- Custom display-name styling
- Premium tiers, WebRTC voice/video — explicitly not now, scoping only
