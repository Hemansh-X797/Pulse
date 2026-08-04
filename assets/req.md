# Assets needed (add these under `assets/`)

## Phase 1 (chat core) — minimal, can launch without most of this
- `assets/icons/logo.svg` — app logo, works on dark bg
- `assets/icons/send.svg`, `assets/icons/attach.svg`, `assets/icons/emoji.svg`
- `assets/fonts/Inter-Variable.ttf` (or your chosen UI font, OFL-licensed)
- `assets/sounds/message-in.mp3`, `assets/sounds/message-out.mp3` (short,
  <100ms, unobtrusive — this alone makes chat feel 10x more alive)

## Phase 2 (profiles + posts)
- `assets/avatars/default-0.png` ... `default-7.png` — default avatar set
  (geometric/abstract, ~256x256, so new users aren't a gray circle)
- `assets/banners/default-gradient-*.png` — a handful of default profile
  banner gradients/patterns (1500x500)
- `assets/badges/` — small profile badges (verified, early-adopter, etc.),
  32x32 SVG
- `assets/emoji/` — OPTIONAL: only needed if you don't want to rely on the
  OS/browser's native emoji font. If you want custom emoji art (Discord-style
  chunky emoji instead of native), source a full MIT/CC0 emoji set (e.g.
  OpenMoji, CC-BY-SA — check license terms) as 72x72 PNGs named by shortcode,
  e.g. `fire.png`, `heart.png`. I'll wire the renderer to prefer these if
  present, fall back to native emoji otherwise.

## Phase 3 (growth)
- `assets/oauth/google-btn.svg`, `assets/oauth/discord-btn.svg` — official
  brand-guideline sign-in buttons (Google and Discord both publish exact
  spec assets/colors — use theirs, don't reinvent, avoids brand-guideline
  rejection later)
- `assets/illustrations/empty-feed.svg`, `empty-dms.svg`,
  `no-notifications.svg` — empty-state illustrations

## Phase 4 (mobile + polish)
- `assets/app-icon/` — 1024x1024 master icon + platform-generated sizes
- `assets/splash/splash.png`
- Push notification icon set (Android needs a monochrome silhouette version)

### Notes
- Keep everything either your own work, CC0, or a license compatible with
  MIT (no GPL art assets bundled into a repo you plan to license
  permissively — that's a legal footgun, not a style problem).
- I don't need these to keep building the server/logic — only the client
  visuals need them. Server-side, media is just "a URL," so Phase 1–2 backend
  work isn't blocked on this file at all.
