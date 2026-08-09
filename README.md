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
- **Real Google & Discord OAuth**: `GET /auth/google/login`,
  `/auth/google/callback`, `/auth/discord/login`, `/auth/discord/callback`
  — genuine authorization-code flow against each provider's actual token
  and userinfo endpoints, over a hand-built OpenSSL TLS client
  (`server/src/common/https_client.hpp`). Verified live against both
  providers' real servers (got real `403`s back from Google and Discord
  with placeholder credentials — proves the TLS handshake, request
  formatting, and response parsing all work correctly end to end). Needs
  your own app credentials to fully complete a login — see
  **`docs/OAUTH_SETUP.md`** for the 5-minute setup per provider. With no
  credentials configured, the login routes return a clean "not configured"
  error instead of silently failing.
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

### Web client (`client-web/`)
Modular ES-module app — no build step, no bundler, just real `import`/`export`
across files you can open and edit directly:
```
client-web/
├── index.html              # shell: loads fonts, CSS, and js/app.js
├── css/
│   ├── tokens.css          # design tokens — colors, type, radii, the grad
│   ├── shell.css            # sidebar + layout
│   ├── auth.css             # login/signup + brand-accurate OAuth buttons
│   ├── chat.css              # bubbles + composer
│   ├── feed.css               # post cards, reactions, comments
│   └── profile.css             # profile editor + gradient preview
├── js/
│   ├── app.js               # entry point: router + render loop
│   ├── state.js              # single store + subscribe/set
│   ├── api.js                  # REST client
│   ├── ws.js                    # WebSocket client
│   ├── utils.js                  # shared formatting helpers
│   └── components/
│       ├── auth.js, sidebar.js, feed.js, dm.js, profile.js
└── assets/
    ├── google-logo.svg      # real 4-color Google "G" mark
    └── discord-logo.svg     # real Discord Clyde mark, white-on-blurple
```
Design pass: a split-screen luxury auth screen (original painterly SVG
artwork, serif wordmark, pill inputs, circular brand-accurate OAuth
buttons) built to match a real high-end reference bar, not a generic AI
SaaS template. Real vendored libraries — **Lucide** icons (ISC-licensed,
pulled from their source repo) and **anime.js** (MIT, pulled from npm) —
power the icon set and entrance micro-animations; nothing hand-waved with
emoji-as-icons or CSS-only fake polish. Type pairing is Fraunces (serif,
display) + Inter (body) + IBM Plex Mono (handles/timestamps). Verified
with real screenshots via headless Chrome + Playwright, not just "should
look right" — caught and fixed a jagged-ridgeline artifact in the artwork
and an emoji-font-fallback inconsistency in the reaction buttons before
shipping.

See **`HOSTING.md`** for exactly where to put this online — options range
from a $0 Oracle free-tier VM to Vercel (client) + a VM (server), plus what
two lines to edit in `js/api.js`/`js/ws.js` to point the client at your
server instead of `localhost`.


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
Needs `libssl-dev` now too (for the OAuth HTTPS client) alongside cmake/g++:
```bash
sudo apt install -y cmake build-essential libssl-dev   # if not already present
cd server
mkdir -p build && cd build
cmake .. -DCMAKE_BUILD_TYPE=Release
make -j4
cd ..
./build/pulse_server        # HTTP/REST API on :8080, WebSocket chat on :8081
```
Then open `client-web/index.html` in a browser (it points at
`localhost:8080` / `localhost:8081` by default). Username/password auth
works immediately; Google/Discord sign-in needs your own app credentials
first — see `docs/OAUTH_SETUP.md`.

```bash
curl -X POST localhost:8080/signup -d '{"username":"alice","password":"hunter22"}'
curl -X POST localhost:8080/login  -d '{"username":"alice","password":"hunter22"}'
```

## What's new this round

- **Message edit/delete/reply** — real chat depth: `edit`, `delete`, and
  `reply_to_id` WebSocket ops, permission-checked server-side (you can only
  edit/delete your own messages), with reply-tag snippets and a "message
  deleted" placeholder in the UI. Verified live between two real WebSocket
  clients, including the rejection path for deleting someone else's message.
- **Read receipts + unread badges** — `read` op marks a channel read up to
  a message id; `GET /channels` returns every channel a user's in with a
  per-channel unread count; the sidebar shows a live badge. Caught and
  fixed a real bug here: the badge didn't appear because the login screen
  had its own duplicate login path that skipped starting the unread-poll
  loop — found by actually screenshotting a logged-in user with unread
  messages, not just checking the API response.
- **Real media uploads** — `POST /media` (base64 JSON in, since the server
  stays dependency-free with no multipart parser), 5MB cap, PNG/JPEG/WEBP/GIF
  only, served back at `/media/:file`. Wired into avatar upload, banner
  upload, and post images, with a genuine byte-for-byte round-trip test
  (upload → disk → HTTP serve → identical bytes back) before it touched
  any UI.

## What's new this round

- **Servers** — Discord-style multi-channel spaces. Create one, get an
  invite code, others join with it, each server has its own channel list
  with a default `general` channel. Built to reuse the *existing* chat
  infrastructure entirely — a server channel is just another `channel_id`,
  so edit/delete/reply/typing/read-receipts all work in server channels
  for free, zero duplicated code. Caught and fixed a real gap during
  testing: joining a server (or adding a channel to one) didn't
  automatically grant channel-level access — fixed before it shipped.
- **Notifications** — real-time (WebSocket push, lands even if you're not
  viewing the channel that triggered it) plus persisted (`GET
  /notifications`, read/read-all marking). Fires on new DM/server
  messages, post reactions, and comments. Verified with a live multi-user
  WebSocket test, not just an API check.
- **Server icon rail** — the Discord-style leftmost icon strip (Home +
  server icons + add/join button), confirmed working end-to-end with
  real gradient server icons and correct active-state highlighting.
- **Serverless functions** (`serverless/`) — push notification fan-out,
  image thumbnailing, and scheduled feed re-scoring, each with a real
  explanation of *why* it belongs off the always-on C++ server (bursty
  vs. steady-state load) rather than just being there because it was
  asked for. Includes the C++-side signed-webhook dispatcher
  (`server/src/common/webhook_dispatch.hpp`, compiles clean, not wired
  into the request path by default) and a shared HMAC verification
  helper both sides use to trust each other.
- **Accessibility pass** — focus-visible outlines, a skip-to-content
  link, `aria-label`s on every icon-only button, keyboard handlers on
  nav items, `prefers-reduced-motion` support.
- Two more real bugs caught by screenshotting rather than trusting the
  API response: the chat topbar didn't reflect which channel/server you
  were actually in (still said "Direct Messages / channel #N" inside a
  server), and the notifications panel showed redundant duplicated text.
  Both fixed and re-verified with screenshots before shipping.

## What's next (Phase 4)
Postgres migration (SQLite is genuinely fine at current scale but won't
scale past it), a real feed ranking model (current one is recency +
engagement count — works, but naive), horizontal scaling for the chat
service, pinned messages, and push notifications once a mobile client
exists. See `ARCHITECTURE.md` for the full phasing — nothing
on your feature list is cut, it's sequenced so every phase is something you
can actually run.

