<div align="center">

# PalSpace

**Your actual friends. Not a server full of strangers.**

Group chat, a feed, stories, and reels — built for a handful of people who actually know each other, not a community of thousands.

[![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)](https://nextjs.org)
[![Supabase](https://img.shields.io/badge/Supabase-Postgres%20%2B%20Auth%20%2B%20Realtime-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![License](https://img.shields.io/badge/license-private-lightgrey)](#)

</div>

---

## What this actually is

Discord is built for communities — servers, roles, channels, a hundred people you've never met arguing in `#general`. That's genuinely great for what it's for. It is not what a group of five close friends needs to have a group chat.

PalSpace is the opposite bet: a real-time chat app, a feed, stories, and reels, built around the idea that most people's real social life happens in a handful of small, close, specific relationships — not a public server. No roles to configure. No channels to set up before you can just talk. Message a friend and you're already talking in ten seconds.

If you've ever opened Discord to message one person and had to think about servers, channels, and permissions first — this is for the version of that where you just don't.

## What's actually in here

- **Real-time messaging** — 1:1 and group DMs, reactions, replies, edit/delete, pins, in-channel search, ephemeral (disappearing) messages, forwarding, voice notes, voice calls
- **Streaks** — a real, server-computed daily streak per conversation (not a client-side fake counter), because the single best reason to open an app every day is a friend who's counting on you to
- **A feed** — posts, comments with one level of threaded replies, reactions, hashtags, an Explore/Discover surface
- **Reels** — short vertical video, the format everyone under 30 actually watches now
- **Stories** — 24-hour ephemeral photo/video, the other format everyone uses
- **Real profile customization** — accent colors, name styles (animated gradients, glitch, fire), avatar decorations, and full-profile-card "Profile Decor" backgrounds — all DB-backed catalogs, easy to keep adding to without shipping new code
- **Spaces** — for when a group *does* outgrow a plain group chat: channels, roles, permissions, invites, public/private
- **PWA support** — installable, works like a native app on a phone home screen
- **Five themes** — Bespoke (the flagship, deliberately un-rounded and un-"AI-generic"), Classic, Sunroom (light mode), Signal (terminal green), Grove (nature)

## Tech stack

| Layer | What |
|---|---|
| Framework | Next.js 15, App Router, TypeScript (strict) |
| Backend | Supabase — Postgres, Auth, Realtime, Storage, Edge Functions |
| Data | TanStack Query (client cache/sync) + Zustand (client state) |
| Styling | Tailwind CSS |
| Motion | Framer Motion |
| Security | Row Level Security on effectively everything — see [Architecture](#architecture-notes) |

No separate backend server to run. Supabase *is* the backend. The Next.js app talks to it directly from the browser, governed by Postgres RLS policies rather than a hand-rolled API layer.

## Getting started

You'll need a [Supabase](https://supabase.com) project — the free tier genuinely works for this, no credit card required (see [`FREE_BACKEND_GUIDE.md`](../FREE_BACKEND_GUIDE.md) if you want the specifics and honest caveats).

```bash
# 1. Install dependencies
npm install

# 2. Copy the env template and fill in your Supabase project's URL + anon key
cp .env.local.example .env.local

# 3. Run every migration in supabase/migrations/, in numeric order
#    (Supabase dashboard → SQL Editor, or `supabase db push` via the CLI)

# 4. Start the dev server
npm run dev
```

That's the whole setup. No Docker, no separate API server, no build step beyond Next.js's own.

**One thing worth knowing up front:** running a migration in the Supabase SQL editor only updates your *database*. If a feature also shipped new static assets — an SVG decoration, an image — those live under `public/` and only reach your users when you redeploy the *frontend*. The two are separate deploys. A "the database says success but nothing shows up" bug almost always means one happened without the other.

## Project structure

```
app/                  Next.js App Router — routes and layouts
src/
  screens/            Full-page screen components
  components/         Reusable UI (chat, feed, profile, shell)
  lib/api/            Supabase queries, one file per domain
  hooks/              Shared client-side hooks
  store/              Zustand global state
supabase/
  migrations/         Every schema change, in order — this is the source
                       of truth for the database, not the dashboard
public/               Static assets, including every decoration/nameplate SVG
```

## Architecture notes

- **RLS-first.** Almost nothing sensitive is enforced client-side. Permission checks live in Postgres as `SECURITY DEFINER` functions the client calls via `.rpc()` — a client that bypasses the UI still can't bypass the actual check. See `is_app_admin()`, `space_member_has_permission()`, `is_channel_member()` for the pattern to follow when adding something new.
- **No-client-write catalogs.** Badges, avatar decorations, Profile Decor, and admin grants all have zero client-write RLS policy, on purpose — they're either tamper-proof (admin), curated (cosmetics), or both. Adding a new one is a migration, not a feature request for an "add" button.
- **Optimistic UI, everywhere it matters.** Sending a message, posting, liking, reacting — all paint instantly and reconcile with the server after, rather than waiting on a round-trip before showing anything. If something you build feels slow, check whether it's missing this pattern before assuming the network is the problem.

## A note on where this stands

This is a real, working app with a genuinely deep feature set — not a demo. It has also never been run at meaningful scale, and video storage on the free tier is a real, known constraint the moment Reels gets real usage (see `FREE_BACKEND_GUIDE.md`). Building for a handful of close friends is the whole point, not a limitation to apologize for — but if you're the one taking this further, know what you're inheriting: something solid, honestly documented, with the rough edges written down rather than hidden.

---

<div align="center">

Built for the group chat that's actually just your friends.

</div>
