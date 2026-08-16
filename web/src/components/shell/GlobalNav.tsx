'use client';

import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { Home, MessageCircle, Camera, Plus, Users } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useAppStore } from '../../store/useAppStore';
import { listMySpaces, createSpace } from '../../lib/api/spaces';

function initials(name: string) {
  return name.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}

/**
 * Rail item: a thin gradient indicator on the left edge (grows on
 * hover/active) plus the icon itself, rather than the square→rounded-
 * square morph most Discord-alike rails use — same "this one's active"
 * job, a shape language that isn't a lift from Discord's own signature
 * interaction.
 */
function RailItem({
  href,
  active,
  label,
  children,
  badge,
}: {
  href: string;
  active: boolean;
  label: string;
  children: React.ReactNode;
  badge?: React.ReactNode;
}) {
  return (
    <Link href={href} aria-label={label} className="group relative flex w-full items-center justify-center py-1">
      <span
        className={`absolute left-0 rounded-r-full bg-[image:var(--rail-indicator)] transition-all duration-200 ${
          active ? 'h-6 w-[3px] opacity-100' : 'h-2 w-[3px] opacity-0 group-hover:h-4 group-hover:opacity-70'
        }`}
        style={{ ['--rail-indicator' as string]: 'linear-gradient(var(--presence-default-a), var(--presence-default-b))' }}
      />
      <span
        className={`flex h-11 w-11 items-center justify-center rounded-2xl transition-all duration-150 ${
          active
            ? 'bg-[var(--color-surface-overlay)] text-[var(--color-ink)]'
            : 'bg-[var(--color-surface)] text-[var(--color-ink-muted)] group-hover:bg-[var(--color-surface-raised)] group-hover:text-[var(--color-ink)]'
        }`}
      >
        {children}
      </span>
      {badge}
    </Link>
  );
}

export function GlobalNav() {
  const router = useRouter();
  const pathname = usePathname() ?? '';
  const profile = useAppStore((s) => s.profile);
  const unreadChannels = useAppStore((s) => s.totalUnreadChannels());

  const { data: spaces = [] } = useQuery({
    queryKey: ['spaces'],
    queryFn: listMySpaces,
    enabled: !!profile,
  });

  async function handleAddSpace() {
    const name = window.prompt('Create a space: type a name.');
    if (!name) return;
    const space = await createSpace(name);
    router.push(`/spaces/${space.id}`);
  }

  return (
    <nav className="flex w-[76px] shrink-0 flex-col items-center gap-1 border-r border-[var(--color-hairline)] bg-[var(--color-void)] py-4">
      <div className="mb-3 flex h-8 w-8 items-center justify-center">
        <span className="h-2 w-2 rounded-full presence-fill" />
      </div>

      <RailItem href="/home" active={pathname === '/home'} label="Home feed">
        <Home size={19} strokeWidth={2} />
      </RailItem>

      <RailItem
        href="/channels/@me"
        active={pathname.startsWith('/channels/@me') || pathname.startsWith('/channels/me')}
        label="Direct messages"
        badge={
          unreadChannels > 0 && (
            <span className="pointer-events-none absolute right-3 top-1 flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-[var(--color-void)] px-0.5">
              <span className="flex h-[14px] min-w-[14px] items-center justify-center rounded-full presence-fill px-1 font-mono text-[9px] font-bold text-black">
                {unreadChannels > 9 ? '9+' : unreadChannels}
              </span>
            </span>
          )
        }
      >
        <MessageCircle size={19} strokeWidth={2} />
      </RailItem>

      <RailItem href="/stories" active={pathname === '/stories'} label="Stories">
        <Camera size={19} strokeWidth={2} />
      </RailItem>

      <RailItem href="/friends" active={pathname === '/friends'} label="Friends">
        <Users size={19} strokeWidth={2} />
      </RailItem>

      <div className="my-2 h-px w-8 bg-[var(--color-hairline)]" role="separator" />

      <div className="flex w-full flex-1 flex-col items-center gap-1 overflow-y-auto [scrollbar-width:none]">
        {spaces.map((space) => {
          const active = pathname.startsWith(`/spaces/${space.id}`);
          return (
            <RailItem key={space.id} href={`/spaces/${space.id}`} active={active} label={space.name}>
              <span
                className="flex h-full w-full items-center justify-center rounded-2xl text-[13px] font-bold text-black presence-fill"
                style={{ ['--p-a' as string]: space.accent_color_top, ['--p-b' as string]: space.accent_color_bottom }}
                title={space.name}
              >
                {initials(space.name)}
              </span>
            </RailItem>
          );
        })}
      </div>

      <button
        onClick={handleAddSpace}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-dashed border-[var(--color-hairline-strong)] text-[var(--color-ink-muted)] transition-colors hover:border-[var(--presence-default-a)] hover:text-[var(--color-ink)]"
        aria-label="Create or join a space"
        title="Add a space"
      >
        <Plus size={18} />
      </button>

      {/* Logout moved into Settings (with a confirmation step) — this is
          now a plain presence-ring avatar link into Settings, not an
          instant sign-out button. */}
      <Link
        href="/settings"
        className="mt-3 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-black presence-fill presence-ring"
        style={
          profile
            ? { ['--p-a' as string]: profile.accent_color_top, ['--p-b' as string]: profile.accent_color_bottom }
            : undefined
        }
        title="Settings"
        aria-label="Settings"
      >
        {profile ? initials(profile.display_name) : '··'}
      </Link>
    </nav>
  );
}
