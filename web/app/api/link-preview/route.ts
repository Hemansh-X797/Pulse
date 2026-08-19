import { NextRequest, NextResponse } from 'next/server';

// Route Handler, not a client-side fetch: browsers block reading the
// body of a cross-origin fetch() to an arbitrary third-party URL
// (there's no CORS header a random site posted in chat is going to
// send back for palspace.vercel.app), so parsing <meta> tags has to
// happen server-side. This mirrors what Discord/Slack/iMessage link
// previews all do under the hood.

export const runtime = 'nodejs';

interface OgResult {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
}

// Small in-memory cache so re-rendering the same message (scroll,
// re-mount, another viewer opening the same channel) doesn't re-fetch
// the target site every time. Resets on server restart/redeploy —
// fine for this; it's a "make it not obviously wasteful" cache, not a
// correctness requirement.
const CACHE = new Map<string, { data: OgResult; expiresAt: number }>();
const CACHE_TTL_MS = 30 * 60 * 1000;
const FETCH_TIMEOUT_MS = 5000;

function extractMeta(html: string, prop: string): string | null {
  // Matches both attribute orders: property="og:x" content="..." and
  // content="..." property="og:x" — real-world HTML isn't consistent
  // about this, and a regex that only handles one order silently
  // misses a meaningful fraction of sites.
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${prop}["'][^>]+content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${prop}["']`, 'i'),
    new RegExp(`<meta[^>]+name=["']${prop}["'][^>]+content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+name=["']${prop}["']`, 'i'),
  ];
  for (const re of patterns) {
    const m = re.exec(html);
    if (m) return decodeHtmlEntities(m[1]);
  }
  return null;
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function extractTitleTag(html: string): string | null {
  const m = /<title[^>]*>([^<]*)<\/title>/i.exec(html);
  return m ? decodeHtmlEntities(m[1].trim()) : null;
}

function isPrivateHost(hostname: string): boolean {
  // Basic SSRF guard: don't let this route be used to probe internal
  // network addresses. Not exhaustive (doesn't resolve DNS to catch
  // rebinding), but blocks the obvious cases.
  return (
    hostname === 'localhost' ||
    hostname === '0.0.0.0' ||
    hostname.endsWith('.local') ||
    /^127\./.test(hostname) ||
    /^10\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
  );
}

export async function GET(req: NextRequest) {
  const target = req.nextUrl.searchParams.get('url');
  if (!target) {
    return NextResponse.json({ error: 'missing url param' }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return NextResponse.json({ error: 'invalid url' }, { status: 400 });
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return NextResponse.json({ error: 'unsupported protocol' }, { status: 400 });
  }
  if (isPrivateHost(parsed.hostname)) {
    return NextResponse.json({ error: 'host not allowed' }, { status: 400 });
  }

  const cached = CACHE.get(parsed.href);
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json(cached.data);
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(parsed.href, {
      signal: controller.signal,
      headers: {
        // Some sites serve a stripped no-JS/no-meta page to unknown
        // bots; a normal browser UA gets the real page more reliably.
        'User-Agent':
          'Mozilla/5.0 (compatible; PalSpaceLinkPreview/1.0; +https://palspace.vercel.app)',
      },
      redirect: 'follow',
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return NextResponse.json({ error: `upstream returned ${res.status}` }, { status: 502 });
    }
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) {
      return NextResponse.json({ error: 'not an html page' }, { status: 415 });
    }

    // Only read enough of the body to find <head> meta tags — link
    // preview data always lives there, and capping this avoids
    // buffering an entire large page into memory for no reason.
    const reader = res.body?.getReader();
    let html = '';
    if (reader) {
      const decoder = new TextDecoder();
      let bytesRead = 0;
      const MAX_BYTES = 100_000;
      while (bytesRead < MAX_BYTES) {
        const { done, value } = await reader.read();
        if (done) break;
        bytesRead += value.byteLength;
        html += decoder.decode(value, { stream: true });
        if (/<\/head>/i.test(html)) break;
      }
      reader.cancel().catch(() => {});
    }

    const data: OgResult = {
      url: parsed.href,
      title: extractMeta(html, 'og:title') || extractTitleTag(html),
      description: extractMeta(html, 'og:description') || extractMeta(html, 'description'),
      image: extractMeta(html, 'og:image'),
      siteName: extractMeta(html, 'og:site_name') || parsed.hostname,
    };

    CACHE.set(parsed.href, { data, expiresAt: Date.now() + CACHE_TTL_MS });
    return NextResponse.json(data);
  } catch (e) {
    const message = e instanceof Error && e.name === 'AbortError' ? 'request timed out' : 'fetch failed';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
