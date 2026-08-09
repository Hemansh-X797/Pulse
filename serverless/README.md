# Pulse — serverless functions

Three functions that genuinely belong off the always-on C++ server, plus
the shared plumbing that lets the server trust calls to them.

```
serverless/
├── shared/
│   └── verify-webhook.js   # HMAC signature check every function uses
├── push-notify/            # fan out a notification to web push subscribers
├── thumbnail/               # resize an uploaded image into thumb/medium
└── feed-rescore/             # scheduled batch job, recomputes feed_scores
```

## Why these three, and why *not* the rest of the app

The C++ server (`server/`) is a long-running process — it holds open
WebSocket connections and answers API requests in milliseconds. That's
the wrong shape for:

- **Push notification fan-out** — bursty (a popular post gets 200
  reactions in a minute), and doesn't need to block the request that
  triggered it. Fire it off, move on.
- **Image thumbnailing** — CPU-heavy, bursty in the same way, and pulling
  a native image library (libvips/sharp) into the always-on binary means
  paying for that CPU headroom 24/7 for work that happens in bursts.
- **Feed re-scoring** — periodic batch work over the whole `posts` table,
  not request-driven at all. A cron trigger fits it exactly.

Everything else — auth, chat, DMs, servers, the feed API itself — stays
in the C++ server on purpose: it's latency-sensitive, stateful (WebSocket
connections, in-memory session/rate-limit state), and splitting it apart
would add network hops for no benefit at this scale.

## Deploy targets

All three are written as plain `(req, res) => {}` handlers, which works
directly on:

- **Vercel Functions** — drop each `handler.js` into `api/<name>.js` in a
  Vercel project. Cron support for `feed-rescore` is built in (see the
  `vercel.json` snippet at the bottom of `feed-rescore/handler.js`).
- **AWS Lambda** — behind API Gateway (for `push-notify`/`thumbnail`) or
  an EventBridge schedule (for `feed-rescore`). Wrap the handler with the
  standard Lambda `(event, context)` adapter — the request-signing logic
  underneath doesn't change.
- **Cloudflare Workers** — works for `push-notify` with the fetch-handler
  rewrite noted in that file. **Not recommended for `thumbnail`** — it
  needs `sharp`'s native bindings, which Workers' runtime doesn't support;
  use Vercel or Lambda for that one specifically.

Pick per-function based on what's already hosting your Postgres/object
storage — `feed-rescore` in particular wants to be close to the database.

## Wiring them to the C++ server

`server/src/common/webhook_dispatch.hpp` has the C++ side: a signed,
fire-and-forget POST that doesn't block the caller. It's written but
**not called from anywhere by default** — the server has zero hard
dependency on any serverless deployment existing. To turn it on:

1. Deploy the function(s) you want.
2. Set the same secret on both sides:
   ```bash
   # on the serverless platform
   PULSE_WEBHOOK_SECRET=<a long random string>
   # on the C++ server (same value)
   export PULSE_WEBHOOK_SECRET=<the same long random string>
   ```
3. Call `pulse::webhook::dispatch(host, path, payload)` from wherever the
   event happens — e.g. right after `db_.create_notification(...)` in
   `api_server.hpp` or `chat_server.hpp`, to fan a notification out to
   push subscribers via `push-notify`.

## Environment variables these functions need

| Variable | Used by | What it is |
|---|---|---|
| `PULSE_WEBHOOK_SECRET` | all three | shared HMAC secret with the C++ server |
| `PULSE_VAPID_PUBLIC_KEY` / `PULSE_VAPID_PRIVATE_KEY` | push-notify | Web Push VAPID keypair — generate with `npx web-push generate-vapid-keys` |
| `PULSE_PUSH_CONTACT` | push-notify | a `mailto:` contact required by the Web Push spec |
| `PULSE_DATABASE_URL` | feed-rescore | Postgres connection string (Phase 4 — see `ARCHITECTURE.md`) |
| `PULSE_CRON_SECRET` | feed-rescore | separate secret so the cron endpoint isn't callable by anyone who finds the URL |

## Installing dependencies

Each function folder is its own package (own `package.json`, own
dependency tree) so you only deploy what each function actually needs:

```bash
cd serverless/push-notify && npm install
cd serverless/thumbnail && npm install
cd serverless/feed-rescore && npm install
```
