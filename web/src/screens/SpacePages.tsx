'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { listSpaceTopics } from '../lib/api/spaces';
import { ChatView } from '../components/chat/ChatView';

export function SpaceHome() {
  const params = useParams<{ spaceId: string }>()!;
  const spaceId = params.spaceId;
  const { data: topics = [] } = useQuery({
    queryKey: ['space-topics', spaceId],
    queryFn: () => listSpaceTopics(spaceId),
  });
  const general = topics[0];

  if (!general) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-[var(--color-ink-muted)]">
        This space doesn't have any topics yet.
      </div>
    );
  }
  return <ChatView channelId={general.id} channelLabel={general.name} />;
}

export function SpaceTopic() {
  const params = useParams<{ spaceId: string; topicId: string }>()!;
  const { spaceId, topicId } = params;
  const { data: topics = [] } = useQuery({
    queryKey: ['space-topics', spaceId],
    queryFn: () => listSpaceTopics(spaceId),
  });
  const topic = topics.find((t) => t.id === topicId);
  return <ChatView channelId={topicId} channelLabel={topic?.name ?? '...'} />;
}
