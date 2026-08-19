import type { MetadataRoute } from 'next';

const SITE_URL = 'https://palspace.vercel.app';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Everything behind the (app) route group is a signed-in-only
        // surface (feed, DMs, spaces, settings, stories, profiles) —
        // there's nothing there for a crawler to usefully index, and
        // RLS means an anonymous crawler would just hit empty/redirect
        // responses anyway. Only the public marketing landing page and
        // /login are worth crawling.
        disallow: ['/home', '/channels', '/spaces', '/settings', '/stories', '/friends'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
