'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listBlockedUsers, unblockUser } from '../../lib/api/blocking';

export function PrivacySettings() {
  const queryClient = useQueryClient();
  const { data: blocked = [], isLoading } = useQuery({ queryKey: ['blocked-users'], queryFn: listBlockedUsers });

  const unblockMutation = useMutation({
    mutationFn: unblockUser,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['blocked-users'] }),
  });

  return (
    <div>
      <h1 className="mb-6 font-serif text-2xl font-semibold">Privacy &amp; Safety</h1>

      <section className="rounded-xl border border-[var(--color-hairline)] bg-[var(--color-surface)] p-5">
        <h2 className="mb-1 text-sm font-semibold text-[var(--color-ink)]">Blocked users</h2>
        <p className="mb-4 text-[13px] text-[var(--color-ink-muted)]">
          Blocking someone hides their posts from your feed and stops them messaging or friend-requesting you —
          enforced on both sides.
        </p>

        {!isLoading && blocked.length === 0 && (
          <p className="text-[13px] text-[var(--color-ink-faint)]">You haven&apos;t blocked anyone.</p>
        )}

        <div className="space-y-2">
          {blocked.map((b) => (
            <div key={b.blocked_id} className="flex items-center gap-3 rounded-lg border border-[var(--color-hairline)] bg-[var(--color-surface-raised)] px-3.5 py-2.5">
              {b.profile.avatar_url ? (
                <img src={b.profile.avatar_url} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
              ) : (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-overlay)] text-[11px] font-bold">
                  {b.profile.display_name.slice(0, 2).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium">{b.profile.display_name}</div>
                <div className="truncate text-[11.5px] text-[var(--color-ink-faint)]">@{b.profile.username}</div>
              </div>
              <button
                onClick={() => unblockMutation.mutate(b.blocked_id)}
                className="rounded-full border border-[var(--color-hairline-strong)] px-3 py-1 text-[12px] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
              >
                Unblock
              </button>
            </div>
          ))}
        </div>

        <p className="mt-4 text-[11px] text-[var(--color-ink-faint)]">
          Block someone from their profile page. Blocking doesn&apos;t auto-remove an existing friendship — unfriend separately if you want that too.
        </p>
      </section>
    </div>
  );
}
