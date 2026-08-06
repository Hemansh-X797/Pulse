# Setting up real Google & Discord sign-in

The OAuth flow itself is fully built and tested against both providers'
live token endpoints (see `server/src/auth/oauth.hpp`) — what's missing is
*your* app credentials, which only you can create, since each provider
requires you to register an application under your own account.

Takes about 5 minutes per provider.

## Google

1. Go to [console.cloud.google.com](https://console.cloud.google.com/) and
   create a new project (or use an existing one).
2. **APIs & Services → OAuth consent screen** — choose "External," fill in
   an app name and your email. You don't need verification for testing
   with your own Google account; add friends' emails under "Test users" if
   the app stays in "Testing" mode.
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   — Application type: **Web application**.
4. Under **Authorized redirect URIs**, add exactly:
   ```
   http://localhost:8080/auth/google/callback
   ```
   (swap `localhost:8080` for your real server address once deployed —
   see the bottom of this doc.)
5. Save. You'll get a **Client ID** and **Client Secret** — copy both.

## Discord

1. Go to [discord.com/developers/applications](https://discord.com/developers/applications)
   and click **New Application**. Name it (e.g. "Pulse").
2. **OAuth2** tab in the left sidebar.
3. Under **Redirects**, click **Add Redirect** and enter exactly:
   ```
   http://localhost:8080/auth/discord/callback
   ```
4. Copy the **Client ID** from the top of the OAuth2 page, and click
   **Reset Secret** to reveal / generate the **Client Secret**.

## Wiring the credentials in

The server reads these from environment variables — nothing is hardcoded
or committed, so it's safe to keep this repo public even with sign-in
configured.

```bash
export PULSE_GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com"
export PULSE_GOOGLE_CLIENT_SECRET="your-google-client-secret"
export PULSE_GOOGLE_REDIRECT_URI="http://localhost:8080/auth/google/callback"

export PULSE_DISCORD_CLIENT_ID="your-discord-client-id"
export PULSE_DISCORD_CLIENT_SECRET="your-discord-client-secret"
export PULSE_DISCORD_REDIRECT_URI="http://localhost:8080/auth/discord/callback"

# Where the browser gets sent back to after a successful/failed login —
# your web client's URL, not the API server's.
export PULSE_FRONTEND_URL="http://localhost:8099"

./build/pulse_server
```

If a provider's env vars aren't set, that provider's `/auth/*/login` route
returns a clean `501 { "error": "... isn't configured on this server yet" }`
instead of pretending to work — you can turn on Google without Discord, or
neither, and username/password login keeps working regardless.

### Running it as a systemd service (see HOSTING.md)

Add the env vars to the service file instead of exporting them by hand:
```ini
[Service]
Environment="PULSE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com"
Environment="PULSE_GOOGLE_CLIENT_SECRET=your-google-client-secret"
Environment="PULSE_DISCORD_CLIENT_ID=your-discord-client-id"
Environment="PULSE_DISCORD_CLIENT_SECRET=your-discord-client-secret"
Environment="PULSE_FRONTEND_URL=https://pulse.yourdomain.com"
ExecStart=/home/user/socialapp/server/build/pulse_server
```

## Once you deploy (not localhost)

Two things need to change together, or the flow will fail with a
`redirect_uri_mismatch` error from the provider:

1. In both the Google Cloud Console and the Discord Developer Portal, add
   your real domain's callback URL as an additional authorized redirect
   (you can have both `localhost` and your real domain registered at the
   same time — handy for testing locally while also running in prod).
2. Update `PULSE_GOOGLE_REDIRECT_URI` / `PULSE_DISCORD_REDIRECT_URI` (and
   `PULSE_FRONTEND_URL`) to match.

Both providers require **HTTPS** redirect URIs for anything other than
`localhost` — this is exactly why `HOSTING.md`'s nginx + Let's Encrypt step
matters once real people are using this, not just a nice-to-have.

## How the flow works, if you're curious

1. Client hits `GET /auth/google/login` → server redirects the browser to
   Google's real consent screen.
2. User approves → Google redirects back to
   `/auth/google/callback?code=...`.
3. Server exchanges that code for an access token (a real HTTPS POST to
   `oauth2.googleapis.com/token`, over a hand-built OpenSSL TLS client —
   see `server/src/common/https_client.hpp`), then fetches the user's
   Google profile.
4. Server finds-or-creates a Pulse account linked to that Google ID
   (`users.google_id` in the schema), issues a normal Pulse session token,
   and redirects the browser to `PULSE_FRONTEND_URL/#token=...`.
5. The web client picks the token up from the URL hash on load and logs
   in — see the `boot()` function in `client-web/js/app.js`.

Discord follows the identical shape against `discord.com/api/oauth2/token`
and `discord.com/api/users/@me`.
