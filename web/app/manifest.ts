import type { MetadataRoute } from 'next';

// PalSpace's brand color is the presence-gradient system's base ink,
// not a single fixed hex — theme_color/background_color below use the
// dark ink/paper values from globals.css's :root since a PWA manifest
// needs one static pair, not a full gradient token set.
//
// Only public/logo.svg exists as a real brand asset right now (see
// public/ASSETS.md) — no dedicated 192x192/512x512 PNG icon set has
// been provided. Using the SVG as a scalable "any" purpose icon works
// in most installers (Chrome/Edge/Android), but iOS home-screen icons
// specifically need a real PNG (apple-touch-icon) which this doesn't
// cover yet — flag if you want a proper icon set generated once you
// have a final logo mark to work from.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'PalSpace',
    short_name: 'PalSpace',
    description: 'Chat, feed, spaces, and stories in one app.',
    start_url: '/home',
    display: 'standalone',
    background_color: '#131319',
    theme_color: '#131319',
    icons: [
      {
        src: '/logo.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
    ],
  };
}
