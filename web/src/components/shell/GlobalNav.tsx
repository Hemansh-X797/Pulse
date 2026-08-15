'use client';

import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { Home, MessageCircle, Camera, Plus } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useAppStore } from '../../store/useAppStore';
import { listMySpaces, createSpace } from '../../lib/api/spaces';

function initials(name: string) {
  return name.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}

// TanStack Router applied an `active` class automatically via its <Link>;
// next/link doesn't, so active state is computed here from usePathname()
// instead. Kept as a plain className string (not [&.active]) since there's
// no class being toggled by the router anymore.
function navClass(active: boolean) {
  return `flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full transition-all hover:rounded-[30%] ${
    active ? 'rounded-[30%] bg-neutral-700 text-white' : 'bg-neutral-900 text-neutral-400 hover:bg-neutral-800 hover:text-white'
  }`;
}

export function GlobalNav() {
  const router = useRouter();
  const pathname = usePathname();
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
    <nav className="flex w-[72px] shrink-0 flex-col items-center gap-2 border-r border-white/[0.07] bg-black py-4">
      <Link href="/home" className={navClass(pathname === '/home')} aria-label="Home feed">
        <Home size={20} />
      </Link>

      <Link
        href="/channels/@me"
        className={`${navClass(pathname.startsWith('/channels/@me'))} relative`}
        aria-label="Direct messages"
      >
        <MessageCircle size={20} />
        {unreadChannels > 0 && (
          <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-gradient-to-br from-indigo-400 to-pink-400 px-1 text-[10px] font-bold text-black">
            {unreadChannels > 9 ? '9+' : unreadChannels}
          </span>
        )}
      </Link>

      <Link href="/stories" className={navClass(pathname === '/stories')} aria-label="Stories">
        <Camera size={20} />
      </Link>

      <div className="my-1 h-px w-7 bg-white/[0.07]" role="separator" />

      <div className="flex flex-1 flex-col items-center gap-2 overflow-y-auto [scrollbar-width:none]">
        {spaces.map((space) => (
          <Link
            key={space.id}
            href={`/spaces/${space.id}`}
            className={navClass(pathname.startsWith(`/spaces/${space.id}`)).replace('bg-neutral-900 ', '').replace('text-neutral-400', '') + ' text-sm font-semibold text-black'}
            style={{ background: `linear-gradient(150deg, ${space.accent_color_top}, ${space.accent_color_bottom})` }}
            aria-label={space.name}
            title={space.name}
          >
            {initials(space.name)}
          </Link>
        ))}
      </div>

      <button
        onClick={handleAddSpace}
        className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full bg-neutral-900 text-emerald-400 transition-all hover:rounded-[30%] hover:bg-emerald-400 hover:text-black"
        aria-label="Create or join a space"
        title="Add a space"
      >
        <Plus size={20} />
      </button>

      {/* Logout moved into Settings (with a confirmation step) — this button
          is now a plain avatar link into Settings, not an instant sign-out. */}
      <Link
        href="/settings"
        className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-black"
        style={{
          background: profile
            ? `linear-gradient(150deg, ${profile.accent_color_top}, ${profile.accent_color_bottom})`
            : '#5865F2',
        }}
        title="Settings"
        aria-label="Settings"
      >
        {profile ? initials(profile.display_name) : '··'}
      </Link>
    </nav>
  );
}
