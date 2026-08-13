# Hosting Pulse

Pulse has two independent pieces to put online:

1. **The server** (`server/`) — one compiled binary that opens two ports:
   `:8080` (REST API) and `:8081` (WebSocket chat). This needs a real VM or
   container host, not static hosting, because it's a long-running process
   holding open connections and a database connection.
2. **The web client** (`client-web/`) — plain static files (HTML/CSS/JS,
   no build step). This can go on literally any static host.

They don't have to live on the same provider. The client just needs to know
the server's URL (see "Pointing the client at your server" below).

## Option A — cheapest / simplest: one small VM, everything together

Good for: getting this in front of friends this week, low cost, full control.

Any of these work almost identically (all offer a small VM for **$4–6/mo**,
or a free trial credit that covers this easily): **DigitalOcean Droplet**,
**Hetzner Cloud**, **Linode/Akamai**, **AWS Lightsail**, **Oracle Cloud
Free Tier** (their free ARM VM is genuinely free forever and plenty for
this).

Steps (same shape on all of them):
```bash
# 1. Spin up the smallest Ubuntu 24.04 VM they offer.
# 2. SSH in, install build tools:
sudo apt update && sudo apt install -y cmake build-essential libssl-dev libpqxx-dev pkg-config

# 3. Copy the repo over (scp, or git clone if you push it to a repo):
scp -r ./socialapp user@your-vm-ip:~/

# 4. Build:
cd ~/socialapp/server
mkdir build && cd build
cmake .. -DCMAKE_BUILD_TYPE=Release
make -j4

# 5. Run it so it survives you logging out — simplest is a systemd service:
sudo tee /etc/systemd/system/pulse.service <<'EOF'
[Unit]
Description=Pulse server
After=network.target

[Service]
WorkingDirectory=/home/user/socialapp/server
ExecStart=/home/user/socialapp/server/build/pulse_server
Restart=always
User=user

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now pulse

# 6. Open the ports in the VM's firewall (both the provider's dashboard
#    firewall AND ufw if it's on):
sudo ufw allow 8080
sudo ufw allow 8081

# 7. Serve the web client too — the same VM can do it with Python's
#    built-in server, or nginx if you want it to survive reboots cleanly:
cd ~/socialapp/client-web
python3 -m http.server 80   # or put it behind nginx (see Option C)
```

Then send friends `http://your-vm-ip/` — but first see **"Pointing the
client at your server"** below, since by default the client talks to
`localhost`, which means *their* machine, not yours.

## Option B — static client on a CDN host, server on a VM

Good for: a nicer URL and instant global CDN for the client, while the
server still lives on the VM from Option A.

Static hosts that work great for `client-web/` with zero config, all with
generous free tiers: **Cloudflare Pages**, **Netlify**, **Vercel**,
**GitHub Pages**. Drag-and-drop the `client-web` folder in any of their
dashboards, or connect a git repo and point the build output at
`client-web/` with no build command (it's already plain static files).

Server still needs a VM as in Option A — static hosts can't run a
long-lived C++ process or hold WebSocket connections.

## Option C — nginx in front (recommended once this is more than a demo)

Once friends are actually using it, put nginx in front of both ports so
you get one clean domain, HTTPS via Let's Encrypt, and can hide the raw
port numbers:

```nginx
server {
    listen 80;
    server_name pulse.yourdomain.com;

    location / {
        root /home/user/socialapp/client-web;
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8080/;
    }

    location /ws/ {
        proxy_pass http://127.0.0.1:8081/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```
Then run `sudo certbot --nginx -d pulse.yourdomain.com` for free HTTPS
(Certbot / Let's Encrypt). Once you do this, browsers will insist on `wss://`
(secure WebSocket) instead of `ws://` — nginx's proxy config above handles
that upgrade transparently.

## Option D — Vercel (client only)

Good for: dead simple, and it's already what you're picturing. Vercel is
built for exactly `client-web/` — static files, zero build step, global
CDN, free tier covers this easily. A `vercel.json` is already sitting in
`client-web/` so it deploys as-is with no config from you.

**Web dashboard (simplest):**
1. Push the repo to GitHub (or just drag-and-drop the `client-web` folder
   at vercel.com/new — it accepts a raw folder upload too).
2. If using GitHub: import the repo, set **Root Directory** to `client-web`,
   leave Build Command empty, Output Directory as `.`. Deploy.
3. You get a `https://your-project.vercel.app` URL immediately.

**CLI (just as simple):**
```bash
npm i -g vercel      # one-time
cd client-web
vercel               # follow the prompts, first deploy is a preview
vercel --prod        # promote to your real production URL
```

One catch, same as every static host: **Vercel can't run the C++ server.**
No long-running processes, no held-open sockets — that's what serverless
platforms trade away for the instant global CDN. So the backend still needs
Option A (a small VM) running somewhere reachable, and the client needs to
know its address. That's the one edit below — do it before `vercel --prod`,
or Vercel will happily serve a UI that's trying to talk to `localhost`,
which means *the visitor's own machine*, not your server, and nothing will
load.



Right now `client-web/js/api.js` and `client-web/js/ws.js` hardcode
`localhost` at the top:
```js
export const API_BASE = 'http://localhost:8080';   // api.js
export const WS_URL   = 'ws://localhost:8081';     // ws.js
```
Before deploying, change these two lines to your server's real address,
e.g.:
```js
export const API_BASE = 'http://your-vm-ip:8080';
export const WS_URL   = 'ws://your-vm-ip:8081';
```
(or, once you're on Option C with nginx + HTTPS: `https://pulse.yourdomain.com/api`
and `wss://pulse.yourdomain.com/ws`, adjusting the nginx config's
`location` blocks to match).

## A note on the database

The server now runs on **Postgres** (migrated from an earlier SQLite
version — see `README.md`'s "Postgres migration" section for what
changed and why). Set `PULSE_DATABASE_URL` to a real `postgres://`
connection string — Render, Railway, and Supabase all hand you one
directly from their managed-Postgres dashboards. See
**`docs/RENDER_DEPLOY.md`** for the Render-specific walkthrough, which
is the current hosting plan. Back it up with your provider's built-in
Postgres backup tooling (Render/Railway/Supabase all offer this) rather
than a manual file copy — that's the point of moving off SQLite.

## Quick recommendation

For "get it live for friends this week": **client on Vercel** (Option D —
genuinely a 2-minute deploy), **backend on Oracle's free ARM VM** or a
**$5 DigitalOcean droplet** (Option A). Edit the two lines below to point
the Vercel-hosted client at your VM's address, then `vercel --prod`. Add
nginx + HTTPS on the VM (Option C) once more than a handful of people are
using it regularly — Vercel serves the client over HTTPS automatically,
but browsers will block a `wss://` page from talking to a plain `ws://`
backend, so at that point the VM needs HTTPS/WSS too.

## Turning on real Google / Discord sign-in

The OAuth buttons work out of the box — they just need your own app
credentials, since Google and Discord each require registering an
application under your own account (normal for any app, no way around it).
See **`docs/OAUTH_SETUP.md`** for the full 5-minutes-per-provider
walkthrough, including exactly which environment variables to set on
the VM and how they interact with the systemd service from Option A.
