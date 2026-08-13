import { Link, useLocation, useParams } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { Hash, Plus, Bell } from 'lucide-react';
import { useState } from 'react';
import { listServerChannels, createServerChannel } from '../../lib/api/servers';
import { useAppStore } from '../../store/useAppStore';
import { NotificationsPanel } from './NotificationsPanel';

export function SecondarySidebar() {
  const location = useLocation();
  const isServerContext = location.pathname.startsWith('/channels/') && !location.pathname.startsWith('/channels/@me');
  const isDmContext = location.pathname.startsWith('/channels/@me');
  const isFeedContext = location.pathname === '/home';

  if (isServerContext) return <ServerChannelList />;
  if (isDmContext) return <DmList />;
  if (isFeedContext) return <FeedFilters />;
  return null;
}

function SidebarHeader({ title }: { title: string }) {
  const [notifOpen, setNotifOpen] = useState(false);
  return (
    <div className="relative flex items-center gap-2 px-[22px] pb-5 pt-[22px]">
      <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-gradient-to-br from-indigo-400 to-pink-400" />
      <span className="truncate font-serif text-lg font-semibold">{title}</span>
      <button
        onClick={() => setNotifOpen((v) => !v)}
        className="relative ml-auto flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.07] bg-neutral-900 text-neutral-400 hover:bg-neutral-800 hover:text-white"
        aria-label="Notifications"
        aria-haspopup="true"
        aria-expanded={notifOpen}
      >
        <Bell size={17} />
        <NotifDot />
      </button>
      {notifOpen && <NotificationsPanel onClose={() => setNotifOpen(false)} />}
    </div>
  );
}

function NotifDot() {
  const unread = useAppStore((s) => s.unreadNotifications);
  if (unread === 0) return null;
  return <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full border-2 border-neutral-950 bg-pink-400" />;
}

function ServerChannelList() {
  const { guildId } = useParams({ strict: false });
  const { data: channels = [] } = useQuery({
    queryKey: ['server-channels', guildId],
    queryFn: () => listServerChannels(guildId!),
    enabled: !!guildId,
  });

  async function handleAddChannel() {
    const name = window.prompt('Channel name:');
    if (!name || !guildId) return;
    await createServerChannel(guildId, name);
  }

  return (
    <div className="flex w-[252px] shrink-0 flex-col border-r border-white/[0.07] bg-neutral-950">
      <SidebarHeader title="Server" />
      <div className="px-3.5">
        <div className="px-2.5 pb-2 pt-3 text-[10px] font-medium uppercase tracking-wider text-neutral-500">
          Text Channels
        </div>
        {channels.map((c) => (
          <Link
            key={c.id}
            to="/channels/$guildId/$channelId"
            params={{ guildId: guildId!, channelId: c.id }}
            className="flex items-center gap-2 rounded-md px-3 py-2.5 text-[13.5px] font-medium text-neutral-400 hover:bg-neutral-900 hover:text-white [&.active]:bg-neutral-800 [&.active]:text-white"
          >
            <Hash size={14} className="text-neutral-500" /> {c.name}
          </Link>
        ))}
        <button
          onClick={handleAddChannel}
          className="flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-[13.5px] text-neutral-500 hover:text-white"
        >
          <Plus size={14} /> Add channel
        </button>
      </div>
    </div>
  );
}

function DmList() {
  return (
    <div className="flex w-[252px] shrink-0 flex-col border-r border-white/[0.07] bg-neutral-950">
      <SidebarHeader title="Pulse" />
      <div className="px-3.5">
        <div className="px-2.5 pb-2 pt-3 text-[10px] font-medium uppercase tracking-wider text-neutral-500">
          Direct Messages
        </div>
        <p className="px-2.5 text-[12.5px] text-neutral-500">
          Message a friend from their profile (<code className="text-neutral-400">/username</code>) to start a DM.
        </p>
      </div>
    </div>
  );
}

function FeedFilters() {
  return (
    <div className="flex w-[252px] shrink-0 flex-col border-r border-white/[0.07] bg-neutral-950">
      <SidebarHeader title="Pulse" />
      <div className="px-3.5">
        <div className="px-2.5 pb-2 pt-3 text-[10px] font-medium uppercase tracking-wider text-neutral-500">Feed</div>
        <div className="rounded-md bg-neutral-800 px-3 py-2.5 text-[13.5px] font-medium text-white">For You</div>
      </div>
    </div>
  );
}
