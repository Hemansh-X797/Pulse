# PalSpace — Handover

_Written at the end of a long session. Read this before opening a new chat about this project — it'll save you from re-discovering things that are already fixed, and from missing the one manual step (running pending migrations) that makes several features silently look broken._

---

## 1. Do this first, before touching anything

**Run every pending migration.** This session added migrations `038` through `042`. If you've applied some but not all, or applied migrations but haven't redeployed the frontend, some features will look broken in a very specific, confusing way — see §2.

```
supabase/migrations/038_channel_streaks.sql
supabase/migrations/039_verdantchrome_nameplate.sql
supabase/migrations/040_comment_replies.sql
supabase/migrations/041_reels.sql
supabase/migrations/042_verdantring_solarflare_decorations.sql
```

Run them via the Supabase SQL Editor, in that numeric order, or `supabase db push` if you're on the CLI.

**Then redeploy the actual frontend.** This is the one thing that tripped us up this session and is worth over-explaining so it doesn't happen again: running a SQL migration only changes your *database*. New static files (SVGs, images) live under `public/` and only reach real users when the Next.js app itself is redeployed. A migration can succeed and a feature can still look completely broken if the frontend hasn't shipped the assets that migration's rows point to. If something "shows up but renders as nothing," check this before anything else — open the Network tab and look for a 404 on the asset.

---

## 2. What got built this session, in order

Roughly chronological, since later work sometimes depends on earlier work:

