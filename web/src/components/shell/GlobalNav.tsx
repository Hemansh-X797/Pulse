'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { Home, MessageCircle, Camera, Plus, Compass, Search } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../../store/useAppStore';
import { listMySpaces, createSpace, joinSpaceByInvite } from '../../lib/api/spaces';
import { CreateSpaceModal } from './CreateSpaceModal';
import { SearchModal } from './SearchModal';

function initials(name: string) {
  return name.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}

/**
 * Rail item: a thin gradient indicator (grows on hover/active) plus
 * the icon itself, rather than the square→rounded-square morph most
 * Discord-alike rails use — same "this one's active" job, a shape
 * language that isn't a lift from Discord's own signature interaction.
 *
 * The indicator sits on the left edge for the vertical desktop rail,
 * and rotates to sit on top for the horizontal mobile bottom bar —
 * same visual language, different axis.
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
    <Link href={href} aria-label={label} className="group relative flex flex-1 items-center justify-center py-1 md:w-full md:flex-none">
      <span
        className={`absolute left-1/2 top-0 -translate-x-1/2 rounded-b-full bg-[image:var(--rail-indicator)] transition-all duration-200 md:left-0 md:top-1/2 md:-translate-x-0 md:-translate-y-1/2 md:rounded-r-full md:rounded-b-none ${
          active ? 'h-[3px] w-6 opacity-100 md:h-6 md:w-[3px]' : 'h-[3px] w-4 opacity-0 group-hover:opacity-70 md:h-2 md:w-[3px] md:group-hover:h-4'
        }`}
        style={{ ['--rail-indicator' as string]: 'linear-gradient(var(--presence-default-a), var(--presence-default-b))' }}
      />
      <span
        className={`flex h-10 w-10 items-center justify-center rounded-2xl transition-all duration-150 md:h-11 md:w-11 ${
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
  const [createOpen, setCreateOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: spaces = [] } = useQuery({
    queryKey: ['spaces'],
    queryFn: listMySpaces,
    enabled: !!profile,
  });

  async function handleCreateSpace(opts: { name: string; isPrivate: boolean; tags: string[] }) {
    const space = await createSpace(opts.name, { isPrivate: opts.isPrivate, tags: opts.tags });
    setCreateOpen(false);
    // Immediate, deterministic refresh for your own action — don't wait
    // on the realtime round-trip (useMembershipSync also invalidates
    // this on the incoming space_members INSERT event, which is what
    // covers *other* people adding you to something).
    queryClient.invalidateQueries({ queryKey: ['spaces'] });
    router.push(`/spaces/${space.id}`);
  }

  async function handleJoinSpace(inviteCode: string) {
    const space = await joinSpaceByInvite(inviteCode);
    setCreateOpen(false);
    queryClient.invalidateQueries({ queryKey: ['spaces'] });
    router.push(`/spaces/${space.id}`);
  }

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex h-[58px] w-full items-center justify-around gap-0.5 border-t border-[var(--color-hairline)] bg-[var(--color-void)] px-1 md:static md:z-auto md:h-auto md:w-[76px] md:flex-col md:items-center md:justify-start md:gap-1 md:border-t-0 md:border-r md:px-0 md:py-4">
      <div className="mb-3 hidden h-8 w-8 items-center justify-center md:flex">
        <img src="/logo.svg" alt="PalSpace" className="h-6 w-6" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
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

      {/* Discover (public spaces) — directly below Stories, per your
          explicit placement request. Spaces you're already a member of
          still render below in their own section, same as before; this
          is specifically for finding new public ones. */}
      <RailItem href="/discover" active={pathname === '/discover'} label="Discover spaces">
        <Compass size={19} strokeWidth={2} />
      </RailItem>

      <button
        onClick={() => setSearchOpen(true)}
        aria-label="Search"
        className="group relative flex flex-1 items-center justify-center py-1 md:w-full md:flex-none"
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--color-surface)] text-[var(--color-ink-muted)] transition-all duration-150 group-hover:bg-[var(--color-surface-raised)] group-hover:text-[var(--color-ink)] md:h-11 md:w-11">
          <Search size={19} strokeWidth={2} />
        </span>
      </button>

      {/* Joined-spaces list + create button: desktop-only in the rail.
          On mobile there's no room for a scrollable icon strip in a
          6-item bottom bar (that's also just not how mobile chat apps
          present a server/space list — Discord's own mobile app uses a
          separate swipeable panel, not the tab bar) — reachable instead
          via a "Your spaces" tab on the Discover page. */}
      <div className="hidden md:my-2 md:block md:h-px md:w-8 md:bg-[var(--color-hairline)]" role="separator" />

      <div className="hidden w-full flex-1 flex-col items-center gap-1 overflow-y-auto [scrollbar-width:none] md:flex">
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
        onClick={() => setCreateOpen(true)}
        className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-dashed border-[var(--color-hairline-strong)] text-[var(--color-ink-muted)] transition-colors hover:border-[var(--presence-default-a)] hover:text-[var(--color-ink)] md:flex"
        aria-label="Create a space"
        title="Create a space"
      >
        <Plus size={18} />
      </button>

      {/* Logout moved into Settings (with a confirmation step) — this is
          now a plain presence-ring avatar link into Settings, not an
          instant sign-out button. */}
      <Link
        href="/settings"
        className="flex h-9 w-9 flex-1 items-center justify-center rounded-full text-[11px] font-bold text-black presence-fill presence-ring md:mt-3 md:flex-none"
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

      {createOpen && <CreateSpaceModal onClose={() => setCreateOpen(false)} onCreate={handleCreateSpace} onJoin={handleJoinSpace} />}
      {searchOpen && <SearchModal onClose={() => setSearchOpen(false)} />}
    </nav>
  );
}
