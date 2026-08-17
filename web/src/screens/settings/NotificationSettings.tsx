'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getNotificationPreferences, updateNotificationPreferences } from '../../lib/api/notification-prefs';

const TOGGLES = [
  { key: 'messages', label: 'Direct messages', hint: 'New messages in your DMs.' },
  { key: 'reactions', label: 'Reactions', hint: 'When someone reacts to your posts.' },
  { key: 'comments', label: 'Comments', hint: 'When someone comments on your posts.' },
  { key: 'friend_requests', label: 'Friend requests', hint: 'Incoming requests and accepted requests.' },
  { key: 'space_invites', label: 'Space invites', hint: 'When you\u2019re invited to a space.' },
] as const;

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      role="switch"
      aria-checked={on}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? 'presence-fill' : 'bg-[var(--color-surface-overlay)]'}`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${on ? 'translate-x-[22px]' : 'translate-x-0.5'}`}
      />
    </button>
  );
}

export function NotificationSettings() {
  const queryClient = useQueryClient();
  const { data: prefs } = useQuery({ queryKey: ['notification-prefs'], queryFn: getNotificationPreferences });

  const mutation = useMutation({
    mutationFn: updateNotificationPreferences,
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: ['notification-prefs'] });
      const previous = queryClient.getQueryData(['notification-prefs']);
      queryClient.setQueryData(['notification-prefs'], (old: typeof prefs) => (old ? { ...old, ...patch } : old));
      return { previous };
    },
    onError: (_err, _patch, context) => {
      if (context?.previous) queryClient.setQueryData(['notification-prefs'], context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['notification-prefs'] }),
  });

  return (
    <div>
      <h1 className="mb-6 font-serif text-2xl font-semibold">Notifications</h1>

      <section className="rounded-xl border border-[var(--color-hairline)] bg-[var(--color-surface)] p-5">
        <h2 className="mb-1 text-sm font-semibold text-[var(--color-ink)]">What you get notified about</h2>
        <p className="mb-4 text-[13px] text-[var(--color-ink-muted)]">
          Turned off here means it never generates a notification — this isn&apos;t just a display filter.
        </p>

        <div className="space-y-1">
          {TOGGLES.map(({ key, label, hint }) => {
            const on = prefs?.[key] ?? true;
            return (
              <div key={key} className="flex items-center justify-between border-b border-[var(--color-hairline)] py-3 last:border-0">
                <div>
                  <div className="text-[13.5px] font-medium">{label}</div>
                  <div className="text-[11.5px] text-[var(--color-ink-faint)]">{hint}</div>
                </div>
                <Toggle on={on} onClick={() => mutation.mutate({ [key]: !on })} />
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
