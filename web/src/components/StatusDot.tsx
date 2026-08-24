'use client';

import { useAppStore } from '../store/useAppStore';

/**
 * Renders next to an avatar. Reads live from the presenceByUserId
 * store slice (see usePresenceSync.ts) — absence from that map means
 * offline (someone not connected at all) or invisible (connected but
 * chosen not to appear online), which are deliberately indistinguishable
 * to other people, same as Discord's own invisible mode.
 */
export function StatusDot({ userId, size = 10, ring = true }: { userId: string; size?: number; ring?: boolean }) {
  const status = useAppStore((s) => s.presenceByUserId[userId]);
  const color = status === 'online' ? '#22c55e' : status === 'dnd' ? '#ef4444' : '#52525b';

  return (
    <span
      className={ring ? 'rounded-full border-2 border-[var(--color-void)]' : 'rounded-full'}
      style={{ display: 'inline-block', width: size, height: size, background: color }}
      title={status === 'online' ? 'Online' : status === 'dnd' ? 'Do Not Disturb' : 'Offline'}
    />
  );
}
