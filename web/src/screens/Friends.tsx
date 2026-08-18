'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { UserPlus, Check, X, Search, MessageCircle } from 'lucide-react';
import {
  listFriends,
  listIncomingRequests,
  listOutgoingRequests,
  searchUsers,
  sendFriendRequest,
  cancelFriendRequest,
  respondToFriendRequest,
  type FriendProfile,
} from '../lib/api/friends';
import { createOrGetDM } from '../lib/api/channels';

type Tab = 'all' | 'pending' | 'add';

function Avatar({ profile, size = 34 }: { profile: FriendProfile; size?: number }) {
  if (profile.avatar_url) {
    return <img src={profile.avatar_url} alt="" style={{ width: size, height: size }} className="shrink-0 rounded-full object-cover" />;
  }
  return (
    <div
      style={{
        width: size,
        height: size,
        fontSize: size * 0.32,
        ['--p-a' as string]: profile.accent_color_top,
        ['--p-b' as string]: profile.accent_color_bottom,
      }}
      className="flex shrink-0 items-center justify-center rounded-full presence-fill font-bold text-black"
    >
      {profile.display_name.slice(0, 2).toUpperCase()}
    </div>
  );
}

export function Friends() {
  const [tab, setTab] = useState<Tab>('all');
  const [query, setQuery] = useState('');
  const [messageError, setMessageError] = useState<string | null>(null);
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: friends = [] } = useQuery({ queryKey: ['friends'], queryFn: listFriends });
  const { data: incoming = [] } = useQuery({ queryKey: ['friend-requests', 'incoming'], queryFn: listIncomingRequests });
  const { data: outgoing = [] } = useQuery({ queryKey: ['friend-requests', 'outgoing'], queryFn: listOutgoingRequests });
  const { data: searchResults = [] } = useQuery({
    queryKey: ['user-search', query],
    queryFn: () => searchUsers(query),
    enabled: tab === 'add' && query.trim().length > 0,
  });

  function invalidateFriendQueries() {
    queryClient.invalidateQueries({ queryKey: ['friends'] });
    queryClient.invalidateQueries({ queryKey: ['friend-requests'] });
  }

  const sendMutation = useMutation({
    mutationFn: sendFriendRequest,
    onSuccess: invalidateFriendQueries,
  });
  const respondMutation = useMutation({
    mutationFn: ({ id, accept }: { id: number; accept: boolean }) => respondToFriendRequest(id, accept),
    onSuccess: invalidateFriendQueries,
  });
  const cancelMutation = useMutation({
    mutationFn: cancelFriendRequest,
    onSuccess: invalidateFriendQueries,
  });

  async function handleMessage(username: string) {
    setMessageError(null);
    try {
      const channelId = await createOrGetDM(username);
      router.push(`/channels/me/${channelId}`);
    } catch (e) {
      setMessageError(e instanceof Error ? e.message : 'Could not start conversation.');
    }
  }

  const pendingCount = incoming.length;

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-[62px] shrink-0 items-center gap-1 border-b border-[var(--color-hairline)] px-7">
        <h2 className="mr-4 font-serif text-lg font-semibold">Friends</h2>
        {(['all', 'pending', 'add'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`relative rounded-lg px-3 py-1.5 text-[13px] font-medium capitalize transition-colors ${
              tab === t ? 'bg-[var(--color-surface-raised)] text-[var(--color-ink)]' : 'text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]'
            }`}
          >
            {t === 'add' ? 'Add Friend' : t}
            {t === 'pending' && pendingCount > 0 && (
              <span className="ml-1.5 rounded-full bg-red-500 px-1.5 py-0.5 font-mono text-[10px] font-bold text-white">{pendingCount}</span>
            )}
          </button>
        ))}
      </div>

      {messageError && (
        <div className="mx-7 mt-4 flex items-center justify-between rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12.5px] text-red-300">
          {messageError}
          <button onClick={() => setMessageError(null)} className="ml-3 text-red-400 hover:text-[var(--color-ink)]" aria-label="Dismiss">
            <X size={13} />
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-7 py-5">
        {tab === 'add' && (
          <div className="mx-auto max-w-lg">
            <div className="relative mb-6">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-ink-faint)]" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by username..."
                className="w-full rounded-full border border-[var(--color-hairline)] bg-[var(--color-surface-raised)] py-2.5 pl-9 pr-4 text-[13.5px] outline-none focus:border-[var(--presence-default-a)]"
              />
            </div>
            {query.trim() && searchResults.length === 0 && (
              <p className="text-[13px] text-[var(--color-ink-muted)]">No users found for &ldquo;{query}&rdquo;.</p>
            )}
            {searchResults.map((u) => {
              const alreadySent = outgoing.some((o) => o.recipient.id === u.id);
              const alreadyFriends = friends.some((f) => f.id === u.id);
              return (
                <div key={u.id} className="flex items-center gap-3 border-b border-[var(--color-hairline)] py-3">
                  <Avatar profile={u} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] font-semibold">{u.display_name}</div>
                    <div className="truncate text-[12px] text-[var(--color-ink-muted)]">@{u.username}</div>
                  </div>
                  {alreadyFriends ? (
                    <span className="text-[12px] text-[var(--color-ink-faint)]">Friends</span>
                  ) : alreadySent ? (
                    <span className="text-[12px] text-[var(--color-ink-faint)]">Requested</span>
                  ) : (
                    <button
                      onClick={() => sendMutation.mutate(u.id)}
                      className="flex items-center gap-1.5 rounded-full bg-[var(--color-ink)] px-3.5 py-1.5 text-[12px] font-semibold text-black"
                    >
                      <UserPlus size={13} /> Add
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {tab === 'pending' && (
          <div className="mx-auto max-w-lg">
            {incoming.length === 0 && outgoing.length === 0 && (
              <p className="text-[13px] text-[var(--color-ink-muted)]">No pending requests.</p>
            )}
            {incoming.length > 0 && (
              <>
                <div className="mb-2 font-mono text-[10px] font-medium uppercase tracking-wider text-[var(--color-ink-faint)]">
                  Incoming — {incoming.length}
                </div>
                {incoming.map((r) => (
                  <div key={r.id} className="flex items-center gap-3 border-b border-[var(--color-hairline)] py-3">
                    <Avatar profile={r.sender} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13.5px] font-semibold">{r.sender.display_name}</div>
                      <div className="truncate text-[12px] text-[var(--color-ink-muted)]">@{r.sender.username}</div>
                    </div>
                    <button
                      onClick={() => respondMutation.mutate({ id: r.id, accept: true })}
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-surface-raised)] text-emerald-400 hover:bg-emerald-400/15"
                      aria-label="Accept"
                    >
                      <Check size={15} />
                    </button>
                    <button
                      onClick={() => respondMutation.mutate({ id: r.id, accept: false })}
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-surface-raised)] text-red-400 hover:bg-red-400/15"
                      aria-label="Decline"
                    >
                      <X size={15} />
                    </button>
                  </div>
                ))}
              </>
            )}
            {outgoing.length > 0 && (
              <>
                <div className="mb-2 mt-6 font-mono text-[10px] font-medium uppercase tracking-wider text-[var(--color-ink-faint)]">
                  Sent — {outgoing.length}
                </div>
                {outgoing.map((r) => (
                  <div key={r.id} className="flex items-center gap-3 border-b border-[var(--color-hairline)] py-3">
                    <Avatar profile={r.recipient} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13.5px] font-semibold">{r.recipient.display_name}</div>
                      <div className="truncate text-[12px] text-[var(--color-ink-muted)]">@{r.recipient.username}</div>
                    </div>
                    <button
                      onClick={() => cancelMutation.mutate(r.id)}
                      className="rounded-full border border-[var(--color-hairline-strong)] px-3 py-1.5 text-[12px] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
                    >
                      Cancel
                    </button>
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {tab === 'all' && (
          <div className="mx-auto max-w-lg">
            <div className="mb-2 font-mono text-[10px] font-medium uppercase tracking-wider text-[var(--color-ink-faint)]">
              All friends — {friends.length}
            </div>
            {friends.length === 0 && (
              <p className="text-[13px] text-[var(--color-ink-muted)]">
                No friends yet — try the <button onClick={() => setTab('add')} className="text-[var(--presence-default-a)] underline">Add Friend</button> tab.
              </p>
            )}
            {friends.map((f) => (
              <div key={f.id} className="flex items-center gap-3 border-b border-[var(--color-hairline)] py-3">
                <Avatar profile={f} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] font-semibold">{f.display_name}</div>
                  <div className="truncate text-[12px] text-[var(--color-ink-muted)]">{f.status_text || `@${f.username}`}</div>
                </div>
                <button
                  onClick={() => router.push(`/${f.username}`)}
                  className="rounded-full border border-[var(--color-hairline-strong)] px-3 py-1.5 text-[12px] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
                >
                  Profile
                </button>
                <button
                  onClick={() => handleMessage(f.username)}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-surface-raised)] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
                  aria-label="Message"
                >
                  <MessageCircle size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
