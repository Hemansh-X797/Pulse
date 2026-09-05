'use client';

import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listAvatarDecorationCatalog } from '../lib/avatarDecorations';

/**
 * Wraps any avatar element with an optional decoration overlay — a ring/
 * frame image drawn oversized and centered on top of the avatar,
 * scaled to whatever size the avatar itself renders at. `children`
 * should be exactly the avatar element (image or initials fallback);
 * this only adds the overlay + the extra sizing room it needs.
 *
 * Looks the icon up from the DB catalog (avatar_decoration_catalog,
 * see 034_decoration_catalogs.sql) rather than a hardcoded map, so new
 * decorations just need a catalog row, not a code change. The catalog
 * query is shared/cached (staleTime: Infinity — it's curated content
 * that doesn't change mid-session) so mounting many decorated avatars
 * on one screen (e.g. a message list) costs one fetch, not one per
 * avatar.
 */
export function DecoratedAvatar({
  decorationId,
  size,
  children,
}: {
  decorationId: string | null | undefined;
  size: number;
  children: ReactNode;
}) {
  const { data: catalog = [] } = useQuery({
    queryKey: ['avatar-decoration-catalog'],
    queryFn: listAvatarDecorationCatalog,
    staleTime: Infinity,
  });
  const decoration = decorationId ? catalog.find((d) => d.id === decorationId) : undefined;

  if (!decoration) return <>{children}</>;

  // Decorations extend past the avatar's own edge (the ring sits inside
  // a 100x100 box drawn around a ~92% diameter circle), so the wrapper
  // needs to be a little larger than the avatar itself and the avatar
  // centered inside it.
  const wrapperSize = Math.round(size * 1.32);

  return (
    <div className="relative shrink-0" style={{ width: wrapperSize, height: wrapperSize }}>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
      <img src={decoration.icon} alt="" className="pointer-events-none absolute inset-0 h-full w-full" />
    </div>
  );
}
