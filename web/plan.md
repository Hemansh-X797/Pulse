# plan.md — nav cleanup, profile popover, real image cropper, emoji/GIF

## Quick, doing first
1. Remove the separate Friends rail icon — Discord doesn't have one
   either (see your own screenshot: Friends is a tab *inside* the DM
   view, not its own app icon). Friends link already lives at the top
   of the DM sidebar; the rail icon was redundant, removing it is the
   actual "unify" fix.
2. Sidebar header: swap the small gradient dot + "PalSpace" text for
   just `logo.svg`, no text next to it.
3. Appearance → **Compact mode** toggle (message density in chat) —
   real, wired to actual spacing classes in ChatView, not a dead toggle.

## Profile popover (click name → small card; click avatar in card → full page)
New `ProfileCard` popover component. Wiring it into the two highest-
traffic spots first — feed post authors and DM/chat message senders —
not literally everywhere in one pass (comments, space member lists,
etc. can follow once this pattern is proven out).

## Real image cropper for avatar/banner upload
Currently `uploadMedia()` gets called directly on file-select with no
crop step — whatever aspect ratio you picked is what gets uploaded.
Building a real crop modal (drag to pan, slider to zoom, circular mask
for avatar / rect mask for banner) using a `<canvas>`, no external
cropper library needed for something this scoped. Exports a cropped
blob, *then* calls `uploadMedia()`.

## Emoji picker
`emoji.ts` already has a shortcode → emoji map (`:fire:` → 🔥) used for
rendering — reusing that same map to build an actual picker grid in
`ChatView`'s compose bar, rather than requiring people to remember
shortcodes.

## GIF picker (Giphy)
Real feature, and it can actually be free — Giphy's API has a genuine
free tier (unlike SMS, there's no per-message carrier cost here). Needs
`NEXT_PUBLIC_GIPHY_API_KEY` in your env — get one free at
developers.giphy.com. Search-as-you-type grid, click to send as a
message attachment. Skipping Tenor for this pass (one working
integration beats two half-wired ones); flagging as an easy add-on
later if wanted.

## Media upload in DMs
Already existed before this message — `ChatView`'s attach-image button
has worked since the Phase 2 pass. Confirmed still working, no change
needed here.

## Discord-style profile edit (live preview panel, nameplate/banner-color/
frame sections from your screenshot)
**Not in this pass.** This is a real visual subsystem (decorative
frames, nameplate assets, a live-updating preview card) layered on top
of what Settings → Profile already does — cramming it in alongside
everything else above risks the same "half-built" result you've pushed
back on twice already. Flagging honestly rather than shipping a rushed
version; tell me if you want this prioritized next and it goes first.
