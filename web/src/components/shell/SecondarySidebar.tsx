'use client';

import Link from 'next/link';
import { usePathname, useParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Hash, Volume2, Plus, Bell, Users, ChevronUp, ChevronDown, Settings2 } from 'lucide-react';
import { useState } from 'react';
import {
  listSpaceTopics,
  createSpaceTopic,
  reorderSpaceTopic,
  listSpaceCategories,
  hasSpacePermission,
} from '../../lib/api/spaces';
import { listMyDMs } from '../../lib/api/channels';
import { useAppStore } from '../../store/useAppStore';
import { NotificationsPanel } from './NotificationsPanel';
import { StatusDot } from '../StatusDot';
import { CreateChannelModal } from './CreateChannelModal';
import { SpaceSettingsModal } from './SpaceSettingsModal';

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
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const { data: topics = [] } = useQuery({
    queryKey: ['space-topics', spaceId],
    queryFn: () => listSpaceTopics(spaceId!),
    enabled: !!spaceId,
  });
  const { data: categories = [] } = useQuery({
    queryKey: ['space-categories', spaceId],
    queryFn: () => listSpaceCategories(spaceId!),
    enabled: !!spaceId,
  });
  const { data: canManageChannels = false } = useQuery({
    queryKey: ['space-permission', spaceId, 'manage_channels'],
    queryFn: () => hasSpacePermission(spaceId!, 'manage_channels'),
    enabled: !!spaceId,
  });

  async function handleCreateTopic(opts: { name: string; kind: 'text' | 'voice'; categoryId: string | null }) {
    if (!spaceId) return;
    await createSpaceTopic(spaceId, opts.name, opts.categoryId);
    queryClient.invalidateQueries({ queryKey: ['space-topics', spaceId] });
    setCreateOpen(false);
  }

  async function handleMove(topicId: string, direction: -1 | 1, siblings: typeof topics) {
    const idx = siblings.findIndex((t) => t.id === topicId);
    const swapWith = siblings[idx + direction];
    if (!swapWith) return;
    await Promise.all([
      reorderSpaceTopic(topicId, swapWith.position),
      reorderSpaceTopic(swapWith.id, siblings[idx].position),
    ]);
    queryClient.invalidateQueries({ queryKey: ['space-topics', spaceId] });
  }

  // Group topics by category — uncategorized ones render first,
  // matching how Discord itself orders the "no category" bucket.
  const uncategorized = topics.filter((t) => !t.category_id);
  const grouped = categories.map((cat) => ({ category: cat, items: topics.filter((t) => t.category_id === cat.id) }));

  function TopicRow({ topic, siblings }: { topic: (typeof topics)[number]; siblings: typeof topics }) {
    const href = `/spaces/${spaceId}/${topic.id}`;
    const active = pathname === href;
    const unread = unreadByChannel[topic.id] ?? 0;
    return (
      <div key={topic.id} className="group/topic relative flex items-center">
        <Link
          href={href}
          className={`flex flex-1 items-center gap-2 rounded-xl px-3 py-2.5 text-[13.5px] font-medium transition-colors ${
            active
              ? 'bg-[var(--color-surface-raised)] text-[var(--color-ink)]'
              : 'text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-raised)]/60 hover:text-[var(--color-ink)]'
          }`}
        >
          {topic.kind === 'voice' ? (
            <Volume2 size={14} className="text-[var(--color-ink-faint)]" />
          ) : (
            <Hash size={14} className="text-[var(--color-ink-faint)]" />
          )}
          {/* No literal "#" character before the name on purpose — an
              intentional visual departure from Discord's look, not an
              oversight (the small icon above still conveys "text
              channel" without the character itself). */}
          <span className={unread > 0 && !active ? 'font-semibold text-[var(--color-ink)]' : ''}>{topic.name}</span>
          {unread > 0 && (
            <span className="ml-auto flex h-[18px] min-w-[18px] items-center justify-center rounded-full presence-fill px-1 font-mono text-[10px] font-bold text-black">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </Link>
        {canManageChannels && (
          <div className="absolute right-1 flex flex-col opacity-0 transition-opacity group-hover/topic:opacity-100">
            <button
              onClick={() => handleMove(topic.id, -1, siblings)}
              className="flex h-4 w-5 items-center justify-center text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]"
              aria-label="Move up"
            >
              <ChevronUp size={12} />
            </button>
            <button
              onClick={() => handleMove(topic.id, 1, siblings)}
              className="flex h-4 w-5 items-center justify-center text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]"
              aria-label="Move down"
            >
              <ChevronDown size={12} />
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex w-full shrink-0 flex-col border-r border-[var(--color-hairline)] bg-[var(--color-surface)] md:w-[260px]">
      <div className="flex h-[62px] shrink-0 items-center justify-between border-b border-[var(--color-hairline)] px-4">
        <span className="font-serif text-[15px] font-semibold">Space</span>
        <button
          onClick={() => setSettingsOpen(true)}
          className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-ink)]"
          aria-label="Space settings"
          title="Space settings"
        >
          <Settings2 size={15} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-3.5 py-2">
        {uncategorized.length > 0 && (
          <div className="mb-2">
            {uncategorized.map((t) => (
              <TopicRow key={t.id} topic={t} siblings={uncategorized} />
            ))}
          </div>
        )}

        {grouped.map(({ category, items }) => (
          <div key={category.id} className="mb-2">
            <div className="px-2.5 pb-1 pt-2 font-mono text-[10px] font-medium uppercase tracking-wider text-[var(--color-ink-faint)]">
              {category.name}
            </div>
            {items.map((t) => (
              <TopicRow key={t.id} topic={t} siblings={items} />
            ))}
          </div>
        ))}

        {canManageChannels && (
          <button
            onClick={() => setCreateOpen(true)}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-[13.5px] text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]"
          >
            <Plus size={14} /> Add channel
          </button>
        )}
      </div>

      {createOpen && spaceId && (
        <CreateChannelModal categories={categories} onClose={() => setCreateOpen(false)} onCreate={handleCreateTopic} />
      )}
      {settingsOpen && spaceId && <SpaceSettingsModal spaceId={spaceId} onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}

function DmList() {
  const pathname = usePathname() ?? '';
  const unreadByChannel = useAppStore((s) => s.unreadByChannel);
  const { data: dms = [], isLoading } = useQuery({ queryKey: ['my-dms'], queryFn: listMyDMs });

  return (
    <div className="flex w-full shrink-0 flex-col border-r border-[var(--color-hairline)] bg-[var(--color-surface)] md:w-[260px]">
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
              <div className="relative shrink-0">
                {dm.other_user.avatar_url ? (
                  <img src={dm.other_user.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover" />
                ) : (
                  <div
                    style={{ ['--p-a' as string]: dm.other_user.accent_color_top, ['--p-b' as string]: dm.other_user.accent_color_bottom }}
                    className="flex h-8 w-8 items-center justify-center rounded-full presence-fill text-[11px] font-bold text-black"
                  >
                    {dm.other_user.display_name.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <span className="absolute -bottom-0.5 -right-0.5">
                  <StatusDot userId={dm.other_user.id} size={10} />
                </span>
              </div>
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
    <div className="flex w-full shrink-0 flex-col border-r border-[var(--color-hairline)] bg-[var(--color-surface)] md:w-[260px]">
      <SidebarHeader title="PalSpace" />
      <div className="px-3.5">
        <div className="px-2.5 pb-2 pt-3 font-mono text-[10px] font-medium uppercase tracking-wider text-[var(--color-ink-faint)]">Feed</div>
        <div className="rounded-xl bg-[var(--color-surface-raised)] px-3 py-2.5 text-[13.5px] font-medium text-[var(--color-ink)]">For You</div>
      </div>
    </div>
  );
}
