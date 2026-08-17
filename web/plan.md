# plan.md — going wide: Settings depth, Stories, blocking, notifications

Building toward Discord's actual settings depth and Instagram's actual
feed depth, not a single-page approximation of either. `app/` grows a
lot in this pass — that's intentional, matching how Discord itself
structures this (each settings category is its own real view, not a
tab switch inside one component).

## New route surface

```
app/(app)/settings/
  layout.tsx          — the category shell (left nav, like your screenshot)
  page.tsx             — redirects to /settings/profile
  profile/page.tsx      — avatar/banner/bio/accent (what's already built, relocated)
  account/page.tsx       — username, email, password, connected accounts
  privacy/page.tsx        — who can friend-request/DM you, blocked users
  notifications/page.tsx   — per-category notification toggles
  appearance/page.tsx       — theme accent defaults, reduced motion

app/(app)/stories/
  page.tsx             — tray + redirect into viewer
  [username]/page.tsx   — full-screen viewer for one person's active stories
```

## Features, in build order

1. **Settings restructure** — real category shell first, since
   everything else in this pass needs a home in it. Moves what already
   exists (profile editing, connected accounts) into the new structure
   rather than bolting more onto the single-scroll panel.

2. **Blocked users** — genuinely didn't exist. New `blocked_users`
   table + RLS that also *filters* — blocking someone hides their posts
   from your feed and stops them DMing/friend-requesting you, not just a
   list with no teeth. Lives under Settings → Privacy.

3. **Notification preferences** — per-type toggles (messages, reactions,
   comments, friend requests, space invites) stored per-user, checked by
   the existing notification trigger functions before they fire. Real
   enforcement, not a UI that saves settings nothing reads.

4. **Stories** — the thing called out twice now as "still doesn't
   work." Real scope for this pass: image stories (no video — flagging
   that cut honestly), 24h expiry via a view filter (no cron needed),
   tray with gradient rings on the rail for friends with active stories,
   tap-through full-screen viewer with progress bars. Seen-by lists and
   story reactions are a further follow-up, not in this pass.

5. **Appearance settings** — default accent-gradient presets editable
   per-user beyond just profile color (this overlaps profile accent by
   design — Discord does the same thing with theme vs. profile
   accent), reduced-motion toggle wired to the `prefers-reduced-motion`
   CSS already in globals.css so there's a manual override too.

## Explicitly not in this pass (flagging, not hiding)

- Voice/video channels — Discord-depth voice is its own infrastructure
  project (WebRTC signaling, SFU or mesh, Render doesn't give you that
  for free), not a Settings-page-sized feature. Would need a real scoping
  conversation on its own.
- Roles/permissions within a Space — meaningful chunk of schema + UI on
  its own, queuing separately if wanted.
- Search (posts/hashtags) — mentioned earlier in the conversation,
  still queued, not in this pass either; flagging so it doesn't get lost.

Building 1–4 now, 5 if there's room after. Reporting back with what's
real before calling it done, same as every pass so far.
