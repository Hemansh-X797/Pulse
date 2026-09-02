import type { Metadata } from 'next';
import { Fraunces, Inter, IBM_Plex_Mono, Orbitron, Bungee, Permanent_Marker, UnifrakturMaguntia, Press_Start_2P } from 'next/font/google';
import Script from 'next/script';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import './globals.css';
import { Providers } from './providers';

// Set in .env.local / Vercel project env vars — NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXX.
// Not hardcoded here on purpose: an env var means this stays out of
// source control and can differ between preview/production deploys
// without a code change.
const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

// Previously loaded via a <link> tag in the old Vite index.html — that
// file has no Next.js equivalent, so these fonts were silently never
// loading at all post-migration; every --font-serif/--font-mono
// reference was quietly falling back to system fonts. next/font
// self-hosts and subsets automatically, so this is a straight upgrade
// over the old external Google Fonts request too (no render-blocking
// network call, no layout shift while the real font swaps in).
const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['500', '600'],
  style: ['normal', 'italic'],
  variable: '--font-fraunces',
  display: 'swap',
});
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-inter',
  display: 'swap',
});
const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-plex-mono',
  display: 'swap',
});

// Name-style fonts. `gothic` and `pixel` referenced these families by
// name in globals.css's .name-font-* classes for a while, but nothing
// ever actually loaded them (no next/font entry, no Google Fonts
// <link>) — so both silently fell back to the serif/mono stack and the
// "Gothic"/"Pixel" font picks in the name style modal did nothing
// visually. Loading them for real here fixes that, plus adds three new
// picks (Orbitron, Bungee, Permanent Marker) for actual variety beyond
// the original four.
const unifraktur = UnifrakturMaguntia({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-gothic',
  display: 'swap',
});
const pressStart = Press_Start_2P({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-pixel',
  display: 'swap',
});
const orbitron = Orbitron({
  subsets: ['latin'],
  weight: ['500', '700', '900'],
  variable: '--font-orbitron',
  display: 'swap',
});
const bungee = Bungee({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-bungee',
  display: 'swap',
});
const permanentMarker = Permanent_Marker({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-marker',
  display: 'swap',
});

const SITE_URL = 'https://palspace.vercel.app';
const CREATOR_URL = 'https://hemansh.vercel.app';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'PalSpace | Chat, Feed, Spaces & Stories',
    template: '%s | PalSpace',
  },
  description:
    'PalSpace — chat, feed, spaces, and stories in one app. Created by Hemansh Kumar Mishra (Hemansh-X797), polymath and systems architect.',
  keywords: [
    'PalSpace', 'social media app', 'chat app', 'spaces', 'topics', 'stories',
    'Hemansh Kumar Mishra', 'Hemansh', 'Hemansh-X797', 'Pulse social platform',
  ],
  authors: [{ name: 'Hemansh Kumar Mishra', url: CREATOR_URL }],
  creator: 'Hemansh Kumar Mishra',
  publisher: 'Hemansh Kumar Mishra',
  alternates: { canonical: SITE_URL },
  openGraph: {
    title: 'PalSpace | Chat, Feed, Spaces & Stories',
    description: 'PalSpace — chat, feed, spaces, and stories in one app.',
    url: SITE_URL,
    siteName: 'PalSpace',
    locale: 'en_US',
    type: 'website',
    images: [{ url: `${SITE_URL}/og/palspace.jpg`, width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'PalSpace | Chat, Feed, Spaces & Stories',
    description: 'Created by Hemansh Kumar Mishra. Chat, feed, spaces, and stories in one app.',
    creator: '@_Hemansh',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-video-preview': -1, 'max-image-preview': 'large', 'max-snippet': -1 },
  },
};

// Structured data linking PalSpace to its creator's Person entity — same
// pattern as hemansh.vercel.app's own PersonGraph, but scoped from this
// side: a SoftwareApplication node whose `author`/`creator` point at a
// Person `@id` on the creator's own domain, rather than duplicating his
// full bio here. Google resolves the two graphs as the same entity via
// that shared @id + the reciprocal sameAs link back from his site.
function AppGraph() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'SoftwareApplication',
        '@id': `${SITE_URL}/#app`,
        name: 'PalSpace',
        operatingSystem: 'Web',
        applicationCategory: 'SocialNetworkingApplication',
        url: SITE_URL,
        description: 'Chat, feed, spaces, and stories in one app.',
        author: { '@id': `${CREATOR_URL}/#person` },
        creator: { '@id': `${CREATOR_URL}/#person` },
      },
      {
        '@type': 'Person',
        '@id': `${CREATOR_URL}/#person`,
        name: 'Hemansh Kumar Mishra',
        alternateName: ['Hemansh', 'Hemansh-X797'],
        url: CREATOR_URL,
        sameAs: [CREATOR_URL, 'https://github.com/Hemansh-X797', 'https://x.com/_Hemansh'],
      },
      {
        '@type': 'WebSite',
        '@id': `${SITE_URL}/#website`,
        url: SITE_URL,
        name: 'PalSpace',
        publisher: { '@id': `${CREATOR_URL}/#person` },
        inLanguage: 'en-US',
      },
    ],
  };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />;
}

// Blocking pre-hydration script: reads the stored theme preference and
// sets data-theme before first paint, so returning visitors who picked
// Classic don't see a flash of the (new default) Bespoke theme before
// JS catches up. Runs synchronously because it's a plain <script> tag
// in <head>, not a React effect — same reasoning as any dark-mode
// flash-prevention script.
const THEME_INIT_SCRIPT = `
try {
  var t = localStorage.getItem('palspace-theme');
  var valid = ['bespoke', 'classic', 'sunroom', 'signal'];
  document.documentElement.setAttribute('data-theme', valid.indexOf(t) !== -1 ? t : 'bespoke');
} catch (e) {
  document.documentElement.setAttribute('data-theme', 'bespoke');
}
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="bespoke" className={`${fraunces.variable} ${inter.variable} ${plexMono.variable} ${unifraktur.variable} ${pressStart.variable} ${orbitron.variable} ${bungee.variable} ${permanentMarker.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        {GA_MEASUREMENT_ID && (
          <>
            <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`} strategy="afterInteractive" />
            <Script id="ga-init" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${GA_MEASUREMENT_ID}');
              `}
            </Script>
          </>
        )}
      </head>
      <body>
        <AppGraph />
        <Providers>{children}</Providers>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
