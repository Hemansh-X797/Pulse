'use client';

import Link from 'next/link';
import { usePathname, useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Hash, Plus, Bell, Users } from 'lucide-react';
import { useState } from 'react';
import { listSpaceTopics, createSpaceTopic } from '../../lib/api/spaces';
import { listMyDMs } from '../../lib/api/channels';
import { useAppStore } from '../../store/useAppStore';
import { NotificationsPanel } from './NotificationsPanel';

export function SecondarySidebar() {
  const pathname = usePathname() ?? '';
  const isSpaceContext = pathname.startsWith('/spaces/');
  const isDmContext = pathname.startsWith('/channels/@me') || pathname.startsWith('/channels/me') || pathname === '/friends';
  const isFeedContext = pathname === '/home';

  if (isSpaceContext) return <SpaceTopicList />;
  if (isDmContext) return <DmList />;
  if (isFeedContext) return <FeedFilters />;
  return null;
}

function SidebarHeader({ title }: { title: string }) {
  const [notifOpen, setNotifOpen] = useState(false);
  const isBrand = title === 'PalSpace';
  return (
    <div className="relative flex items-center gap-2 px-[22px] pb-5 pt-[22px]">
      {isBrand ? (
        <img src="/logo.svg" alt="PalSpace" className="h-7 w-7 shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
      ) : (
        <>
          <span className="h-[7px] w-[7px] shrink-0 rounded-full presence-fill" />
          <span className="truncate font-serif text-lg font-semibold">{title}</span>
        </>
      )}
      <button
        onClick={() => setNotifOpen((v) => !v)}
        className="relative ml-auto flex h-8 w-8 items-center justify-center rounded-full border border-[var(--color-hairline)] bg-[var(--color-surface)] text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-ink)]"
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
  return <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full border-2 border-[var(--color-void)] presence-fill" />;
}

function SpaceTopicList() {
  const params = useParams<{ spaceId: string }>()!;
  const spaceId = params.spaceId;
  const pathname = usePathname() ?? '';
  const unreadByChannel = useAppStore((s) => s.unreadByChannel);
  const { data: topics = [] } = useQuery({
    queryKey: ['space-topics', spaceId],
    queryFn: () => listSpaceTopics(spaceId!),
    enabled: !!spaceId,
  });

  async function handleAddTopic() {
    const name = window.prompt('Topic name:');
    if (!name || !spaceId) return;
    await createSpaceTopic(spaceId, name);
  }

  return (
    <div className="flex w-[260px] shrink-0 flex-col border-r border-[var(--color-hairline)] bg-[var(--color-surface)]">
      <SidebarHeader title="Space" />
      <div className="px-3.5">
        <div className="px-2.5 pb-2 pt-3 font-mono text-[10px] font-medium uppercase tracking-wider text-[var(--color-ink-faint)]">
          Topics
        </div>
        {topics.map((t) => {
          const href = `/spaces/${spaceId}/${t.id}`;
          const active = pathname === href;
          const unread = unreadByChannel[t.id] ?? 0;
          return (
            <Link
              key={t.id}
              href={href}
              className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-[13.5px] font-medium transition-colors ${
                active
                  ? 'bg-[var(--color-surface-raised)] text-[var(--color-ink)]'
                  : 'text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-raised)]/60 hover:text-[var(--color-ink)]'
              }`}
            >
              <Hash size={14} className="text-[var(--color-ink-faint)]" />
              <span className={unread > 0 && !active ? 'font-semibold text-[var(--color-ink)]' : ''}>{t.name}</span>
              {unread > 0 && (
                <span className="ml-auto flex h-[18px] min-w-[18px] items-center justify-center rounded-full presence-fill px-1 font-mono text-[10px] font-bold text-black">
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </Link>
          );
        })}
        <button
          onClick={handleAddTopic}
          className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-[13.5px] text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]"
        >
          <Plus size={14} /> Add topic
        </button>
      </div>
    </div>
  );
}

function DmList() {
  const pathname = usePathname() ?? '';
  const unreadByChannel = useAppStore((s) => s.unreadByChannel);
  const { data: dms = [], isLoading } = useQuery({ queryKey: ['my-dms'], queryFn: listMyDMs });

  return (
    <div className="flex w-[260px] shrink-0 flex-col border-r border-[var(--color-hairline)] bg-[var(--color-surface)]">
      <SidebarHeader title="PalSpace" />
      <div className="flex flex-1 flex-col px-3.5">
        <Link
          href="/friends"
          className={`mb-1 flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13.5px] font-medium transition-colors ${
            pathname === '/friends' ? 'bg-[var(--color-surface-raised)] text-[var(--color-ink)]' : 'text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-raised)]/60 hover:text-[var(--color-ink)]'
          }`}
        >
          <Users size={16} /> Friends
        </Link>

        <div className="px-2.5 pb-2 pt-3 font-mono text-[10px] font-medium uppercase tracking-wider text-[var(--color-ink-faint)]">
          Direct Messages
        </div>

        {!isLoading && dms.length === 0 && (
          <div className="mt-4 flex flex-1 flex-col items-center gap-3 px-2 text-center">
            <img
              src="/illustrations/empty-dms.svg"
              alt=""
              className="h-24 w-24 opacity-80"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
            <p className="text-[12.5px] text-[var(--color-ink-muted)]">
              Add a friend, then message them from their profile or the Friends list.
            </p>
          </div>
        )}

        {dms.map((dm) => {
          const href = `/channels/me/${dm.channel_id}`;
          const active = pathname === href;
          const unread = unreadByChannel[dm.channel_id] ?? 0;
          return (
            <Link
              key={dm.channel_id}
              href={href}
              className={`flex items-center gap-2.5 rounded-xl px-2.5 py-2 transition-colors ${
                active ? 'bg-[var(--color-surface-raised)] text-[var(--color-ink)]' : 'text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-raised)]/60 hover:text-[var(--color-ink)]'
              }`}
            >
              {dm.other_user.avatar_url ? (
                <img src={dm.other_user.avatar_url} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
              ) : (
                <div
                  style={{ ['--p-a' as string]: dm.other_user.accent_color_top, ['--p-b' as string]: dm.other_user.accent_color_bottom }}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full presence-fill text-[11px] font-bold text-black"
                >
                  {dm.other_user.display_name.slice(0, 2).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className={`truncate text-[13px] ${unread > 0 && !active ? 'font-semibold text-[var(--color-ink)]' : 'font-medium'}`}>
                  {dm.other_user.display_name}
                </div>
                <div className="truncate text-[11.5px] text-[var(--color-ink-faint)]">{dm.last_message_preview}</div>
              </div>
              {unread > 0 && (
                <span className="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full presence-fill px-1 font-mono text-[10px] font-bold text-black">
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function FeedFilters() {
  return (
    <div className="flex w-[260px] shrink-0 flex-col border-r border-[var(--color-hairline)] bg-[var(--color-surface)]">
      <SidebarHeader title="PalSpace" />
      <div className="px-3.5">
        <div className="px-2.5 pb-2 pt-3 font-mono text-[10px] font-medium uppercase tracking-wider text-[var(--color-ink-faint)]">Feed</div>
        <div className="rounded-xl bg-[var(--color-surface-raised)] px-3 py-2.5 text-[13.5px] font-medium text-[var(--color-ink)]">For You</div>
      </div>
    </div>
  );
}
