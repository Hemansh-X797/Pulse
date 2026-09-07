'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, UserPlus, LogOut, Check } from 'lucide-react';
import { listChannelMembersForMention, addGroupDmMember, leaveGroupDm } from '../../lib/api/channels';
import { listFriends } from '../../lib/api/friends';

/**
 * addGroupDmMember/leaveGroupDm have existed since group DMs were
 * built (032_group_dm.sql) with no UI ever calling either — this is
 * that UI. Member list + an "Add friend" picker (only shows friends
 * not already in the group) + a Leave action.
 */
export function GroupDmSettingsModal({ channelId, onClose }: { channelId: string; onClose: () => void }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);

  const { data: members = [] } = useQuery({
    queryKey: ['channel-members-for-mention', channelId],
    queryFn: () => listChannelMembersForMention(channelId),
  });
  const { data: friends = [] } = useQuery({ queryKey: ['friends'], queryFn: listFriends });
  const memberIds = new Set(members.map((m) => m.id));
  const addableFriends = friends.filter((f) => !memberIds.has(f.id));

  const addMutation = useMutation({
    mutationFn: (userId: string) => addGroupDmMember(channelId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channel-members-for-mention', channelId] });
      queryClient.invalidateQueries({ queryKey: ['my-dms'] });
    },
  });

  const leaveMutation = useMutation({
    mutationFn: () => leaveGroupDm(channelId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-dms'] });
      onClose();
      router.push('/channels/me');
    },
  });

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[520px] w-full max-w-sm flex-col overflow-hidden rounded-2xl border border-[var(--color-hairline-strong)] bg-[var(--color-surface-overlay)] shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-[var(--color-hairline)] px-4 py-3">
          <span className="text-[14px] font-semibold">Group members</span>
          <button onClick={onClose} className="text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]" aria-label="Close">
            <X size={17} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {members.map((m) => (
            <div key={m.id} className="flex items-center gap-2.5 rounded-xl px-2.5 py-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full presence-fill text-[11px] font-bold text-black">
                {m.avatar_url ? <img src={m.avatar_url} alt="" className="h-full w-full object-cover" /> : m.display_name.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12.5px] font-medium">{m.display_name}</div>
                <div className="truncate text-[11px] text-[var(--color-ink-faint)]">@{m.username}</div>
              </div>
            </div>
          ))}

          {addOpen && (
            <div className="mt-2 border-t border-[var(--color-hairline)] pt-2">
              <div className="mb-1.5 px-2.5 font-mono text-[10px] uppercase tracking-wide text-[var(--color-ink-faint)]">Add a friend</div>
              {addableFriends.length === 0 ? (
                <p className="px-2.5 py-3 text-center text-[12px] text-[var(--color-ink-faint)]">Everyone you're friends with is already here.</p>
              ) : (
                addableFriends.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => addMutation.mutate(f.id)}
                    disabled={addMutation.isPending}
                    className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left hover:bg-[var(--color-surface-raised)]"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full presence-fill text-[11px] font-bold text-black">
                      {f.avatar_url ? <img src={f.avatar_url} alt="" className="h-full w-full object-cover" /> : f.display_name.slice(0, 2).toUpperCase()}
                    </div>
                    <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">{f.display_name}</span>
                    <UserPlus size={14} className="text-[var(--color-ink-faint)]" />
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-[var(--color-hairline)] p-3">
          <button
            onClick={() => setAddOpen((v) => !v)}
            className="flex flex-1 items-center justify-center gap-2 rounded-full bg-[var(--color-surface-raised)] py-2 text-[12.5px] font-semibold hover:bg-[var(--color-hairline-strong)]"
          >
            {addOpen ? <Check size={14} /> : <UserPlus size={14} />}
            {addOpen ? 'Done' : 'Add member'}
          </button>
          <button
            onClick={() => leaveMutation.mutate()}
            disabled={leaveMutation.isPending}
            className="flex items-center gap-2 rounded-full bg-red-500/15 px-4 py-2 text-[12.5px] font-semibold text-red-400 hover:bg-red-500/25"
          >
            <LogOut size={14} />
            Leave
          </button>
        </div>
      </div>
    </div>
  );
}
