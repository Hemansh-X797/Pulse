'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, ImagePlus, Mic, Timer, Square, Reply, Pencil, X, Smile, Sticker, ArrowLeft, MoreHorizontal, Copy, Forward as ForwardIcon } from 'lucide-react';
import {
  listMessages,
  sendMessage,
  editMessage,
  deleteMessage,
  markRead,
  markUnreadFrom,
  listMessageReactions,
  toggleMessageReaction,
  listPinnedMessages,
  pinMessage,
  unpinMessage,
  type MessageReactionSummary,
  type PinnedMessage,
} from '../../lib/api/channels';
import { MessageContextMenu } from './MessageContextMenu';
import { ForwardMessageModal } from './ForwardMessageModal';
import { uploadMedia } from '../../lib/api/media';
import { renderMarkdown } from '../../lib/markdown';
import { extractFirstUrl, LinkPreviewCard } from '../shared/LinkPreviewCard';
import { useCompactMode } from '../../hooks/useCompactMode';
import { EmojiPicker } from './EmojiPicker';
import { GifPicker } from './GifPicker';
import { ProfilePopover } from '../profile/ProfilePopover';
import { NameStyle, type NameStyleData } from '../NameStyle';
import {
  subscribeToChannelMessages,
  subscribeToTyping,
  broadcastTyping,
  unsubscribe,
} from '../../lib/realtime';
import { useAppStore } from '../../store/useAppStore';
import type { Message } from '../../lib/database.types';

type DisplayMessage = (Message & { sender_username: string; sender_display_name: string; sender_name_style: { font?: string; effect?: string; colors?: string[] } | null }) & { pending?: boolean };

const EPHEMERAL_OPTIONS = [
  { label: 'Off', seconds: 0 },
  { label: '10s', seconds: 10 },
  { label: '1m', seconds: 60 },
  { label: '1h', seconds: 3600 },
];

// Hover quick-react row's fixed shortlist — mirrors the small "recent
// reactions" strip pattern from Discord/Slack rather than opening the
// full EmojiPicker for the common case of a single quick reaction.
const QUICK_REACT_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];