1. **Messages redesign** — infinite scroll (older messages actually load now), hover toolbar rebuilt (fixed a real horizontal-scrollbar-jitter bug caused by it extending outside the scroll container), delete/edit surfaced directly in the toolbar, date separators, unread divider, "jump to present" bar, drag-and-drop + paste image upload, failed-send retry, per-channel draft persistence, reaction tooltips, mention pills redesigned. See `MESSAGES_UPGRADE_NOTES.md` for the detailed round-by-round history.
2. **Real bug fixes**, found by actually reading the code, not guessing:
   - Message delete was fire-and-forget with no error handling — a failed delete would silently look successful.
   - Contrast: measured actual WCAG ratios; `--color-ink-faint` (DM previews, timestamps) was 2.5–3.8:1 everywhere, now ~4.6–5:1.
   - Settings toggle "off" state was ~1.2:1 contrast against its own card — effectively invisible.
   - **Theme reverting to Bespoke on restart** — `app/layout.tsx`'s blocking pre-hydration script had a hardcoded valid-themes list missing `'grove'`. Fixed, and `useTheme()` is now also mounted globally in `app/providers.tsx` as a real safety net (it wasn't mounted anywhere before — that one script was the *only* thing restoring theme, no redundancy at all).
   - **Pings on DMs instead of servers** — space channels and DMs used the same generic unread badge; there was no distinction between "new messages" and "you were actually @mentioned." Added `mentionsByChannel` (separate from `unreadByChannel`) in the store, wired so space channels show Discord's real convention (dot = unread, amber number = ping) and the DM list is untouched.
   - **Stories: couldn't post more than one per day** — the "+" add-story button was conditionally rendered only when you had *zero* active stories; the moment you posted one, the entire add-flow became unreachable. Fixed by splitting the ring (view) and the "+" badge (always-open-the-add-menu) into two independent buttons.
   - **Avatar decoration misalignment in Profile Settings** — the big avatar preview had `-mt-8` applied to the avatar *inside* `DecoratedAvatar`, which shifted the avatar up without shifting the decoration overlay with it (the decoration centers on `DecoratedAvatar`'s own wrapper box, not on wherever the avatar itself ends up). A crown or ring would appear to float in the wrong place. Fixed by moving the negative margin to wrap the whole decorated-avatar unit as one rigid block.
   - **Comment composer never showed your real profile picture** — always rendered initials regardless of whether `avatar_url` existed, unlike every comment row which checks correctly. Fixed in `PostDetailModal.tsx`.
   - **Post modal had a large dead gap** on mobile between the like button and the comments section, for any short post — `mt-auto` (a "push to the bottom of the column" trick, correct for the desktop side-by-side layout) was also applying on mobile, where the two panes stack vertically instead, pushing the actions row to the bottom of the *entire post pane's height* before comments even start. Scoped to `md:` only.
3. **New features:**
   - **Streaks** (`038`) — real, server-computed, trigger-driven daily streaks per DM/group DM, with `for update` row locking for correctness under concurrent messages. Shows in the chat header and the DM sidebar list.
   - **GIF favorites** — star any GIF, dedicated Favorites tab, persists locally.
   - **Comment reply threading** (`040`) — one level of nesting, enforced server-side by a trigger, not just a UI convention.
   - **Profile posts grid** — closed a literal `// Media grid — next slice, not stubbed here on purpose` comment. Real thumbnail grid of a user's media posts on their profile, opens the existing post modal.
   - **Reels** (`041`) — a complete vertical short-video feature: DB tables + RLS mirroring the `posts` pattern, IntersectionObserver-driven autoplay (only the on-screen reel plays), optimistic likes, comments, upload composer, wired into the nav at `/reels`.
   - **New cosmetics**: Verdant Chrome (nameplate, `039`), Verdant Ring + Solar Flare (avatar decorations, `042`) — all genuinely animated SVGs (200+ lines each), added via the proper no-client-write catalog migration pattern.
4. **Growth/strategy work** (see `GROWTH_STRATEGY.md`): picked a beachhead (close friend groups who find Discord's server model like overkill), built the single most-proven retention mechanic for that audience (streaks, above), and found + fixed a severe invite-funnel leak where a brand-new signup from a friend's invite link would complete the full onboarding wizard and land on the generic home feed instead of the space they signed up for — fixed for both password and OAuth signup paths.
5. **Backend/hosting research** (see `FREE_BACKEND_GUIDE.md`): confirmed Supabase's free tier genuinely needs no credit card — nothing to migrate. The real constraint is video storage for Reels (1 GB ≈ 65 reels total); the cheap fix is compression/upload caps, not a provider switch. Cloudflare R2 was investigated as a next step and sources genuinely conflict on whether it needs a card — flagged as unverified rather than asserted either way.

## 3. Things that were tried and explicitly removed

**A Capacitor Android wrapper was scaffolded, then removed.** It could not be verified — the Gradle wrapper couldn't even download Gradle from this sandbox's restricted network — and rather than leave unverifiable native scaffolding in the repo, it was pulled out completely, dependencies and all. If Android packaging comes up again: this app has zero Next.js API routes or server actions (confirmed by grep), so a Capacitor wrapper pointed at the live deployed URL is a low-risk, standard path — just needs to actually be built and tested somewhere with real internet access and ideally a physical device, which this environment doesn't have.

## 4. Known gaps, honestly, not swept under anything

- **One avatar in a screenshot this session showed a decoration ring with no visible photo underneath it.** Checked the rendering code (`DecoratedAvatar`, the `Avatar` component in `HomeFeed.tsx`) and every current decoration SVG for an opaque center that could hide the avatar — all clean. Most likely a real data issue (that account's `avatar_url` genuinely empty, or a very low-contrast image) rather than a code bug, but this wasn't verified against live data and is worth a second look if it recurs on other accounts too.
- **Reels comments are flat, not threaded** — deliberate scope decision (real short-form video products don't thread comments), not an oversight.
- **No pinned-post-on-profile feature** — considered, deliberately not built shallow; would need to be designed properly as its own piece of work.
- **Video storage ceiling for Reels** — see §2.5 above and `FREE_BACKEND_GUIDE.md`. This will be the first real infrastructure problem the app hits with actual usage.
- **Nothing in this entire session has been run against live infrastructure or a real browser.** Every fix and feature passed `npx tsc --noEmit` and `npx oxlint` cleanly (0 errors throughout), which is a real and meaningful bar, but it is not the same as verifying in a live Supabase project with a real browser. Treat this codebase as "should work, needs a real smoke test," not "verified working."

## 5. If you're starting a new chat about this project

Give the new session:
1. This file.
2. The zip of the current codebase.
3. A one-line note that migrations `038`–`042` need to be applied (or already have been — say which) and the frontend redeployed.

That's enough for a fresh session to pick this up without re-deriving any of the above.
