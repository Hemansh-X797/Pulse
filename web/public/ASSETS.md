# Where your assets go

Your `assets/` folder maps onto `public/` like this — drop each file at
the matching path and it picks up automatically (nothing else to wire):

| Your file | Goes to | Used by |
|---|---|---|
| `assets/logo.svg` | `public/logo.svg` | Landing page mark |
| `assets/avatars/default-0.svg` … `default-7.svg` | `public/avatars/` | not auto-selected yet — see note below |
| `assets/badges/*.svg` | `public/badges/` | not wired yet — Phase 2 profile/badges work |
| `assets/illustrations/empty-dms.svg` | `public/illustrations/empty-dms.svg` | empty state in the DM sidebar |
| `assets/illustrations/no-notifications.svg` | `public/illustrations/no-notifications.svg` | empty state in the notifications popover |
| `assets/server-icons/default-0.svg` … `default-5.svg` | `public/space-icons/` (renamed folder, matches the servers→spaces rebrand) | not auto-selected yet — see note below |
| `assets/app-*.png`, `assets/auth-screenshot.png` | wherever you want (README/marketing use, not referenced by app code) | — |

Every reference in the code checks for the file and fails gracefully
(hides the `<img>`, no broken-image icon) if it's not there yet, so
nothing breaks in the meantime — but it also means a typo'd path fails
silently. Double-check the exact filenames above if something doesn't
show up.

**Default avatars / space icons aren't auto-selected yet.** Right now a
person or space with no avatar/icon just shows gradient initials
(the presence-gradient system — see MIGRATION_GUIDE.md). Wiring "assign
one of the 8 default avatars at signup" is signup/onboarding work
(Friends + onboarding phase), not something that belongs in this asset
pass — flag it when that phase starts and I'll use these files for it.
