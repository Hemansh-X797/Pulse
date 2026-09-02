'use client';

import { useEffect, useRef } from 'react';
import { Copy, Link2, EyeOff, Forward, Pin, PinOff, Reply, Pencil, Trash2, SmilePlus } from 'lucide-react';

export interface MessageMenuAction {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}

export function MessageContextMenu({
  onClose,
  onCopyText,
  onCopyLink,
  onMarkUnread,
  onForward,
  onPin,
  isPinned,
  onReact,
  onReply,
  onEdit,
  onDelete,
  isMine,
  variant = 'dropdown',
}: {
  onClose: () => void;
  onCopyText: () => void;
  onCopyLink: () => void;
  onMarkUnread: () => void;
  onForward: () => void;
  onPin: () => void;
  isPinned: boolean;
  onReact: () => void;
  onReply: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  isMine: boolean;
  // 'dropdown' (default): small floating box, used on desktop anchored
  // to the "..." button, closes on outside click. 'sheet': full-width
  // list with larger touch targets, used inside the mobile long-press
  // bottom sheet — that sheet already has its own backdrop-click
  // handler, so this variant skips the extra outside-click listener
  // (which uses `mousedown`, unreliable right after a touch-driven open
  // on some mobile browsers, and would be redundant anyway).
  variant?: 'dropdown' | 'sheet';
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (variant === 'sheet') return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose, variant]);

  const items: MessageMenuAction[] = [
    { icon: <SmilePlus size={14} />, label: 'Add reaction', onClick: onReact },
    { icon: <Reply size={14} />, label: 'Reply', onClick: onReply },
    { icon: <Copy size={14} />, label: 'Copy text', onClick: onCopyText },
    { icon: <Link2 size={14} />, label: 'Copy link', onClick: onCopyLink },
    isPinned
      ? { icon: <PinOff size={14} />, label: 'Unpin', onClick: onPin }
      : { icon: <Pin size={14} />, label: 'Pin message', onClick: onPin },
    { icon: <Forward size={14} />, label: 'Forward', onClick: onForward },
    { icon: <EyeOff size={14} />, label: 'Mark unread', onClick: onMarkUnread },
    ...(isMine && onEdit ? [{ icon: <Pencil size={14} />, label: 'Edit', onClick: onEdit }] : []),
    ...(isMine && onDelete ? [{ icon: <Trash2 size={14} />, label: 'Delete', onClick: onDelete, destructive: true }] : []),
  ];

  if (variant === 'sheet') {
    return (
      <div ref={ref} className="overflow-hidden pb-1.5">
        {items.map((item) => (
          <button
            key={item.label}
            onClick={() => {
              item.onClick();
              onClose();
            }}
            className={`flex w-full items-center gap-3.5 px-5 py-3.5 text-left text-[15px] transition-colors active:bg-[var(--color-surface-raised)] ${
              item.destructive ? 'text-red-400' : 'text-[var(--color-ink)]'
            }`}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className="absolute z-30 w-48 overflow-hidden rounded-xl border border-[var(--color-hairline-strong)] bg-[var(--color-surface-overlay)] py-1 shadow-2xl"
    >
      {items.map((item) => (
        <button
          key={item.label}
          onClick={() => {
            item.onClick();
            onClose();
          }}
          className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] transition-colors hover:bg-[var(--color-surface-raised)] ${
            item.destructive ? 'text-red-400' : 'text-[var(--color-ink)]'
          }`}
        >
          {item.icon}
          {item.label}
        </button>
      ))}
    </div>
  );
}
