import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    // Supabase Storage public URLs — avatars, banners, post/message media.
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'zfuctxrbvdvrkxagqtvg.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
};

export default nextConfig;
