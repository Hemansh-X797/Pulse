'use client';

import { useEffect, useRef } from 'react';

const BASE_FAVICON = '/favicon.svg';
const BASE_TITLE_SUFFIX = 'PalSpace';

let cachedBaseImage: HTMLImageElement | null = null;
function loadBaseImage(): Promise<HTMLImageElement> {
  if (cachedBaseImage) return Promise.resolve(cachedBaseImage);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      cachedBaseImage = img;
      resolve(img);
    };
    img.onerror = reject;
    img.src = BASE_FAVICON;
  });
}

function getOrCreateFaviconLink(): HTMLLinkElement {
  let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  return link;
}

/**
 * Draws the base favicon onto an offscreen canvas, overlays a red
 * dot (or a number for small counts) in the corner if there's anything
 * unread, and swaps the <link rel="icon"> href to the resulting PNG
 * data URL — this is the standard technique for a dynamic favicon
 * badge, since <link rel="icon"> itself can't be templated with live
 * data. Matches what Discord/Slack's own web tabs do.
 */
async function renderBadgedFavicon(count: number) {
  try {
    const base = await loadBaseImage();
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(base, 0, 0, size, size);

    if (count > 0) {
      const r = size * 0.28;
      const cx = size - r - 2;
      const cy = r + 2;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = '#ef4444';
      ctx.fill();
      ctx.lineWidth = size * 0.04;
      ctx.strokeStyle = '#000';
      ctx.stroke();

      if (count <= 99) {
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${r * 1.15}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(count), cx, cy + 1);
      }
    }

    getOrCreateFaviconLink().href = canvas.toDataURL('image/png');
  } catch {
    // Favicon badge is a nicety, not a correctness requirement — if the
    // base SVG fails to load/rasterize for any reason, just leave the
    // static favicon alone rather than surfacing an error for this.
  }
}

/**
 * Wires total unread DM count to: the tab favicon (dot/count overlay),
 * the tab title ("(3) PalSpace"), and the Badging API's taskbar/dock
 * icon badge where the browser supports it (Chrome/Edge desktop —
 * there's no Safari/Firefox support for navigator.setAppBadge, so this
 * is a bonus layer on top of the favicon/title, not the only mechanism).
 */
export function useUnreadBadge(count: number) {
  const lastCount = useRef<number>(-1);

  useEffect(() => {
    if (lastCount.current === count) return;
    lastCount.current = count;

    renderBadgedFavicon(count);
    document.title = count > 0 ? `(${count > 99 ? '99+' : count}) ${BASE_TITLE_SUFFIX}` : BASE_TITLE_SUFFIX;

    const nav = navigator as Navigator & {
      setAppBadge?: (n?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    if (count > 0) {
      nav.setAppBadge?.(count).catch(() => {});
    } else {
      nav.clearAppBadge?.().catch(() => {});
    }
  }, [count]);
}
