'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ChatView } from '../components/chat/ChatView';
import { listMyDMs } from '../lib/api/channels';

export function DmHome() {
  return (
    <div className="flex h-full flex-col items-center justify-center text-[var(--color-ink-muted)]">
      <p className="text-sm">Select a conversation, or visit a friend's profile to start one.</p>
    </div>
  );
}

export function DmChannel() {
  const params = useParams<{ channelId: string }>()!;
  // Reuses the same ['my-dms'] query the sidebar already populates
  // (react-query dedupes by key, so this is a cache read, not a second
  // network round-trip in the common case) to get a real header label
  // instead of the previous hardcoded "direct message" for every
  // conversation — which was especially confusing for a group DM,
  // where "direct message" doesn't even describe what's happening.
  const { data: dms } = useQuery({ queryKey: ['my-dms'], queryFn: listMyDMs });
  const dm = dms?.find((d) => d.channel_id === params.channelId);
  const label = dm
    ? dm.is_group
      ? dm.group_name || dm.other_users.map((u) => u.display_name).join(', ') || 'Group'
      : (dm.other_users[0]?.display_name ?? 'direct message')
    : 'direct message';
  return <ChatView channelId={params.channelId} channelLabel={label} />;
}