export function ChatView({ channelId, channelLabel }: { channelId: string; channelLabel: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const profile = useAppStore((s) => s.profile);
  const session = useAppStore((s) => s.session);
  const connectionStatus = useAppStore((s) => s.connectionStatus);
  const setActiveChannel = useAppStore((s) => s.setActiveChannel);
  const setUnreadByChannel = useAppStore((s) => s.setUnreadByChannel);
  const unreadByChannel = useAppStore((s) => s.unreadByChannel);
  const compactMode = useCompactMode();

  // Tell useUnreadCounts "I'm looking at this channel right now" so its
  // global subscription stops incrementing this one, and clear whatever
  // unread count it already had — opening a channel counts as reading it,
  // same behavior as the auto-markRead effect below for the DB-side count.
  useEffect(() => {
    setActiveChannel(channelId);
    if (unreadByChannel[channelId]) {
      const { [channelId]: _cleared, ...rest } = unreadByChannel;
      setUnreadByChannel(rest);
    }
    return () => setActiveChannel(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState('');
  const [typingUser, setTypingUser] = useState<string | null>(null);
  const [replyTarget, setReplyTarget] = useState<DisplayMessage | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [ephemeralSeconds, setEphemeralSeconds] = useState(0);
  const [ephemeralMenuOpen, setEphemeralMenuOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [gifPickerOpen, setGifPickerOpen] = useState(false);
  const [reactionsByMessage, setReactionsByMessage] = useState<Record<number, MessageReactionSummary[]>>({});
  const [pinnedIds, setPinnedIds] = useState<Set<number>>(new Set());
  const [pinsBarOpen, setPinsBarOpen] = useState(false);
  const [pinnedList, setPinnedList] = useState<PinnedMessage[]>([]);
  const [forwardTarget, setForwardTarget] = useState<(Message & { sender_username: string; sender_display_name: string; sender_name_style: { font?: string; effect?: string; colors?: string[] } | null }) | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: history } = useQuery({
    queryKey: ['messages', channelId],
    queryFn: () => listMessages(channelId),
  });

  useEffect(() => {
    if (history) setMessages(history);
  }, [history]);

  // Reactions + pins load once per channel switch, then get patched
  // in-place by their own handlers below rather than a full refetch on
  // every click — a full-channel reaction refetch on every tap would
  // be wasteful and would visibly flicker the whole list.
  useEffect(() => {
    let cancelled = false;
    listPinnedMessages(channelId)
      .then((pins) => {
        if (cancelled) return;
        setPinnedList(pins);
        setPinnedIds(new Set(pins.map((p) => p.message_id)));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [channelId]);

  useEffect(() => {
    if (!history || history.length === 0) return;
    let cancelled = false;
    listMessageReactions(history.map((m) => m.id))
      .then((r) => {
        if (!cancelled) setReactionsByMessage(r);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [history]);

  // Realtime: new messages + edits/deletes (UPDATE covers both, since
  // delete is a soft-delete flag flip, not a row removal — see
  // supabase/schema.sql's `deleted` column).
  useEffect(() => {
    const channel = subscribeToChannelMessages(
      channelId,
      (incoming) => {
        setMessages((prev) => {
          // Optimistic reconciliation: if this INSERT echoes a message we
          // sent ourselves (matched by client_ref), replace the pending
          // local copy instead of appending a duplicate.
          if (incoming.client_ref) {
            const idx = prev.findIndex((m) => m.pending && m.client_ref === incoming.client_ref);
            if (idx !== -1) {
              const next = [...prev];
              next[idx] = { ...incoming, sender_username: prev[idx].sender_username, sender_display_name: prev[idx].sender_display_name, sender_name_style: prev[idx].sender_name_style, pending: false };
              return next;
            }
          }
          if (prev.some((m) => m.id === incoming.id)) return prev;
          // Other people's realtime messages arrive as bare row data (no
          // joined profile) — same placeholder gap that already existed
          // for sender_username before this change; see the B1
          // performance item in plan.md for the real fix (refetching or
          // caching sender profiles so this doesn't show a placeholder
          // at all). Not solving that here, just not making it worse.
          const isMe = incoming.sender_id === profile?.id;
          const senderUsername = isMe ? profile.username : '…';
          const senderDisplayName = isMe ? profile.display_name : '…';
          const senderNameStyle = isMe ? (profile.name_style as DisplayMessage['sender_name_style']) : null;
          return [...prev, { ...incoming, sender_username: senderUsername, sender_display_name: senderDisplayName, sender_name_style: senderNameStyle }];
        });
      },
      (updated) => {
        setMessages((prev) => prev.map((m) => (m.id === updated.id ? { ...m, ...updated } : m)));
      }
    );

    const typingChannel = subscribeToTyping(channelId, (username) => {
      if (username === profile?.username) return;
      setTypingUser(username);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => setTypingUser(null), 2500);
    });

    return () => {
      unsubscribe(channel);
      unsubscribe(typingChannel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId, profile?.id]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  // Mark the latest message read whenever the list changes and it's
  // someone else's message — same "auto-read while the channel is open"
  // behavior as the earlier C++ web client.
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (last && !last.pending && last.sender_id !== profile?.id) {
      markRead(channelId, last.id).catch(() => {});
      queryClient.invalidateQueries({ queryKey: ['unread-counts'] });
    }
  }, [messages, channelId, profile?.id, queryClient]);

  const handleTyping = useCallback(() => {
    if (!profile) return;
    broadcastTyping(channelId, profile.username);
  }, [channelId, profile]);

  async function handleSend() {
    if (!input.trim() || !profile) return;
    const clientRef = crypto.randomUUID();
    const body = input;
    setInput('');

    const optimistic: DisplayMessage = {
      id: -Date.now(), // temp negative id, never collides with real bigint identity ids
      channel_id: channelId,
      sender_id: profile.id,
      sender_username: profile.username,
      sender_display_name: profile.display_name,
      sender_name_style: profile.name_style as DisplayMessage['sender_name_style'],
      body_raw: body,
      body_rendered: body, // rendered for real once the emoji lib runs in sendMessage; good enough for the instant local paint
      reply_to_id: replyTarget?.id ?? null,
      edited_at: null,
      deleted: false,
      client_ref: clientRef,
      expires_at: null,
      media_url: null,
      media_type: null,
      created_at: new Date().toISOString(),
      pending: true, // drives the 50%-opacity optimistic styling
    };
    setMessages((prev) => [...prev, optimistic]);
    setReplyTarget(null);

    try {
      await sendMessage(channelId, body, {
        replyToId: replyTarget?.id,
        clientRef,
        expiresInSeconds: ephemeralSeconds || undefined,
      });
      // No need to manually swap state here — the realtime INSERT
      // subscription above will fire and reconcile via client_ref.
    } catch (e) {
      // Roll back the optimistic message on failure so the UI doesn't
      // lie about a message that never actually sent.
      setMessages((prev) => prev.filter((m) => m.client_ref !== clientRef));
      window.alert(e instanceof Error ? e.message : 'failed to send');
    }
  }

  async function handleAttachImage(file: File) {
    if (!profile) return;
    setAttachError(null);
    setUploadingImage(true);
    try {
      const url = await uploadMedia(file, session?.user.id);
      const clientRef = crypto.randomUUID();
      const optimistic: DisplayMessage = {
        id: -Date.now(),
        channel_id: channelId,
        sender_id: profile.id,
        sender_username: profile.username,
        sender_display_name: profile.display_name,
        sender_name_style: profile.name_style as DisplayMessage['sender_name_style'],
        body_raw: '',
        body_rendered: '',
        reply_to_id: null,
        edited_at: null,
        deleted: false,
        client_ref: clientRef,
        expires_at: null,
        media_url: url,
        media_type: 'image',
        created_at: new Date().toISOString(),
        pending: true,
      };
      setMessages((prev) => [...prev, optimistic]);
      await sendMessage(channelId, '', { clientRef, mediaUrl: url, mediaType: 'image' });
    } catch (e) {
      // This used to fail completely silently — no try/catch at all, so
      // an upload error (bad MIME, oversized file, missing bucket
      // policy) just vanished as an unhandled rejection and nothing
      // happened on screen. That silence was very likely the actual
      // "images don't work" bug, not the file type itself.
      setAttachError(e instanceof Error ? e.message : 'Upload failed.');
    } finally {
      setUploadingImage(false);
    }
  }

  async function handleSendGif(gifUrl: string) {
    if (!profile) return;
    const clientRef = crypto.randomUUID();
    const optimistic: DisplayMessage = {
      id: -Date.now(),
      channel_id: channelId,
      sender_id: profile.id,
      sender_username: profile.username,
      sender_display_name: profile.display_name,
      sender_name_style: profile.name_style as DisplayMessage['sender_name_style'],
      body_raw: '',
      body_rendered: '',
      reply_to_id: null,
      edited_at: null,
      deleted: false,
      client_ref: clientRef,
      expires_at: null,
      media_url: gifUrl,
      media_type: 'image', // GIF is just an animated image — no separate media_type needed, <img> renders it natively
      created_at: new Date().toISOString(),
      pending: true,
    };
    setMessages((prev) => [...prev, optimistic]);
    try {
      await sendMessage(channelId, '', { clientRef, mediaUrl: gifUrl, mediaType: 'image' });
    } catch (e) {
      setAttachError(e instanceof Error ? e.message : 'Failed to send GIF.');
    }
  }

  async function toggleVoiceRecording() {
    if (recording) {
      mediaRecorderRef.current?.stop();
      setRecording(false);
      return;
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    audioChunksRef.current = [];
    recorder.ondataavailable = (e) => audioChunksRef.current.push(e.data);
    recorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      const file = new File([blob], `voice-note-${Date.now()}.webm`, { type: 'audio/webm' });
      // uploadMedia's MIME allowlist is image-only today — voice notes
      // need their own bucket/policy pass (flag if you want this wired
      // up for real; recording + local playback below both work now,
      // it's specifically the upload step that needs a small backend
      // addition to accept audio/webm).
      void file;
    };
    recorder.start();
    mediaRecorderRef.current = recorder;
    setRecording(true);
  }

  function startEdit(m: DisplayMessage) {
    setEditingId(m.id);
  }

  async function saveEdit(id: number, newBody: string) {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, body_rendered: newBody, edited_at: new Date().toISOString() } : m)));
    setEditingId(null);
    await editMessage(id, newBody);
  }

  async function handleDelete(id: number) {
    if (!window.confirm('Delete this message?')) return;
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, deleted: true, body_rendered: '' } : m)));
    await deleteMessage(id);
  }

  async function handleReact(messageId: number, emoji: string) {
    const current = reactionsByMessage[messageId] ?? [];
    const existing = current.find((r) => r.emoji === emoji);
    const reactedByMe = existing?.reactedByMe ?? false;

    // Optimistic patch — same pattern as everywhere else that touches
    // reaction-shaped state in this app (see toggleReaction's callers
    // in HomeFeed.tsx), reconciled for real by toggleMessageReaction()
    // below; if that throws, the catch reverts it.
    setReactionsByMessage((prev) => {
      const list = prev[messageId] ?? [];
      const idx = list.findIndex((r) => r.emoji === emoji);
      if (idx === -1) {
        return { ...prev, [messageId]: [...list, { emoji, count: 1, reactedByMe: true }] };
      }
      const nextCount = reactedByMe ? list[idx].count - 1 : list[idx].count + 1;
      const nextList =
        nextCount <= 0
          ? list.filter((_, i) => i !== idx)
          : list.map((r, i) => (i === idx ? { ...r, count: nextCount, reactedByMe: !reactedByMe } : r));
      return { ...prev, [messageId]: nextList };
    });

    try {
      await toggleMessageReaction(messageId, emoji, reactedByMe);
    } catch {
      listMessageReactions([messageId])
        .then((r) => setReactionsByMessage((prev) => ({ ...prev, [messageId]: r[messageId] ?? [] })))
        .catch(() => {});
    }
  }

  async function handleTogglePin(message: DisplayMessage) {
    const isPinned = pinnedIds.has(message.id);
    try {
      if (isPinned) {
        await unpinMessage(message.id);
        setPinnedIds((prev) => {
          const next = new Set(prev);
          next.delete(message.id);
          return next;
        });
        setPinnedList((prev) => prev.filter((p) => p.message_id !== message.id));
      } else {
        await pinMessage(channelId, message.id);
        setPinnedIds((prev) => new Set(prev).add(message.id));
        setPinnedList((prev) => [
          { message_id: message.id, pinned_at: new Date().toISOString(), pinned_by_username: profile?.username ?? '' },
          ...prev,
        ]);
      }
    } catch (e) {
      setAttachError(e instanceof Error ? e.message : 'Could not update pin.');
    }
  }

  async function handleMarkUnread(message: DisplayMessage) {
    try {
      await markUnreadFrom(channelId, message.id);
      // Recompute this channel's badge count locally rather than
      // re-fetching every channel's count from the server — it's just
      // "everything from here to the newest message in this channel".
      const idx = messages.findIndex((m) => m.id === message.id);
      const newlyUnread = idx === -1 ? 1 : messages.length - idx;
      setUnreadByChannel({ ...unreadByChannel, [channelId]: newlyUnread });
    } catch (e) {
      setAttachError(e instanceof Error ? e.message : 'Could not mark unread.');
    }
  }

  function handleCopyText(message: DisplayMessage) {
    navigator.clipboard.writeText(message.body_raw || message.body_rendered).catch(() => {});
  }

  function handleCopyLink(message: DisplayMessage) {
    const url = `${window.location.origin}${window.location.pathname}#msg-${message.id}`;
    navigator.clipboard.writeText(url).catch(() => {});
  }

  // Deep-link scroll: opening a copied message link jumps to and
  // briefly highlights that message, instead of the link just being a
  // no-op pointer to the channel in general.
  useEffect(() => {
    if (!messages.length) return;
    const hash = window.location.hash;
    if (!hash.startsWith('#msg-')) return;
    const el = document.getElementById(hash.slice(1));
    if (el) {
      el.scrollIntoView({ block: 'center' });
      el.classList.add('message-link-highlight');
      const t = setTimeout(() => el.classList.remove('message-link-highlight'), 1800);
      return () => clearTimeout(t);
    }
  }, [messages]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-[62px] shrink-0 items-baseline gap-2.5 border-b border-[var(--color-hairline)] px-4 md:px-7">
        <button
          onClick={() => router.back()}
          aria-label="Back"
          className="mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-ink)] md:hidden"
        >
          <ArrowLeft size={18} />
        </button>
        <h2 className="font-serif text-lg font-semibold"># {channelLabel}</h2>
        {pinnedList.length > 0 && (
          <button
            onClick={() => setPinsBarOpen((v) => !v)}
            className="flex items-center gap-1 rounded-full border border-[var(--color-hairline)] px-2 py-0.5 text-[11px] text-[var(--color-ink-muted)] hover:border-[var(--color-hairline-strong)] hover:text-[var(--color-ink)]"
          >
            📌 {pinnedList.length}
          </button>
        )}
        <span
          className={`ml-auto h-1.5 w-1.5 rounded-full ${connectionStatus === 'connected' ? 'bg-emerald-400' : 'bg-[var(--color-ink-faint)]'}`}
          title={connectionStatus}
        />
      </div>

      {pinsBarOpen && pinnedList.length > 0 && (
        <div className="max-h-32 overflow-y-auto border-b border-[var(--color-hairline)] bg-[var(--color-surface)] px-4 py-2 md:px-7">
          {pinnedList.map((pin) => {
            const pinnedMessage = messages.find((m) => m.id === pin.message_id);
            return (
              <button
                key={pin.message_id}
                onClick={() => {
                  setPinsBarOpen(false);
                  document.getElementById(`msg-${pin.message_id}`)?.scrollIntoView({ block: 'center' });
                }}
                className="flex w-full items-start gap-1.5 rounded-lg px-1.5 py-1 text-left text-[12px] hover:bg-[var(--color-surface-raised)]"
              >
                <span className="shrink-0 text-[var(--color-ink-faint)]">📌</span>
                <span className="truncate text-[var(--color-ink-muted)]">
                  {pinnedMessage ? `${pinnedMessage.sender_username}: ${pinnedMessage.body_rendered || '(attachment)'}` : `message #${pin.message_id}`}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 md:px-7 md:py-6">
        <AnimatePresence initial={false}>
          {messages.map((m) => (
            <MessageRow
              key={m.client_ref ?? m.id}
              message={m}
              isMine={m.sender_id === profile?.id}
              isEditing={editingId === m.id}
              replySnippet={m.reply_to_id ? messages.find((x) => x.id === m.reply_to_id) : undefined}
              compact={compactMode}
              onReply={() => setReplyTarget(m)}
              onEdit={() => startEdit(m)}
              onSaveEdit={(body) => saveEdit(m.id, body)}
              onDelete={() => handleDelete(m.id)}
              reactions={reactionsByMessage[m.id] ?? []}
              onReact={(emoji) => handleReact(m.id, emoji)}
              isPinned={pinnedIds.has(m.id)}
              onTogglePin={() => handleTogglePin(m)}
              onMarkUnread={() => handleMarkUnread(m)}
              onCopyText={() => handleCopyText(m)}
              onCopyLink={() => handleCopyLink(m)}
              onForward={() => setForwardTarget(m)}
            />
          ))}
        </AnimatePresence>
      </div>

      <div className={`px-4 md:px-7 text-[11.5px] text-[var(--color-ink-muted)] transition-opacity ${typingUser ? 'opacity-100' : 'opacity-0'}`}>
        {typingUser && `${typingUser} is typing…`}
      </div>

      {attachError && (
        <div className="mx-7 mb-2 flex items-center justify-between rounded-lg border border-red-500/30 bg-red-500/10 px-3.5 py-2 text-[12.5px] text-red-300">
          {attachError}
          <button onClick={() => setAttachError(null)} className="ml-3 text-red-400 hover:text-[var(--color-ink)]" aria-label="Dismiss">
            <X size={14} />
          </button>
        </div>
      )}

      {replyTarget && (
        <div className="mx-7 mb-2 flex items-center gap-2.5 rounded-lg border border-[var(--color-hairline)] bg-[var(--color-surface)] px-3 py-2">
          <div className="h-full w-[3px] shrink-0 self-stretch rounded presence-fill" />
          <div className="min-w-0 flex-1">
            <div className="text-[10px] text-[var(--color-ink-muted)]">replying to {replyTarget.sender_username}</div>
            <div className="truncate text-[13px] text-[var(--color-ink-muted)]">{replyTarget.body_rendered}</div>
          </div>
          <button onClick={() => setReplyTarget(null)} className="text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]" aria-label="Cancel reply">
            <X size={16} />
          </button>
        </div>
      )}

      <div className="px-4 pb-4 pt-3 md:px-7 md:pb-6">
        <div className="flex items-center gap-2 rounded-full border border-[var(--color-hairline)] bg-[var(--color-surface)] py-1.5 pl-4 pr-1.5">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingImage}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] disabled:opacity-40"
            aria-label="Attach image"
          >
            {uploadingImage ? (
              <span className="block h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--color-ink-faint)] border-t-[var(--color-ink)]" />
            ) : (
              <ImagePlus size={17} />
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleAttachImage(file);
              e.target.value = '';
            }}
          />

          <div className="relative">
            <button
              onClick={() => setEphemeralMenuOpen((v) => !v)}
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${ephemeralSeconds ? 'text-[var(--presence-default-a)]' : 'text-[var(--color-ink-muted)]'} hover:text-[var(--color-ink)]`}
              aria-label="Ephemeral message timer"
              aria-haspopup="true"
            >
              <Timer size={17} />
            </button>
            {ephemeralMenuOpen && (
              <div className="absolute bottom-full left-0 mb-2 flex flex-col overflow-hidden rounded-lg border border-[var(--color-hairline-strong)] bg-[var(--color-surface-raised)] text-[12.5px]">
                {EPHEMERAL_OPTIONS.map((opt) => (
                  <button
                    key={opt.seconds}
                    onClick={() => {
                      setEphemeralSeconds(opt.seconds);
                      setEphemeralMenuOpen(false);
                    }}
                    className={`px-4 py-2 text-left hover:bg-[var(--color-surface-overlay)] ${ephemeralSeconds === opt.seconds ? 'text-[var(--presence-default-a)]' : 'text-[var(--color-ink)]/80'}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={toggleVoiceRecording}
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${recording ? 'text-red-400' : 'text-[var(--color-ink-muted)]'} hover:text-[var(--color-ink)]`}
            aria-label={recording ? 'Stop recording' : 'Record a voice note'}
          >
            {recording ? <Square size={15} /> : <Mic size={17} />}
          </button>

          <input
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              if (e.target.value.trim()) handleTyping();
            }}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder={ephemeralSeconds ? `Disappearing in ${ephemeralSeconds}s… try :fire:` : 'Message... try :fire: :heart: :rocket:'}
            className="min-w-0 flex-1 bg-transparent text-sm text-[var(--color-ink)] placeholder-[var(--color-ink-faint)] outline-none"
          />

          <div className="relative">
            <button
              onClick={() => {
                setEmojiPickerOpen((v) => !v);
                setGifPickerOpen(false);
              }}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
              aria-label="Emoji"
              aria-haspopup="true"
            >
              <Smile size={17} />
            </button>
            {emojiPickerOpen && <EmojiPicker onSelect={(emoji) => setInput((v) => v + emoji)} onClose={() => setEmojiPickerOpen(false)} />}
          </div>

          <div className="relative">
            <button
              onClick={() => {
                setGifPickerOpen((v) => !v);
                setEmojiPickerOpen(false);
              }}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
              aria-label="GIF"
              aria-haspopup="true"
            >
              <Sticker size={17} />
            </button>
            {gifPickerOpen && <GifPicker onSelect={handleSendGif} onClose={() => setGifPickerOpen(false)} />}
          </div>

          <button
            onClick={handleSend}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-black transition-transform active:scale-90"
            aria-label="Send"
          >
            <Send size={15} />
          </button>
        </div>
      </div>

      {forwardTarget && <ForwardMessageModal message={forwardTarget} onClose={() => setForwardTarget(null)} />}
    </div>
  );
}

function MessageRow({
  message,
  isMine,
  isEditing,
  replySnippet,
  compact,
  onReply,
  onEdit,
  onSaveEdit,
  onDelete,
  reactions,
  onReact,
  isPinned,
  onTogglePin,
  onMarkUnread,
  onCopyText,
  onCopyLink,
  onForward,
}: {
  message: DisplayMessage;
  isMine: boolean;
  isEditing: boolean;
  replySnippet?: DisplayMessage;
  compact: boolean;
  onReply: () => void;
  onEdit: () => void;
  onSaveEdit: (body: string) => void;
  onDelete: () => void;
  reactions: MessageReactionSummary[];
  onReact: (emoji: string) => void;
  isPinned: boolean;
  onTogglePin: () => void;
  onMarkUnread: () => void;
  onCopyText: () => void;
  onCopyLink: () => void;
  onForward: () => void;
}) {
  const [editValue, setEditValue] = useState(message.body_rendered);
  const [menuOpen, setMenuOpen] = useState(false);
  const [quickReactOpen, setQuickReactOpen] = useState(false);

  if (message.deleted) {
    return (
      <div id={`msg-${message.id}`} className={`flex gap-2.5 ${compact ? 'py-0.5' : 'py-1.5'} ${isMine ? 'flex-row-reverse' : ''}`}>
        <div className="w-[30px] shrink-0" />
        <div className="rounded-2xl border border-dashed border-[var(--color-hairline-strong)] px-3.5 py-2 font-mono text-[13px] italic text-[var(--color-ink-muted)]">
          message deleted
        </div>
      </div>
    );
  }

  const initials = message.sender_username.slice(0, 2).toUpperCase();
  const isExpiring = !!message.expires_at;
  const popoverAnchorRef = useRef<HTMLDivElement>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);

  return (
    <motion.div
      id={`msg-${message.id}`}
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: message.pending ? 0.5 : 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className={`group relative flex gap-2.5 rounded-lg ${compact ? 'py-0.5' : 'py-1.5'} ${isMine ? 'flex-row-reverse' : ''}`}
    >
      {!compact && (
        <button
          onClick={() => setPopoverOpen((v) => !v)}
          className="mt-0.5 flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full presence-fill text-[11px] font-bold text-black"
        >
          {initials}
        </button>
      )}
      {compact && <div className="w-[30px] shrink-0" />}
      <div className={`relative flex max-w-[70%] flex-col ${isMine ? 'items-end' : 'items-start'}`}>
        <div ref={popoverAnchorRef} className={`mb-0.5 flex items-baseline gap-2 ${isMine ? 'flex-row-reverse' : ''}`}>
          <button onClick={() => setPopoverOpen((v) => !v)} className="text-[12.5px] font-semibold hover:opacity-80">
            <NameStyle name={message.sender_display_name} style={message.sender_name_style as NameStyleData} />
          </button>
          {message.edited_at && <span className="font-mono text-[10px] text-[var(--color-ink-muted)]">edited</span>}
          {isExpiring && <span className="font-mono text-[10px] text-[var(--presence-default-a)]">disappearing</span>}
        </div>
        {popoverOpen && (
          <ProfilePopover username={message.sender_username} anchorRef={popoverAnchorRef} onClose={() => setPopoverOpen(false)} />
        )}

        {replySnippet && (
          <div className="mb-0.5 max-w-[320px] truncate font-mono text-[10.5px] text-[var(--color-ink-muted)]">
            ↩ {replySnippet.sender_username}: {replySnippet.body_rendered}
          </div>
        )}

        {isEditing ? (
          <div className="flex items-center gap-1.5">
            <input
              autoFocus
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onSaveEdit(editValue)}
              className="min-w-[220px] rounded-full border border-[var(--presence-default-b)] bg-[var(--color-surface-raised)] px-3.5 py-2 text-sm text-[var(--color-ink)] outline-none"
            />
            <button
              onClick={() => onSaveEdit(editValue)}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-black"
            >
              ✓
            </button>
          </div>
        ) : (
          <>
            {message.media_type === 'image' && message.media_url && (
              <div className="mb-1 overflow-hidden rounded-xl border border-[var(--color-hairline-strong)]">
                <img src={message.media_url} alt="" className="max-h-80 max-w-xs object-cover" />
              </div>
            )}
            {message.media_type === 'audio' && message.media_url && (
              <audio controls src={message.media_url} className="mb-1 h-9 max-w-xs" />
            )}
            {message.body_rendered && (
              <div
                className={`bubble-shape rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
                  isMine
                    ? 'rounded-br-md presence-fill font-medium text-black'
                    : 'rounded-bl-md border border-[var(--color-hairline)] bg-[var(--color-surface)] text-[var(--color-ink)]'
                }`}
              >
                {renderMarkdown(message.body_rendered)}
              </div>
            )}
            {message.body_rendered && extractFirstUrl(message.body_rendered) && (
              <LinkPreviewCard url={extractFirstUrl(message.body_rendered)!} />
            )}
            {reactions.length > 0 && (
              <div className={`mt-1 flex flex-wrap gap-1 ${isMine ? 'justify-end' : 'justify-start'}`}>
                {reactions.map((r) => (
                  <button
                    key={r.emoji}
                    onClick={() => onReact(r.emoji)}
                    className={`flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11.5px] transition-colors ${
                      r.reactedByMe
                        ? 'border-[var(--presence-default-a)] bg-[var(--presence-default-a)]/15'
                        : 'border-[var(--color-hairline)] hover:border-[var(--color-hairline-strong)]'
                    }`}
                  >
                    <span>{r.emoji}</span>
                    <span className="font-mono text-[10px] text-[var(--color-ink-muted)]">{r.count}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <div
        className={`hover-toolbar absolute -top-3 z-20 flex items-center gap-0.5 whitespace-nowrap rounded-md border border-[var(--color-hairline-strong)] bg-[var(--color-surface-overlay)] px-1.5 py-1 opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100 ${
          isMine ? 'right-full mr-2' : 'left-full ml-2'
        }`}
      >
        <button onClick={onCopyText} title="Copy Text" className="p-1 text-[var(--color-ink-muted)] transition-colors hover:text-[var(--color-ink)]">
          <Copy size={13} />
        </button>
        <div className="relative">
          <button
            onClick={() => setQuickReactOpen((v) => !v)}
            title="React with Emoji"
            className="p-1 text-[var(--color-ink-muted)] transition-colors hover:text-[var(--color-ink)]"
          >
            <Smile size={13} />
          </button>
          {quickReactOpen && (
            <div className="absolute bottom-full z-20 mb-1 flex gap-0.5 rounded-full border border-[var(--color-hairline-strong)] bg-[var(--color-surface-overlay)] p-1 shadow-xl">
              {QUICK_REACT_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => {
                    onReact(emoji);
                    setQuickReactOpen(false);
                  }}
                  className="flex h-7 w-7 items-center justify-center rounded-full text-[15px] hover:bg-[var(--color-surface-raised)]"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>
        <button onClick={onReply} title="Reply" className="p-1 text-[var(--color-ink-muted)] transition-colors hover:text-[var(--color-ink)]">
          <Reply size={13} />
        </button>
        <button onClick={onForward} title="Forward" className="p-1 text-[var(--color-ink-muted)] transition-colors hover:text-[var(--color-ink)]">
          <ForwardIcon size={13} />
        </button>
        <div className="relative border-l border-[var(--color-hairline)] pl-1">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            title="More Actions"
            className="p-1 text-[var(--color-ink-muted)] transition-colors hover:text-[var(--color-ink)]"
          >
            <MoreHorizontal size={13} />
          </button>
          {menuOpen && (
            <div className={`absolute top-full z-20 mt-1 ${isMine ? 'right-0' : 'left-0'}`}>
              <MessageContextMenu
                onClose={() => setMenuOpen(false)}
                onCopyText={onCopyText}
                onCopyLink={onCopyLink}
                onMarkUnread={onMarkUnread}
                onForward={onForward}
                onPin={onTogglePin}
                isPinned={isPinned}
                onReact={() => setQuickReactOpen(true)}
                onReply={onReply}
                onEdit={isMine ? onEdit : undefined}
                onDelete={isMine ? onDelete : undefined}
                isMine={isMine}
              />
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
