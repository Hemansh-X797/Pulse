'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCheck, Link2, Settings2, Hash, FolderPlus, Copy } from 'lucide-react';
import { markSpaceAsRead } from '../../lib/api/channels';
import { createSpaceCategory } from '../../lib/api/spaces';

/**
 * Deliberately doesn't include every item from the Discord reference
 * screenshot — Mute Server, per-server Notification Settings, Hide
 * Muted Channels, Privacy Settings, Edit Per-server Profile, and
 * Create Event have no backing functionality in this app yet, and
 * shipping them as menu items that do nothing would be exactly the
 * kind of fake, unenforced UI this project has explicitly avoided
 * everywhere else. Only real, working actions are here.
 */
export function SpaceContextMenu({
  spaceId,
  inviteCode,
  onClose,
  onCreateChannel,
}: {
  spaceId: string;
  inviteCode: string;
  onClose: () => void;
  onCreateChannel: () => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [categoryName, setCategoryName] = useState('');

  const markReadMutation = useMutation({
    mutationFn: () => markSpaceAsRead(spaceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unread-counts'] });
    },
  });

  const createCategoryMutation = useMutation({
    mutationFn: () => createSpaceCategory(spaceId, categoryName.trim() || 'New Category'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['space-categories', spaceId] });
      onClose();
    },
  });

  function copyInvite() {
    const link = `${window.location.origin}/join/${inviteCode}`;
    navigator.clipboard.writeText(link).then(() => {
      setCopiedInvite(true);
      setTimeout(() => onClose(), 700);
    });
  }

  function copyId() {
    navigator.clipboard.writeText(spaceId).then(() => {
      setCopiedId(true);
      setTimeout(() => onClose(), 700);
    });
  }

  return (
    <div
      className="w-56 overflow-hidden rounded-xl border border-[var(--color-hairline-strong)] bg-[var(--color-surface-overlay)] py-1.5 text-[13px] shadow-2xl"
      onClick={(e) => e.stopPropagation()}
    >
      {creatingCategory ? (
        <div className="p-2.5">
          <input
            autoFocus
            value={categoryName}
            onChange={(e) => setCategoryName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && createCategoryMutation.mutate()}
            placeholder="Category name"
            className="mb-2 w-full rounded-lg border border-[var(--color-hairline)] bg-[var(--color-surface-raised)] px-2.5 py-1.5 text-[12.5px] outline-none"
          />
          <button
            onClick={() => createCategoryMutation.mutate()}
            className="w-full rounded-lg bg-[var(--presence-default-a)] py-1.5 text-[12px] font-semibold text-black"
          >
            Create
          </button>
        </div>
      ) : (
        <>
          <button
            onClick={() => {
              markReadMutation.mutate();
              onClose();
            }}
            className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left hover:bg-[var(--color-surface-raised)]"
          >
            <CheckCheck size={14} /> Mark as Read
          </button>

          <button onClick={copyInvite} className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left hover:bg-[var(--color-surface-raised)]">
            <Link2 size={14} /> {copiedInvite ? 'Invite link copied' : 'Invite to Space'}
          </button>

          <div className="my-1 h-px bg-[var(--color-hairline)]" />

          <button
            onClick={() => {
              onCreateChannel();
              onClose();
            }}
            className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left hover:bg-[var(--color-surface-raised)]"
          >
            <Hash size={14} /> Create Channel
          </button>
          <button
            onClick={() => setCreatingCategory(true)}
            className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left hover:bg-[var(--color-surface-raised)]"
          >
            <FolderPlus size={14} /> Create Category
          </button>

          <div className="my-1 h-px bg-[var(--color-hairline)]" />

          <button
            onClick={() => {
              router.push(`/spaces/${spaceId}`);
              onClose();
            }}
            className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left hover:bg-[var(--color-surface-raised)]"
          >
            <Settings2 size={14} /> Server Settings
          </button>

          <button onClick={copyId} className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left hover:bg-[var(--color-surface-raised)]">
            <Copy size={14} /> {copiedId ? 'Server ID copied' : 'Copy Server ID'}
          </button>
        </>
      )}
    </div>
  );
}
