import { Link, useNavigate } from '@tanstack/react-router';
import { Home, MessageCircle, Camera, Plus } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useAppStore } from '../../store/useAppStore';
import { listMyServers, createServer } from '../../lib/api/servers';
import { supabase } from '../../lib/supabase';

function initials(name: string) {
  return name.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}

export function GlobalNav() {
  const navigate = useNavigate();
  const profile = useAppStore((s) => s.profile);
  const unreadChannels = useAppStore((s) => s.totalUnreadChannels());

  const { data: servers = [] } = useQuery({
    queryKey: ['servers'],
    queryFn: listMyServers,
    enabled: !!profile,
  });

  async function handleAddServer() {
    const name = window.prompt('Create a server: type a name.');
    if (!name) return;
    const server = await createServer(name);
    navigate({ to: '/channels/$guildId', params: { guildId: server.id } });
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate({ to: '/login' });
  }

  return (
    <nav className="flex w-[72px] shrink-0 flex-col items-center gap-2 border-r border-white/[0.07] bg-black py-4">
      <Link
        to="/home"
        className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full bg-neutral-900 text-neutral-400 transition-all hover:rounded-[30%] hover:bg-neutral-800 hover:text-white [&.active]:rounded-[30%] [&.active]:bg-neutral-700 [&.active]:text-white"
        aria-label="Home feed"
      >
        <Home size={20} />
      </Link>

      <Link
        to="/channels/@me"
        className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full bg-neutral-900 text-neutral-400 transition-all hover:rounded-[30%] hover:bg-neutral-800 hover:text-white [&.active]:rounded-[30%] [&.active]:bg-neutral-700 [&.active]:text-white relative"
        aria-label="Direct messages"
      >
        <MessageCircle size={20} />
        {unreadChannels > 0 && (
          <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-gradient-to-br from-indigo-400 to-pink-400 px-1 text-[10px] font-bold text-black">
            {unreadChannels > 9 ? '9+' : unreadChannels}
          </span>
        )}
      </Link>

      <Link
        to="/stories"
        className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full bg-neutral-900 text-neutral-400 transition-all hover:rounded-[30%] hover:bg-neutral-800 hover:text-white [&.active]:rounded-[30%] [&.active]:bg-neutral-700 [&.active]:text-white"
        aria-label="Stories"
      >
        <Camera size={20} />
      </Link>

      <div className="my-1 h-px w-7 bg-white/[0.07]" role="separator" />

      <div className="flex flex-1 flex-col items-center gap-2 overflow-y-auto [scrollbar-width:none]">
        {servers.map((server) => (
          <Link
            key={server.id}
            to="/channels/$guildId"
            params={{ guildId: server.id }}
            className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full text-sm font-semibold text-black transition-all hover:rounded-[30%] [&.active]:rounded-[30%]"
            style={{ background: `linear-gradient(150deg, ${server.accent_color_top}, ${server.accent_color_bottom})` }}
            aria-label={server.name}
            title={server.name}
          >
            {initials(server.name)}
          </Link>
        ))}
      </div>

      <button
        onClick={handleAddServer}
        className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full bg-neutral-900 text-emerald-400 transition-all hover:rounded-[30%] hover:bg-emerald-400 hover:text-black"
        aria-label="Create or join a server"
        title="Add a server"
      >
        <Plus size={20} />
      </button>

      <button
        onClick={handleLogout}
        className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-black"
        style={{
          background: profile
            ? `linear-gradient(150deg, ${profile.accent_color_top}, ${profile.accent_color_bottom})`
            : '#5865F2',
        }}
        title="Log out"
        aria-label="Log out"
      >
        {profile ? initials(profile.display_name) : '?'}
      </button>
    </nav>
  );
}
