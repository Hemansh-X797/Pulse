'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listProfileBadges } from '../lib/api/badges';

/**
 * Small row of a profile's earned badges (currently just Founding
 * Member, but built to hold more without changes here — see
 * 031_badges_founding_member.sql). Renders nothing at all if the
 * profile has none, rather than an empty row taking up space.
 */
export function ProfileBadges({ userId, size = 16 }: { userId: string; size?: number }) {
  const { data: badges = [] } = useQuery({
    queryKey: ['profile-badges', userId],
    queryFn: () => listProfileBadges(userId),
  });
  const [hovered, setHovered] = useState<string | null>(null);

  if (badges.length === 0) return null;

  return (
    <div className="flex items-center gap-1">
      {badges.map((b) => (
        <div key={b.id} className="relative" onMouseEnter={() => setHovered(b.id)} onMouseLeave={() => setHovered(null)}>
          <img src={b.icon} alt={b.label} width={size} height={size} className="shrink-0" />
          {hovered === b.id && (
            <div className="absolute bottom-full left-1/2 z-50 mb-1.5 w-max max-w-[220px] -translate-x-1/2 rounded-lg border border-[var(--color-hairline-strong)] bg-[var(--color-surface-overlay)] px-2.5 py-1.5 text-[11px] shadow-xl">
              <div className="font-semibold text-[var(--color-ink)]">{b.label}</div>
              <div className="text-[var(--color-ink-muted)]">{b.description}</div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
