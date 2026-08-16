# plan.md — Friends, account linking, feed redesign, Settings, Stories

Scoped from your last message. Marking what's actually shippable at real
depth in this pass vs. what's queued next — "everything, production
grade" all at once is how the earlier passes ended up half-done in
places; this time each item is either fully built or explicitly deferred,
not silently stubbed.

## 1. Friends — doesn't exist at all, building from scratch

There's no `friends` table anywhere in the schema — not a UI gap, the
data model itself was never built. Building:
- `friend_requests` table (sender, recipient, status: pending/accepted/declined) + RLS
- `friends_view` (accepted, bidirectional) for a simple "my friends" query
- API: `sendFriendRequest`, `respondToFriendRequest`, `listFriends`, `listPendingRequests`, `listSentRequests`, `searchUsersByUsername` (for Add Friend)
- UI: Friends screen at `/friends` — tabs matching your Discord screenshot (Online / All / Pending / Add Friend), reachable from the rail
- Notifications already had `friend_request`/`friend_accept` types wired in migration 003 — connecting them here

**In this pass.** This is the biggest item; going in first.

## 2. Account linking (one account, multiple sign-in methods)

Supabase Auth supports `linkIdentity()` for exactly this — Google +
Discord + email/password on one account, not separate accounts. Building
a "Connected accounts" section in Settings using it.

**In this pass**, scoped to Google ⇄ Discord ⇄ email/password linking
(what you already have OAuth apps for). Facebook/other providers need
their own OAuth app credentials first — flag which ones you want and
I'll add them, same pattern.

## 3. Editable, unique usernames

`profiles.username` has no UNIQUE constraint in the current schema
(checked — it doesn't). Adding one + an availability-check RPC + wiring
the Settings username field to actually save.

**In this pass.**

## 4. Feed redesign — Instagram interaction model

- Comment button → icon only (speech bubble), no text label
- Reactions → single heart, toggles red when liked (removing the
  fire/💯 multi-reaction bar — real scope cut, not a bug, since you
  specifically asked for Instagram's single-heart model over what's there)
- Share button → icon, copies a link to the post for now (no repost
  system yet — that's a bigger feature, flagging separately)
- Fixed 3-dot menu equivalent already exists (edit/delete) — restyling
  to match icon language, not rebuilding
- Clicking a profile (avatar/name) → confirmed broken, was pointing at
  the right route already, but investigating why it doesn't visually
  navigate and fixing

**In this pass.**

## 5. Stories — currently a placeholder, not functional

Real scope: story = 24h-expiring media post. Needs: `stories` table +
RLS (expiring via a view filter, not a cron delete — simpler, no infra
dependency), upload flow, ring-avatar tray (Instagram-style), a
full-screen viewer with tap-to-advance + progress bars.

**Queued next, not in this pass** — it's a full feature on its own
(storage + expiry logic + a real viewer component with its own
interaction model), and cramming it in after Friends + linking + feed
work risks doing it at the same "half-built" depth you're pushing back
on right now. Flagging honestly instead of rushing it.

## 6. Settings — Discord-style categorized layout

Your screenshots show a left-nav category layout (Account Info /
Password & Security / Privacy / etc.) rather than the single-scroll
panel currently there.

**Queued next** — real layout work, sequenced after the above since
those changes (username editing, connected accounts) are what actually
need to *live* in the new Settings structure; building the shell first
and retrofitting would mean redoing it.

---

Building 1–4 now. Will report back with what's real and tested before
touching 5–6, same as every pass so far — no "trust me it works."
