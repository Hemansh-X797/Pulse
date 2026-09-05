'use client';

import { useQuery } from '@tanstack/react-query';
import { listProfileDecorCatalog } from '../lib/profileDecor';

/**
 * Profile Decor (renamed from "nameplate") now covers the *entire*
 * profile card as a background, not just a strip along the bottom —
 * direct request, and it also matches how the newer, denser/animated
 * decor art (the "psion"/"duality"/etc-style pieces) is meant to read:
 * as a full backdrop the profile card sits on top of, not a thin band.
 *
 * Render this as the first child of a `relative` card container, then
 * wrap the actual card content (avatar, name, bio, buttons) in a
 * sibling with `relative z-10` so it stays legible on top. The
 * gradient fade at the bottom keeps text readable regardless of how
 * busy the decor art is, without needing to know the card's own
 * background color.
 */
export function ProfileDecorBackground({ decorId }: { decorId: string | null | undefined }) {
  const { data: catalog = [] } = useQuery({
    queryKey: ['profile-decor-catalog'],
    queryFn: listProfileDecorCatalog,
    staleTime: Infinity,
  });
  const decor = decorId ? catalog.find((d) => d.id === decorId) : undefined;

  if (!decor) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      <img src={decor.icon} alt="" className="h-full w-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
    </div>
  );
}
