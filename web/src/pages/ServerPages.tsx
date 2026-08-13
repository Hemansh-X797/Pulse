import { useParams } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { listServerChannels } from '../lib/api/servers';
import { ChatView } from '../components/chat/ChatView';

export function ServerHome() {
  const { guildId } = useParams({ from: '/_app/channels/$guildId' });
  const { data: channels = [] } = useQuery({
    queryKey: ['server-channels', guildId],
    queryFn: () => listServerChannels(guildId),
  });
  const general = channels[0];

  if (!general) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-neutral-500">
        This server doesn't have any channels yet.
      </div>
    );
  }
  return <ChatView channelId={general.id} channelLabel={general.name} />;
}

export function ServerChannel() {
  const { channelId } = useParams({ from: '/_app/channels/$guildId/$channelId' });
  const { guildId } = useParams({ from: '/_app/channels/$guildId/$channelId' });
  const { data: channels = [] } = useQuery({
    queryKey: ['server-channels', guildId],
    queryFn: () => listServerChannels(guildId),
  });
  const channel = channels.find((c) => c.id === channelId);
  return <ChatView channelId={channelId} channelLabel={channel?.name ?? '...'} />;
}
