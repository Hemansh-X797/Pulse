import { useParams } from '@tanstack/react-router';
import { ChatView } from '../components/chat/ChatView';

export function DmHome() {
  return (
    <div className="flex h-full flex-col items-center justify-center text-neutral-500">
      <p className="text-sm">Select a conversation, or visit a friend's profile to start one.</p>
    </div>
  );
}

export function DmChannel() {
  const { channelId } = useParams({ from: '/_app/channels/@me/$channelId' });
  return <ChatView channelId={channelId} channelLabel="direct message" />;
}
