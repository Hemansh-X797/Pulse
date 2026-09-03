'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { listSpaceTopics } from '../lib/api/spaces';
import { ChatView } from '../components/chat/ChatView';
import { VoiceChannelView } from './VoiceChannelView';

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
  return general.kind === 'voice' ? (
    <VoiceChannelView channelId={general.id} channelLabel={general.name} />
  ) : (
    <ChatView channelId={general.id} channelLabel={general.name} />
  );
}

export function SpaceTopic() {
  const params = useParams<{ spaceId: string; topicId: string }>()!;
  const { spaceId, topicId } = params;
  const { data: topics = [] } = useQuery({
    queryKey: ['space-topics', spaceId],
    queryFn: () => listSpaceTopics(spaceId),
  });
  const topic = topics.find((t) => t.id === topicId);
  // Falls back to ChatView while topics are still loading (topic is
  // undefined for a beat on first render) — kind === 'voice' can't be
  // true yet in that state, so this never flashes the voice screen for
  // a text channel or vice versa, just briefly shows a loading label.
  return topic?.kind === 'voice' ? (
    <VoiceChannelView channelId={topicId} channelLabel={topic.name} />
  ) : (
    <ChatView channelId={topicId} channelLabel={topic?.name ?? '...'} />
  );
}
