# Deploying Pulse's server on Render

You mentioned Render specifically (Oracle's sign-in giving you trouble —
that's a known pain point with their identity verification flow, not
something on your end). Render is a solid pick: it has managed Postgres
built in, which is exactly what `server/` now needs since the Postgres
migration.

## What you need on Render

Two pieces, both under the same account:

1. **A Postgres instance** — Render → New → PostgreSQL. Pick the free
   tier to start (it's fine for friends-scale traffic — see the note on
   free-tier limits below) or a paid plan if you want it to not sleep/expire.
2. **A web service running the C++ server** — Render → New → Web Service,
   pointed at your repo.

## Step 1 — Postgres

1. Render dashboard → **New +** → **PostgreSQL**.
2. Name it (e.g. `pulse-db`), pick a region close to where you'll run the
   web service (same region = lower latency, and Render's free Postgres
   tier specifically wants this).
3. Once it's up, copy the **Internal Database URL** — looks like:
   ```
   postgresql://pulse_user:xxxxx@dpg-xxxxx-a/pulse_db
   ```
   Use the **internal** URL (not external) if your web service is also on
   Render — internal traffic is free and faster. Use the **external** URL
   only if the server is running somewhere else and needs to reach into
   Render's Postgres from outside.

## Step 2 — Web service (the C++ server)

Render builds from a Dockerfile for anything that isn't one of their
auto-detected stacks (C++ isn't auto-detected), so add this at the repo
root:

```dockerfile
# Dockerfile
FROM ubuntu:24.04

RUN apt-get update && apt-get install -y \
    cmake build-essential libssl-dev libpqxx-dev pkg-config \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY server/ ./server/
WORKDIR /app/server
RUN mkdir build && cd build && cmake .. -DCMAKE_BUILD_TYPE=Release && make -j4

EXPOSE 8080 8081
CMD ["./build/pulse_server"]
```

Then on Render:

1. **New +** → **Web Service** → connect your repo.
2. Runtime: **Docker** (it'll pick up the Dockerfile above automatically).
3. Under **Environment**, add:
   ```
   PULSE_DATABASE_URL = <the Internal Database URL from Step 1>
   ```
   Plus any OAuth vars from `docs/OAUTH_SETUP.md` if you're turning those
   on, and `PULSE_FRONTEND_URL` pointing at wherever the web client ends
   up (Vercel, per `HOSTING.md`'s Option D).
4. **Important — two ports.** Pulse runs the REST API on `:8080` and the
   WebSocket chat server on `:8081`, but Render's free/starter web
   services only expose **one** public port. Two options:
   - Simplest: change `:8081` to run on the same port Render exposes and
     route by path in front with a lightweight proxy — more setup than
     this doc covers today; flag it if you want this built next.
   - Actually simplest for now: deploy the chat server as a **second**
     Render Web Service pointed at the same Dockerfile but with `CMD`
     overridden to only bind :8081 — needs a small code split (two
     binaries or an env var toggling which server runs). Also flag this
     if you want it done — a 15-minute change once you're ready.
   - For just testing Postgres integration right now (which is what this
     migration was about), a single Render service running both on
     internal Render networking works fine for private testing; the
     two-port issue only bites once you need the public internet to
     reach the WebSocket chat port directly.

## Free tier notes (matters for "using Render for now")

- Render's **free Postgres** instances expire after 30 days and don't
  auto-renew — you'll need to either upgrade or spin up a fresh one and
  re-run the schema (which happens automatically on first boot, so this
  is just re-pointing `PULSE_DATABASE_URL` at the new instance).
- Render's **free web services** spin down after 15 minutes of
  inactivity and take ~30s to wake back up on the next request — fine for
  testing, a real annoyance for friends actually chatting live (they'd
  see the first message of a session hang). The $7/mo starter tier
  removes this.

## When you move to Cloudflare later

Cloudflare doesn't run arbitrary long-lived processes the way Render
does (Workers are request-scoped, not persistent) — so the C++ server
specifically can't move there. What *can* move to Cloudflare later:
the web client (Cloudflare Pages, same shape as the Vercel option in
`HOSTING.md`), and some of the `serverless/` functions (the `push-notify`
one specifically is Workers-compatible — see that folder's README).
The core Pulse server still needs a VM or a platform like Render/Railway
that runs persistent processes.

## Local testing against Postgres before you deploy

This is exactly what I tested against while doing this migration —
useful if you want to reproduce it:

```bash
sudo apt install -y postgresql-16 libpqxx-dev libpq-dev
sudo service postgresql start
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'devpassword';"
sudo -u postgres psql -c "CREATE DATABASE pulse;"

cd server
mkdir build && cd build
cmake .. -DCMAKE_BUILD_TYPE=Release
make -j4
cd ..
# uses PULSE_DATABASE_URL if set, otherwise defaults to the local dev
# connection string matching the setup above
./build/pulse_server
```
