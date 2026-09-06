import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    // Supabase Storage public URLs — avatars, banners, post/message media.
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'zfucxtrbvdvrkxagqtvg.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
  // `@me` can't be a literal filesystem route segment in the App Router —
  // a folder named `@folder` is reserved for parallel-route slots and
  // silently doesn't produce a URL segment at all (confirmed via `next
  // build`'s route table: app/(app)/channels/@me/page.tsx was compiling
  // to plain `/channels`, not `/channels/@me`, with zero warning). The
  // actual route lives at app/(app)/channels/me/, and this rewrite keeps
  // the Discord-style `/channels/@me` URL working for real requests and
  // for next/link client-side navigation.
  async rewrites() {
    return [
      { source: '/channels/@me', destination: '/channels/me' },
      { source: '/channels/@me/:channelId', destination: '/channels/me/:channelId' },
    ];
  },
};

export default nextConfig;
