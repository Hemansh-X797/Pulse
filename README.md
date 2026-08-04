# Pulse

A social platform: Discord-tier customizable profiles (dual accent-color
gradient, bio, pronouns, status) + DMs/groups with real-time chat bubbles and
`:shortcode:` emoji, on top of a feed with posts, comments, and reactions.
Core services in C++20, real browser-compatible WebSocket, single-file web
client.

**Status: Phase 1 + Phase 2 built, compiled, and tested end-to-end** — including
a full two-user simulation (signup → login → profile → DM → real WebSocket
chat → feed → reactions → comments) run against the actual server binary.
See `ARCHITECTURE.md` for the full plan and `assets/req.md` for visual
assets to add.

## What's real right now

### Backend (`server/`)
C++20, builds with CMake, zero exotic dependencies — SQLite, JSON, and a
from-scratch SHA-256/SHA-1 (MIT/public-domain, vendored as single files
under `server/third_party/`).

- **Auth**: `POST /signup`, `POST /login` — PBKDF2-HMAC-SHA256, salted.
- **Profiles**: `GET /me`, `PATCH /me`, `GET /users/:username` — display
  name, bio, pronouns, status, avatar/banner URLs, and the **dual
  accent-color gradient** (top + bottom, Discord-style) you asked for.
  Bio and status render emoji shortcodes too.
- **Feed**: `POST /posts`, `GET /feed`, `POST /posts/:id/comments`,
  `GET /posts/:id/comments`, `POST /posts/:id/react`,
  `GET /posts/:id/reactions` — recency + engagement ranked.
- **DMs/groups**: `POST /dms`, `POST /groups`.
- **Real-time chat**: a genuine RFC 6455 WebSocket server on `:8081` (hand
  implemented — SHA-1 handshake, frame encode/decode — no library, so it's
  actually browser-compatible, not just a raw-socket stand-in). Ops: `auth`,
  `join`, `send`, `history`.
- **Emoji engine**: `server/src/common/emoji_renderer.hpp` — one-pass
  `:fire:` → 🔥 parser wired into DMs, posts, comments, bios, and statuses.

### Web client (`client-web/index.html`)
Single-file, no build step. Dark theme, gradient-driven UI tied to your
two-accent-color idea, styled chat bubbles (yours on the right, gradient
fill; theirs on the left), a feed with reactions/comments, and a profile
editor with a **live gradient preview** as you drag the two color pickers.
Google/Discord sign-in buttons are visible but disabled — wired for real in
Phase 3.

### Verified end-to-end
A full simulation (`server` running + real WebSocket client, same code path
the browser would take) confirmed: signup, login, profile update with
gradient + emoji bio, DM channel creation, live WebSocket chat with
`:fire: :rocket: :100:` rendering, post creation, reactions, comments, and
feed retrieval — all passing.

One real bug was caught and fixed in this process: a self-deadlock where
the chat server's broadcast/join handlers re-locked an already-held mutex.
Would've silently hung every browser connection; fixed and re-verified.

### Build & run it yourself
```bash
cd server
mkdir -p build && cd build
cmake .. -DCMAKE_BUILD_TYPE=Release
make -j4
cd ..
./build/pulse_server        # HTTP/REST API on :8080, WebSocket chat on :8081
```
Then open `client-web/index.html` in a browser (it points at
`localhost:8080` / `localhost:8081` by default).

```bash
curl -X POST localhost:8080/signup -d '{"username":"alice","password":"hunter22"}'
curl -X POST localhost:8080/login  -d '{"username":"alice","password":"hunter22"}'
```

## What's next (Phase 3)
Google + Discord OAuth, presence/typing indicators/read receipts, media
uploads (avatars/banners/post images), Postgres migration, and the feed
suggestion engine v2. See `ARCHITECTURE.md` for the full phasing — nothing
on your feature list is cut, it's sequenced so every phase is something you
can actually run.

