'use client';

import { useParams } from 'next/navigation';
import { ChatView } from '../components/chat/ChatView';

export function DmHome() {
  return (
    <div className="flex h-full flex-col items-center justify-center text-[var(--color-ink-muted)]">
      <p className="text-sm">Select a conversation, or visit a friend's profile to start one.</p>
    </div>
  );
}

export function DmChannel() {
  const params = useParams<{ channelId: string }>()!;
  return <ChatView channelId={params.channelId} channelLabel="direct message" />;
}
