import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { createOrGetDM, type DmSummary } from '../lib/api/channels';

/**
 * Clicking "Message" on someone's profile always did a full network
 * round-trip (createOrGetDM) before navigating anywhere — even for a
 * conversation you already have open, where the channel id was
 * already sitting in the ['my-dms'] cache from the moment the app
 * loaded (see the preload pass in app/(app)/layout.tsx). That's the
 * actual "why doesn't this feel instant" answer for the single most
 * common case: reopening an existing conversation. This checks that
 * cache first and navigates with zero network wait when it finds a
 * match; only a genuinely brand-new conversation still needs to
 * create a channel first.
 */
export function useOpenDm() {
  const router = useRouter();
  const queryClient = useQueryClient();

  return async function openDm(username: string) {
    const cached = queryClient.getQueryData<DmSummary[]>(['my-dms']);
    const existing = cached?.find((dm) => !dm.is_group && dm.other_users.length === 1 && dm.other_users[0].username === username);
    if (existing) {
      router.push(`/channels/me/${existing.channel_id}`);
      return;
    }
    const channelId = await createOrGetDM(username);
    router.push(`/channels/me/${channelId}`);
  };
}
