# Assets

Your real layout is `<repo-root>/assets/` sitting **next to** this app
(`<repo-root>/web/`), not nested inside it — confirmed from your Vercel
build log's root path. Next.js can only serve files from *this app's own*
`public/` folder, so `scripts/copy-assets.mjs` mirrors `../assets/` into
`public/` automatically before every `dev`/`build` (wired via the
`predev`/`prebuild` npm scripts in `package.json`) — nothing to copy or
symlink by hand, and it won't drift out of sync.

If `../assets` doesn't exist in a given environment (e.g. someone else's
fresh checkout without it yet), the script just logs a note and skips —
it doesn't fail the build.

| Your file | Copied to | Used by |
|---|---|---|
| `assets/logo.svg` | `public/logo.svg` | Landing page mark |
| `assets/avatars/default-0.svg` … `default-7.svg` | `public/avatars/` | not auto-selected yet — see note below |
| `assets/badges/*.svg` | `public/badges/` | not wired yet — profile badges are a later phase |
| `assets/illustrations/empty-dms.svg` | `public/illustrations/` | empty state in the DM sidebar |
| `assets/illustrations/no-notifications.svg` | `public/illustrations/` | empty state in the notifications popover |
| `assets/server-icons/default-0.svg` … `default-5.svg` | `public/space-icons/` (renamed by the copy script — matches the servers→spaces rebrand without touching your source files) | not auto-selected yet — see note below |
| `assets/app-*.png`, `assets/auth-screenshot.png` | not copied (not referenced by app code — marketing/README use) | — |

**Default avatars / space icons aren't auto-selected yet.** A person or
space with no avatar/icon currently shows gradient initials (the
presence-gradient identity system — see MIGRATION_GUIDE.md). Wiring
"assign one of the 8 defaults at signup" is onboarding work, not this
asset pass — flag it when Friends/onboarding starts and these files are
ready to use for it.
