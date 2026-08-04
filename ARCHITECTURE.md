# Pulse — Architecture & Phase Plan

A social platform: Discord-level customizable profiles + DMs/groups with chat
bubbles + emoji shortcodes, Instagram/Twitter-level feed with posts, comments,
reactions, and suggestions. Core services in C++. Web + mobile clients consume
the same API.

## 0. Reality check (read this once, then ignore)
"Better than every social platform combined" isn't a spec, it's a direction.
The way to actually get there is: a backend that's fast and correct, phased
so each stage is a real, runnable product, not a stub. Below is that plan.
No feature gets cut — DMs, groups, chat bubbles, emoji shortcodes, custom
profiles, posts, comments, reactions, feed suggestions, Google sign-in,
Discord sign-in, username/password login, mobile app, web app. All in.
They just don't all land in the same week.

## 1. High-level architecture

```
                     ┌─────────────────────┐
                     │   Web Client (React) │
                     └──────────┬───────────┘
                                │ HTTPS / WSS
┌────────────────┐   ┌─────────▼──────────┐   ┌──────────────────┐
│  Mobile Client   │──▶│   API Gateway (C++) │◀──│  Admin / Tools    │
│ (React Native)   │  │  cpp-httplib + WS    │   └──────────────────┘
└────────────────┘   └─────────┬──────────┘
                                │
        ┌───────────────┬──────┴───────┬────────────────┐
        ▼               ▼              ▼                ▼
 ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
 │ Auth Service │ │ Chat Service │ │ Feed Service │ │ Media Service│
 │ (C++)        │ │ (C++, TCP/WS)│ │ (C++)        │ │ (C++)        │
 └──────┬───────┘ └──────┬───────┘ └──────┬───────┘ └──────┬───────┘
        │                │                │                │
        └────────┬───────┴────────┬───────┴────────┬───────┘
                  ▼                ▼                ▼
            ┌──────────┐    ┌──────────┐     ┌──────────────┐
            │ Postgres  │    │  Redis   │     │ Object store  │
            │ (users,   │    │ (presence,│    │ (S3-compat,   │
            │ posts,    │    │ pub/sub,  │    │ avatars,      │
            │ messages) │    │ sessions) │    │ media, banners)│
            └──────────┘    └──────────┘     └──────────────┘
```

**Why C++ for the services and not "the whole stack including a browser
engine"**: browsers can't run raw C++. The web client has to be JS/TS
(compiled from something — we use React + TS, not Emscripten hacks that would
make the UI worse). The mobile client has to speak platform APIs — React
Native, sharing 90% of code with web. What *is* pure C++, end to end: every
server, the emoji-shortcode engine, the chat protocol, the feed ranking
engine. That's where correctness and speed actually matter and where C++
pays for itself.

### Core services (all C++20)
- **Auth Service** — username/password (Argon2id hashing), Google OAuth2,
  Discord OAuth2, JWT session tokens, refresh tokens.
- **Chat Service** — WebSocket server, DMs, group chats, message history,
  typing indicators, read receipts, emoji-shortcode expansion, reactions on
  messages.
- **Feed Service** — post creation, comments, reactions, ranking/suggestion
  engine (starts as recency+engagement scoring, later a real ML ranker).
- **Media Service** — avatar/banner/post-image upload, resize, CDN-style
  serving.
- **Gateway** — single HTTPS/WSS entrypoint, routes to the above, rate
  limiting, request auth.

### Libraries (MIT/permissive only, vendored under `third_party/`)
- `cpp-httplib` — HTTP server/client (MIT)
- `nlohmann/json` — JSON (MIT)
- `uWebSockets` or `IXWebSocket` — WebSocket transport (Apache-2.0/BSD, both
  permissive — swap in if you'd rather avoid uWS's dual-license edge cases;
  default pick is **IXWebSocket**, plain BSD-3-Clause)
- `libpqxx` — Postgres client (BSD-ish/MIT-compatible)
- `sqlite3` — embedded DB for Phase 1 before Postgres lands (public domain)
- `argon2` (reference impl) — password hashing (CC0/Apache)
- `jwt-cpp` — JWT (MIT)
- `spdlog` — logging (MIT)
- `stb_image` / `stb_image_resize` — image decode/resize for Media Service
  (MIT/public domain)

## 2. Data model (Postgres, Phase 2+; SQLite Phase 1)

- `users(id, username, email, password_hash, google_id, discord_id,
  display_name, bio, avatar_url, banner_url, accent_color, pronouns,
  status_text, theme_json, created_at)`
- `friendships(user_id, friend_id, status)`
- `dm_channels(id, is_group, name, icon_url, created_at)`
- `dm_members(channel_id, user_id, role, joined_at)`
- `messages(id, channel_id, sender_id, body_raw, body_rendered, created_at,
  edited_at)`
- `message_reactions(message_id, user_id, emoji)`
- `posts(id, author_id, body, media_urls[], created_at)`
- `post_comments(id, post_id, author_id, body, created_at)`
- `post_reactions(post_id, user_id, emoji)`
- `feed_scores(post_id, user_id, score, computed_at)` — precomputed
  suggestion ranking cache

## 3. The emoji shortcode engine
A single C++ header, `emoji_map.hpp`, mapping `:fire:` → 🔥, `:heart:` → ❤️,
etc. (generated from the standard Unicode CLDR/emoji-test.txt shortcode
list, MIT-compatible), plus a streaming parser (`EmojiRenderer::render(
std::string_view)`) that finds `:token:` spans and substitutes them,
O(n) single pass, used by both Chat and Feed services so shortcodes work in
messages, comments, and post bodies identically.

## 4. Phasing — each phase is a real, runnable product

**Phase 1 (~2 MB code) — Chat core, local-only**
- SQLite storage
- Username/password auth only (Google/Discord OAuth stubbed)
- 1:1 DMs + group chats over WebSocket
- Chat bubbles rendered client-side (web client, minimal styling)
- Emoji shortcode engine, fully working
- CLI test client + minimal web client

**Phase 2 (~4 MB code) — Profiles + Posts**
- Postgres migration
- Customizable profiles (avatar, banner, accent color, bio, theme JSON —
  Discord-style "profile as a canvas")
- Posts, comments, reactions
- Feed: chronological + simple engagement ranking
- Web client gets real UI (React, component library, chat bubbles styled,
  profile editor)

**Phase 3 (~8 MB+) — Growth features**
- Google Sign-In + Discord Sign-In (OAuth2 flows)
- Feed suggestion engine v2 (collaborative filtering-ish scoring)
- Read receipts, typing indicators, presence (Redis pub/sub)
- Media uploads (avatars, banners, post images), image resize pipeline
- Push notifications (web + mobile)

**Phase 4 — Mobile + polish**
- React Native app sharing API + design tokens with web
- Rich chat bubbles (reply threads, edited/pinned messages, link previews)
- Admin/moderation tools
- Horizontal scaling (multiple Chat Service instances behind Redis pub/sub
  for cross-instance message delivery)

We're starting Phase 1 now.

## 5. Web vs Mobile
- **Web**: React + TypeScript + Vite, Tailwind for layout, custom design
  system for chat bubbles / profile cards (see `assets/req.md` for what
  visual assets to source). Talks to Gateway over HTTPS + WSS.
- **Mobile**: React Native (Expo), same API client layer as web
  (shared `api/` TS package), same design tokens, native push notifications.
- Both are thin clients — all real logic (ranking, emoji rendering fallback,
  validation) lives server-side in C++ so behavior can't drift between
  platforms.
