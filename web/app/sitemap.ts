import type { MetadataRoute } from 'next';

const SITE_URL = 'https://palspace.vercel.app';

// Every other route lives under app/(app)/ which is gated behind
// useAuthSync — there's no logged-out, indexable version of them, so a
// sitemap entry for /home or /spaces/[id] would just be a dead/
// redirecting URL for a crawler. Only the two genuinely public routes
// go here. Add more as real public pages (e.g. a public profile view,
// if that's ever built as an unauthenticated surface) actually exist.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 1,
    },
    {
      url: `${SITE_URL}/login`,
      lastModified: new Date(),
      changeFrequency: 'yearly',
      priority: 0.5,
    },
    {
      url: `${SITE_URL}/terms`,
      lastModified: new Date(),
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/privacy`,
      lastModified: new Date(),
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/status`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.4,
    },
  ];
}
