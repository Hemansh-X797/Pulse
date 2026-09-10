# PalSpace — Handover Doc

_Last updated: this session. Read this before doing anything else — it'll save you from re-discovering bugs that are already fixed, and from missing setup steps that make whole features silently no-op._

---

## 1. Before you do anything: required setup

Nothing below is optional if you want the app to actually run correctly.

### 1.1 Supabase project

- Project ref: `zfucxtrbvdvrkxagqtvg` (this was wrong — transposed to `zfuctxrbvdvrkxagqtvg` — in `.env.local.example`, `next.config.ts`, and `MIGRATION_GUIDE.md` for who knows how long; already fixed in this codebase, but if you ever hand-type it again, triple-check it).
- Copy `.env.local.example` → `.env.local` and fill in:
  - `NEXT_PUBLIC_SUPABASE_URL` — already correct in the example file.
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — **not something I can fill in for you.** It only lives on your Supabase dashboard under **Settings → API**, not on the `/auth/users` page. Paste it in yourself.
- Run every migration in `supabase/migrations/` **in numeric order**, 001 through 037. They're written to be idempotent where practical but haven't been tested for out-of-order or partial application.

### 1.2 Web Push (real background notifications)

A fresh, legitimate VAPID key pair was generated for this project (via Node's own `crypto`, not a third-party service):

```
Public:  BKT0qbleK8KJrVmBWvzcy3CJXv6E0yYTq8Z1K8AE4kRULSTA9-J8OYn5LceF3bJYUPoCgAcHJeyy1plWe8-ghAw
Private: f4EIwr-M2PdEv9VLGV1LPJvalIIz5vBEL20okephtmI
```

These are **not committed anywhere in the repo** — that would defeat the point of the private half being private. To wire it up:

1. `NEXT_PUBLIC_VAPID_PUBLIC_KEY=<public key above>` in `.env.local`.
2. Deploy the edge function: `supabase functions deploy send-push` (see `supabase/functions/send-push/README.md`).
3. Set its secrets:
   ```
   supabase secrets set VAPID_PUBLIC_KEY=<public key above>
   supabase secrets set VAPID_PRIVATE_KEY=<private key above>
   supabase secrets set VAPID_SUBJECT=mailto:you@example.com
   ```
4. Point the database trigger at your service role key (SQL editor, one-time):
   ```sql
   alter database postgres set app.settings.service_role_key = '<your service_role key, from Settings -> API>';
   ```

Until step 4 is done, the `on_notification_created_push` trigger no-ops with a Postgres warning instead of failing — it will not block message sending or anything else, it just won't send pushes yet.

### 1.3 Admin panel

Your Supabase UID (`5f893fa9-62cd-43b5-b3e3-a7b1153c7233`) is already granted admin via migration `036`. Visit `/admin` once logged in. To add more admins later, insert directly into `app_admins` — there is **deliberately no UI or API path to grant admin**, only a migration/direct DB insert. Don't build a "make someone admin" button without thinking hard about it first; that table's whole security model rests on admin grants never being a client-callable action.

### 1.4 Known limitation: fonts won't build in a network-restricted sandbox

If you ever see a build fail on Google Fonts (`Fraunces`, `Inter`, etc. failing to fetch), that's a sandbox/network issue, not a code bug — confirmed during this session by the fact that even the pre-existing fonts failed identically before any of my changes. On Vercel or any normal machine with real internet access, this is a non-issue.

---

## 2. What changed this session — the short version

This was a long, multi-day session. Below is everything grouped by theme. Every single item was verified with a clean `tsc --noEmit -p tsconfig.json` pass before being shipped — if you find a type error, it was introduced after this handover was written.

### 2.1 Real bugs found and fixed

| Bug | Root cause | Fix |
|---|---|---|
| Notification chime never played | `audioCtx.resume()` is async; oscillators were scheduled before the resume finished, so they silently died against a still-suspended context | `notificationSound.ts` now awaits resume before scheduling, plus a lazy-create fallback for late-mounted listeners |
| DM avatars always showed initials | `listMessages()` never selected `avatar_url` from the joined profile at all | Selected it, threaded `sender_avatar_url` through every optimistic/realtime message path |
| Invite links 404'd for everyone | `SpaceSettingsModal` generated links to `/join/<code>`, but that route never existed | Built `app/join/[code]/page.tsx`, wired `joinSpaceByInvite`, added login-redirect preservation |
| `manage_space` permission was a no-op even when granted | The `spaces` table's UPDATE RLS policy was hardcoded owner-only; its own comment admitted the permission "isn't wired to this yet" | New policy also checks `space_member_has_permission(..., 'manage_space')` |
| Avatar decorations appeared to do nothing | The Settings page's own big avatar (the one you're staring at while equipping one) was never wrapped in the decoration renderer | Wrapped it; also fixed a `-z-10` bug in `UserProfile.tsx` that could push a decoration fully invisible depending on ancestor stacking contexts |
| Space channels leaking into the DM list | Introduced by me while fixing a different bug — filtered on `is_group` instead of `server_id`/`space_id` | Reworked, then... |
| **DM list appeared completely empty despite real conversations** | The fix above used the column name `server_id`, which was renamed to `space_id` back in migration `002` — every call to `listMyDMs()` was throwing "column does not exist," and React Query's empty-array fallback silently rendered that as "no conversations" | Rewritten as two plain, single-table queries (no embedded-resource filter) using the correct `space_id` column |
| Hover message menu appeared far from the message | It was `position: absolute` relative to the *entire row* (full chat width), not the bubble | Moved into the bubble's own wrapper div |
| Typing indicator could only ever show one person | Single shared `setTimeout` — a second typer's timer would clear the first's | Per-username timeout map; renders "Alex and Sam are typing..." etc. |
| Mentions of nonexistent users rendered as real links | `findMentionMatch` had zero validation against real users | Chat now validates against the channel's actual member list |
| Reply-preview line was dead and fragile | Plain `messages.find()` — vanished entirely if the original was outside the loaded 50-message window; not clickable at all | Added `getMessagePreview()` fallback lookup + made the whole line clickable via `jumpToMessage` |
| "Message" button always felt slow | Always awaited a full `createOrGetDM` network round-trip before navigating, even for conversations you already had open | `useOpenDm()` checks the already-cached `['my-dms']` list first; only genuinely new conversations hit the network |
| Vercel build failing on `/login` | `useSearchParams()` without a Suspense boundary — a hard Next.js requirement for static prerendering | Wrapped `Login`, `HomeFeed`, and `Discover` (same latent bug, would've failed next) in `<Suspense>` |
| Group DMs were a one-way door | `addGroupDmMember`/`leaveGroupDm` existed in the API layer with zero UI ever calling either | Built `GroupDmSettingsModal` (member list, add-friend picker, leave) |
| Pinned-message jump could silently no-op | Same "outside the loaded window" problem as replies | Now goes through the same `jumpToMessage` helper |

### 2.2 Features built from scratch

- **Group DMs** — full `create`/`add`/`leave` RPCs, sidebar UI with overlapping-avatar clusters, settings modal. Was structurally present (an `is_group` column since day one) but 100% unreachable before this session.
- **@Mentions, for real** — DB trigger (`035`) firing a dedicated `mention` notification type (not lumped in with generic messages), composer autocomplete with keyboard nav, visual highlight when a message mentions *you specifically* (amber chip + bubble tint), validation against real users.
- **Emoji shortcode autocomplete** — type `:fir` and see `:fire:` suggested live, Discord-style ranking (prefix match, then recently-used, then alphabetical), plus a real "Frequently Used" row in the full emoji picker.
- **In-channel message search** — didn't exist at all. New search icon in the chat header, `searchMessages()` + `listMessagesAround()` for jumping to results outside the loaded window.
- **Read receipts ("Seen")** — the `read_receipts` table existed since migration 001 but was only ever used for your own unread badge, never surfaced to the other person. Now shows "Seen" under your last message in 1:1 DMs (deliberately not implemented for groups — "seen by whom" is a different, harder feature).
- **Message grouping** — consecutive messages from the same sender within 5 minutes collapse the avatar/name header, hover-reveal timestamp instead.
- **Real Web Push notifications** — `push_subscriptions` table, `send-push` Deno edge function, DB trigger via `pg_net`, service worker `push`/`notificationclick` handlers. See setup section above.
- **Admin panel** (`/admin`) — tamper-proof (`app_admins` table has zero client-write policy, ever), live stats, user search. Every RPC re-checks admin status server-side independent of the client-side gate.
- **Founding Member badges** — real badge system (`badges` + `profile_badges` tables, same no-client-write pattern), granted once to everyone who existed at migration time, structurally impossible for future signups to receive.
- **Avatar decorations + Profile Decor** (renamed from "nameplates") — moved from hardcoded arrays to DB-backed catalogs (`avatar_decoration_catalog`, `nameplate_catalog`) so adding #8 through #200 is a plain SQL insert, not a code deploy. Profile Decor now covers the whole profile card, not just a bottom strip. Includes 4 new animated SVG decorations (`psion`, `duality`, `frostblade`, `wildvine`).
- **PWA install** — real service worker, install prompt hook, dedicated `/download` page with platform detection.
- **New theme: Grove** — green/nature, asymmetric "leaf" corner treatment distinct from every other theme's corner language.
- **Following feed tab** — the `follows` system existed since migration 017 but the feed itself had no way to filter to just people you follow.
- **Last seen** — persisted `last_seen_at`, heartbeat-updated, shown in profile popovers when someone's offline.
- **Space roles: `manage_space` + role rename/recolor** — closed the gap described in the bug table above, plus added a proper color-swatch UI for roles (previously no way to recolor a role after creation at all).

### 2.3 Performance / loading

- Real staged preload screen: tracks actual progress across 7 core prefetch tasks (feed, DMs, spaces, friends, notifications, both decoration catalogs) instead of an indeterminate spinner, with a 3-second safety cap so a slow connection never gets stuck.
- Code-split `EmojiPicker`, `GifPicker`, `CropModal`, `NameStyleModal` via `next/dynamic` — they don't need to be in the initial bundle for screens that might never open them.
- `useOpenDm()` (above) removes an unnecessary network wait for the single most common navigation action in the app.

### 2.4 Visual/UX polish

- Bespoke theme contrast increased — `ink-faint`/`ink-muted`/hairlines were measurably under WCAG AA (~2:1); bumped all four.
- Sidebar widened (260px to 288px) and re-spaced across all three modes (DM list, space channels, space browser) — bigger avatars, more padding, consistent treatment.
- Long-press context menu on mobile (reply/react/forward/etc.), separate from the desktop hover toolbar.
- Mobile notifications were completely unreachable outside two specific routes — added a dedicated `/notifications` page and a mobile top bar with a live unread badge.

---

## 3. The messages section — redesign plan

You asked for a complete redesign, the best possible version. Being straight about where this session landed: I did **not** execute a full ground-up redesign — what's below is a concrete, opinionated plan for one, so whoever picks it up next (you, or a future session) has a real spec instead of a vague "make it nicer."

**What's already genuinely solid** — don't rebuild these, they work: `ChatView.tsx` already has real message grouping, mentions with autocomplete, emoji autocomplete, reactions, replies (now with working jump-to), pins, edit/delete, forwarding, ephemeral messages, voice calls, read receipts, in-channel search, and a mobile long-press menu. The mechanics are there. What's missing is a cohesive visual/interaction identity — right now it reads as a lot of features bolted on, not a designed product.

### 3.1 Layout — the biggest gap

The message list is a single column with no visual rhythm beyond grouping. A real redesign needs:

- **Date separators.** A "Today" / "Yesterday" / "Tuesday, March 4" divider whenever the day changes between two messages. Doesn't exist at all right now — there's no way to tell where "yesterday" ends and "today" begins without checking individual timestamps.
- **Unread divider.** A "New messages" line at the first unread message when you open a channel, the way Slack/Discord do it. Right now there's no visual anchor for "where did I leave off" — you just land at the bottom.
- **A "jump to present" floating button.** When someone scrolls up to read history and new messages arrive below, there's no affordance telling them that, or letting them jump back down without manually scrolling.

### 3.2 Composer — currently a single-line `<input>`

This is the single biggest limitation. **The composer is a plain single-line text input, not a textarea.** That means no multi-line messages without an awkward, unwired Shift+Enter, and no visual growth as you type more. Every serious chat product (Discord, Slack, iMessage, WhatsApp) uses an auto-growing textarea.

This should be priority #1 of any redesign — swap the `<input>` for an auto-resizing `<textarea>`, wire Shift+Enter for newline vs. Enter to send, and verify the mention/emoji autocomplete positioning logic (currently keyed off `selectionStart`) still works identically on a `<textarea>` — the API is the same, but test it directly, don't assume.

### 3.3 Attachments

- **No drag-and-drop file upload** onto the chat window — you have to click the image icon.
- **No clipboard paste for images** — pasting a screenshot directly into the composer, standard in every modern chat app, isn't wired up.
- **No real upload progress indicator** — a real redesign should show a thumbnail + progress bar the moment a file is selected, before the upload resolves, not just a generic "uploading" state.

### 3.4 Reactions

Functional but visually flat. Verify whether hovering a reaction pill shows who reacted at all — if not, that's expected in any serious redesign.

### 3.5 Message states

- **No visual distinction for a failed send.** Messages go `pending` to sent with no handling for what happens if `sendMessage` actually throws. Needs a "failed to send, tap to retry" state.
- **No local draft persistence.** Switch channels with unsent text in the composer and it's gone. Should persist per-channel-id in memory (or `sessionStorage`) at minimum.

### 3.6 Visual identity

Bubbles are a single rounded-rectangle shape across every theme right now. A genuine best-in-class redesign would make the bubble shape, spacing, and grouping treatment feel distinct per theme (the way Grove already has a distinct corner language for cards) rather than one bubble style reskinned with different colors.

### 3.7 Suggested execution order

Each step below is independently shippable and testable:

1. Textarea composer (multi-line, auto-grow) — unblocks everything else feeling more real
2. Date separators + unread divider — pure UI, no backend changes needed
3. Drag-and-drop + clipboard paste for images — reuses the existing `uploadMedia` path, just new entry points
4. Jump-to-present button — needs a small amount of scroll-position tracking state
5. Failed-send retry state — `sendMessage` call sites need to catch and mark the optimistic message as failed instead of leaving it `pending` forever
6. Draft persistence — a `Map<channelId, string>` in a ref, or a tiny Zustand slice
7. Reaction hover tooltip, if not already present — verify first
8. Visual identity pass per theme — do this last, it's polish on top of a now-solid interaction layer

---

## 4. Architecture notes worth knowing

- **Stack**: Next.js 15 (App Router), Supabase (Postgres + Auth + Realtime + Storage + Edge Functions), TanStack Query, Zustand, Tailwind, Framer Motion.
- **RLS-first security model.** Almost everything sensitive is enforced at the database level via Row Level Security, not just hidden client-side. When adding a new permission-gated feature, follow the existing pattern: a `SECURITY DEFINER` Postgres function that re-checks the permission itself, called via `.rpc()`, so a client bypassing the UI gate still can't bypass the actual check. See `is_app_admin()`, `space_member_has_permission()`, `is_channel_member()` for the pattern.
- **No-client-write catalog/badge pattern.** `badges`, `avatar_decoration_catalog`, `nameplate_catalog`, and `app_admins` all deliberately have zero INSERT/UPDATE/DELETE policy for `authenticated`. If you want to add new decorations/badges/admins, that's a migration, not a feature to build a UI for. Don't accidentally "fix" this by adding a client-write policy — it would defeat the entire point of these being tamper-proof/exclusive.
- **`space_id` vs `server_id`.** The product was renamed from "servers" to "spaces" in migration `002`, which renamed columns too. If you're reading an older migration file and see `server_id`, check whether a later migration renamed it before writing new code against that name — this exact mistake caused the DM-list-empty bug documented above.
- **DM channels vs. space channels share the same `channels`/`channel_members` tables.** A DM (1:1 or group) always has `space_id = null`; anything with `space_id` set belongs to a space. Any query that needs "channels I'm a member of" has to account for both.
- **Feature flags via localStorage, not env vars or DB columns, for personal display preferences.** Compact mode, chat bubbles on/off, theme, sound — all plain `localStorage` device preferences, not server state. Keep new personal-display-only preferences in that same bucket rather than adding DB columns for things nobody else needs to see.

---

## 5. Everything is typechecked, not everything is runtime-verified

Every change in this session passed `npx tsc --noEmit -p tsconfig.json` with zero errors before shipping. That's a real, meaningful bar — but it is not the same as running against a live Supabase project or a real browser. In particular:

- The Web Push pipeline (push_subscriptions to trigger to edge function to service worker) has never fired against real infrastructure. The architecture is sound and each piece is individually correct, but there could be a payload-shape mismatch or similar integration issue that only shows up on first real use.
- The `pg_net` extension and `app.settings.service_role_key` database setting need to actually be configured (see 1.2) or push notifications will silently no-op — by design, see the trigger's own warning-not-failure behavior.
- A few UI layout changes (the reply-preview relocation, the hover-toolbar re-anchoring) were verified by careful reading of the resulting JSX structure, not by rendering in an actual browser, since this environment can't run one.

If something in this list breaks, it's the most likely place to look first.
