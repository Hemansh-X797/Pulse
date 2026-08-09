# Assets needed

Status check first — a lot of what this file used to ask for is now
either shipped or no longer needed:

- ✅ **Fonts** — Fraunces + Inter + IBM Plex Mono, loaded from Google
  Fonts in `client-web/index.html`. No local font files needed.
- ✅ **Icons** — real Lucide icons vendored in `client-web/vendor/lucide/`
  (ISC license). No icon pack needed.
- ✅ **OAuth buttons** — real Google "G" mark and Discord Clyde logo in
  `client-web/assets/`, styled per each brand's actual guideline.
- ✅ **Chat/feed "art"** — the dual-accent gradient (user-customizable, no
  static art needed) plus the hand-built auth-screen artwork
  (`client-web/assets/auth-scene.svg`) covers this.
- ✅ **Animation** — anime.js vendored in `client-web/vendor/anime/`.

What's still genuinely needed, in priority order:

## High priority — you'll notice these are missing immediately

- **`assets/avatars/default-0.png` … `default-7.png`** — a set of default
  avatars (geometric/abstract, ~256×256, dark-theme-friendly) for users
  who haven't uploaded a photo yet. Right now new users get initials on a
  gradient, which works but a real default-avatar set (Discord/Slack do
  this) reads as more finished. Since avatar upload is live
  (`POST /media`), this only affects users who *haven't* uploaded one.
- **`assets/sounds/message-in.mp3`** — short (<150ms), unobtrusive
  notification chime. The notification system is fully live
  (`js/components/notifications.js`) but silent right now; a sound cue is
  the single highest-impact "feels alive" addition left. Same file could
  double for the toast in `utils.js`'s `showToast()`.
- **`assets/server-icons/default-0.svg` … `default-5.svg`** — default
  server icons (abstract/geometric, matches the dual-accent-gradient
  language) for servers that haven't uploaded a custom icon. Right now
  server icons fall back to initials-on-gradient (same pattern as
  avatars) — works, but a real set elevates it. See `rail.js`.

## Medium priority — polish, not blocking

- **`assets/illustrations/empty-feed.svg`, `empty-dms.svg`,
  `empty-server.svg`, `no-notifications.svg`** — empty-state
  illustrations. Every empty state right now is a plain muted text line
  (`.empty-state` in feed.css, `.notif-empty` in notifications.css) —
  functional, not memorable.
- **`assets/badges/`** — small profile badges (verified, early-adopter,
  server-owner), 32×32 SVG, for display next to a username in chat/feed.
  No backend support for these yet either — flag if you want this built.
- **`assets/emoji/`** — OPTIONAL, only if you want custom emoji art
  (Discord-style chunky emoji) instead of relying on the OS/browser's
  native emoji font, which is what's used today. If you want this,
  source a full MIT/CC0 set (e.g. OpenMoji — double check its CC-BY-SA
  terms against your license plans) as 72×72 PNGs named by shortcode
  (`fire.png`, `heart.png`, matching `server/src/common/emoji_map.hpp`'s
  names), and I'll wire the renderer to prefer them.

## Later — mobile + growth phase

- **`assets/app-icon/`** — 1024×1024 master icon once a mobile client
  exists (see `ARCHITECTURE.md` Phase 4).
- **`assets/splash/splash.png`** — mobile splash screen.
- **Push notification icon set** — Android specifically needs a
  monochrome silhouette variant. Relevant once
  `serverless/push-notify/` (see that folder's README) is actually wired
  up to real subscriptions.

### Notes

- Keep everything either your own work, CC0, or MIT-compatible — no GPL
  art bundled into a repo you're licensing permissively, that's a legal
  footgun more than a style one.
- Nothing here blocks backend work — media is just a URL server-side, so
  none of this affects `server/`. It's purely a client-visuals list.
- Where to actually source free, high-quality assets matching this
  system: [Google Fonts](https://fonts.google.com) (already used),
  [Lucide](https://lucide.dev) (already used, more icons available if
  you need one not yet vendored), [OpenMoji](https://openmoji.org) (for
  the optional custom emoji set), and
  [Blush](https://blush.design)/[unDraw](https://undraw.co) for
  empty-state illustrations (both offer recolorable SVGs, MIT/open
  licensed, easy to match to the dual-accent palette).
