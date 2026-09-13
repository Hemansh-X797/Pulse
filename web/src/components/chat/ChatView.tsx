'use client';

import { useEffect, useLayoutEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, ImagePlus, Mic, Timer, Square, Reply, Pencil, X, Smile, Sticker, ArrowLeft, MoreHorizontal, Copy, Forward as ForwardIcon, Phone, Search as SearchIcon, Users, Trash2, ArrowDown, AlertCircle } from 'lucide-react';
import {
  listMessages,
  listOlderMessages,
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
  getOtherDmParticipantId,
  getReadReceipt,
  listChannelMembersForMention,
  getChannelInfo,
  listMessagesAround,
  getMessagePreview,
  getChannelStreak,
  type MessageReactionSummary,
  type PinnedMessage,
} from '../../lib/api/channels';
import { EMOJI_MAP } from '../../lib/emoji';
import { getRecentEmojiCodes, recordEmojiUsed } from '../../lib/recentEmoji';
import { MessageContextMenu } from './MessageContextMenu';
import { MessageSearchPanel } from './MessageSearchPanel';
import { GroupDmSettingsModal } from './GroupDmSettingsModal';
import { ForwardMessageModal } from './ForwardMessageModal';
import { uploadMedia } from '../../lib/api/media';
import { renderMarkdown } from '../../lib/markdown';
import { extractFirstUrl, LinkPreviewCard } from '../shared/LinkPreviewCard';
import { useCompactMode } from '../../hooks/useCompactMode';
import { useChatBubbles } from '../../hooks/useChatBubbles';
import dynamic from 'next/dynamic';
import { ProfilePopover } from '../profile/ProfilePopover';
import { useCall } from '../../hooks/useCall';
import { CallBar } from '../CallBar';
import { NameStyle, type NameStyleData } from '../NameStyle';
import { DecoratedAvatar } from '../DecoratedAvatar';
import {
  subscribeToChannelMessages,
  subscribeToTyping,
  broadcastTyping,
  subscribeToTable,
  unsubscribe,
} from '../../lib/realtime';
import { useAppStore } from '../../store/useAppStore';
import type { Message } from '../../lib/database.types';

// EmojiPicker/GifPicker are only ever needed once the person actually
// opens one of the two popover buttons in the composer — code-splitting
// them out of ChatView's own chunk means the message view (the thing
// that has to be fast on every single DM/channel open) doesn't pay to
// parse/execute picker code nobody's asked for yet. Neither renders
// anything server-side anyway (portal-style popovers anchored to a
// button), so ssr: false is safe and skips an unnecessary SSR pass too.
const EmojiPicker = dynamic(() => import('./EmojiPicker').then((m) => m.EmojiPicker), { ssr: false });
const GifPicker = dynamic(() => import('./GifPicker').then((m) => m.GifPicker), { ssr: false });

type DisplayMessage = (Message & { sender_username: string; sender_display_name: string; sender_avatar_url?: string; sender_avatar_decoration?: string | null; sender_name_style: { font?: string; effect?: string; colors?: string[] } | null }) & { pending?: boolean; failed?: boolean };

// How close to the bottom (px) counts as "already at the bottom" for
// deciding whether a new message should auto-scroll the view or just
// pop the "jump to present" affordance instead — mirrors Discord/Slack:
// if you've scrolled up to read history, new messages shouldn't yank
// you back down, they should just be flagged as waiting below.
const STICK_TO_BOTTOM_THRESHOLD = 120;
// How close to the top (px) triggers loading the next page of older
// history — far enough ahead of the actual edge that it finishes
// loading before you hit a visible wall while scrolling fast.
const LOAD_OLDER_THRESHOLD = 200;

function isSameCalendarDay(a: string, b: string): boolean {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

// "Today" / "Yesterday" / "Tuesday, March 4" — same date-separator
// vocabulary Slack/Discord both use, rather than a raw date stamp that
// forces the reader to do their own day-of-week math.
function formatDateSeparator(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  const sameYear = date.getFullYear() === today.getFullYear();
  return date.toLocaleDateString([], sameYear ? { weekday: 'long', month: 'long', day: 'numeric' } : { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

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

// Discord-style formatting for however many people are typing at once
// — "Alex is typing…" / "Alex and Sam are typing…" /
// "Alex, Sam, and 2 others are typing…" — rather than only ever being
// able to name one person regardless of how many are actually typing.
function formatTypingLabel(users: string[]): string {
  if (users.length === 0) return '';
  if (users.length === 1) return `${users[0]} is typing…`;
  if (users.length === 2) return `${users[0]} and ${users[1]} are typing…`;
  if (users.length === 3) return `${users[0]}, ${users[1]}, and ${users[2]} are typing…`;
  return `${users[0]}, ${users[1]}, and ${users.length - 2} others are typing…`;
}

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
  const chatBubbles = useChatBubbles();
  const call = useCall(channelId);

  // Leave any active call when navigating away from this channel
  // entirely (not on every re-render — channelId only, matching
  // markRead's own channelId-scoped effect elsewhere in this file).
  useEffect(() => {
    return () => {
      if (call.status !== 'idle') call.leave();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

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
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionActiveIndex, setMentionActiveIndex] = useState(0);
  // Auto-growing textarea, not the plain single-line <input> this used
  // to be — that meant no real multi-line messages (Shift+Enter had
  // nowhere sensible to put a newline) and no visual growth as you
  // typed more, unlike every other serious chat product. selectionStart
  // works identically on a textarea, so the mention/emoji autocomplete
  // logic below (keyed off it) needed no changes, just a type swap.
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { data: mentionCandidates = [] } = useQuery({
    queryKey: ['channel-members-for-mention', channelId],
    queryFn: () => listChannelMembersForMention(channelId),
    staleTime: 30_000,
  });
  const mentionMatches =
    mentionQuery === null
      ? []
      : mentionCandidates.filter((m) => m.username.toLowerCase().startsWith(mentionQuery.toLowerCase())).slice(0, 6);

  const [emojiQuery, setEmojiQuery] = useState<string | null>(null);
  const [emojiActiveIndex, setEmojiActiveIndex] = useState(0);
  // ":fir" should suggest ":fire:" as you type it — before this, the
  // only way to discover a shortcode's exact spelling was already
  // knowing it (typing the full ":fire:" got auto-expanded on send,
  // but there was zero assistance getting there, unlike the emoji
  // picker button which requires abandoning the keyboard entirely).
  const emojiMatches = useMemo(() => {
    if (emojiQuery === null || emojiQuery.length === 0) return [];
    const q = emojiQuery.toLowerCase();
    const recents = getRecentEmojiCodes();
    const entries = Object.entries(EMOJI_MAP);
    // Discord-style ranking, not just alphabetical-first-match: an
    // exact prefix match ranks above a mid-word substring match (typing
    // ":fir" should put "fire" ahead of "campfire"), and within each of
    // those tiers your own recently-used emoji come first — matches how
    // Discord's own picker/autocomplete behaves, rather than a flat
    // definition-order list.
    return entries
      .filter(([code]) => code.toLowerCase().includes(q))
      .sort(([codeA], [codeB]) => {
        const aPrefix = codeA.toLowerCase().startsWith(q) ? 0 : 1;
        const bPrefix = codeB.toLowerCase().startsWith(q) ? 0 : 1;
        if (aPrefix !== bPrefix) return aPrefix - bPrefix;
        const aRecent = recents.indexOf(codeA);
        const bRecent = recents.indexOf(codeB);
        if (aRecent !== -1 && bRecent !== -1) return aRecent - bRecent;
        if (aRecent !== -1) return -1;
        if (bRecent !== -1) return 1;
        return codeA.localeCompare(codeB);
      })
      .slice(0, 8);
  }, [emojiQuery]);
  // Was a single string + single shared timeout — meant only the most
  // recent typer's indicator could ever show, and it could vanish
  // early if a second person started typing (their timeout would
  // clear/replace the first person's), even though the first person
  // might still be actively typing. Tracked per-username now, each
  // with its own independent expiry, so "Alex and Sam are typing…"
  // actually works in a group DM/space channel — this bug specifically
  // never mattered in a 1:1 DM (only ever one other possible typer),
  // which is presumably why it went unnoticed until group DMs existed.
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
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
  const [searchOpen, setSearchOpen] = useState(false);
  const [groupSettingsOpen, setGroupSettingsOpen] = useState(false);
  const { data: channelInfo } = useQuery({ queryKey: ['channel-info', channelId], queryFn: () => getChannelInfo(channelId) });
  // Streaks only exist for DMs/group DMs (see 038_channel_streaks.sql) —
  // a "streak" across a whole space channel is meaningless, so this
  // simply never fires for one. staleTime keeps it from refetching on
  // every focus/remount; it only changes at most once per day per
  // channel by design, so anything shorter is wasted network chatter.
  const { data: streak } = useQuery({
    queryKey: ['channel-streak', channelId],
    queryFn: () => getChannelStreak(channelId),
    enabled: !!channelInfo && channelInfo.space_id === null,
    staleTime: 5 * 60 * 1000,
  });
  const [pinnedList, setPinnedList] = useState<PinnedMessage[]>([]);
  const [forwardTarget, setForwardTarget] = useState<(Message & { sender_username: string; sender_display_name: string; sender_name_style: { font?: string; effect?: string; colors?: string[] } | null }) | null>(null);
  const [otherLastRead, setOtherLastRead] = useState<number | null>(null);

  // Infinite-scroll-up state — see listOlderMessages in channels.ts.
  // hasMoreOlder starts true and flips false once a page comes back
  // shorter than a full page (or empty), which is the only reliable
  // "that's everything" signal without a separate count query.
  const [hasMoreOlder, setHasMoreOlder] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  // Whether the view should auto-scroll to new messages (true = you're
  // already at/near the bottom) or just surface the floating "jump to
  // present" button instead (false = you scrolled up to read history).
  const [stickToBottom, setStickToBottom] = useState(true);
  const [newBelowCount, setNewBelowCount] = useState(0);
  // First unread message id at the moment this channel was opened —
  // captured once, before the unread badge gets cleared, so the "New
  // messages" divider has a fixed anchor point instead of chasing a
  // count that immediately zeroes out.
  const [unreadDividerId, setUnreadDividerId] = useState<number | null>(null);
  const unreadDividerCapturedRef = useRef(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const typingTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  // Suppresses the scroll-position-based stick/unstick + load-older
  // logic while we're programmatically adjusting scrollTop ourselves
  // (prepending older messages), so that adjustment isn't misread as
  // "the user scrolled".
  const programmaticScrollRef = useRef(false);
  const inputValueRef = useRef('');
  inputValueRef.current = input;

  const { data: history } = useQuery({
    queryKey: ['messages', channelId],
    queryFn: () => listMessages(channelId),
  });

  useEffect(() => {
    if (!history) return;
    setMessages(history);
    setHasMoreOlder(history.length >= 50);
    if (!unreadDividerCapturedRef.current) {
      unreadDividerCapturedRef.current = true;
      const initialUnread = unreadByChannel[channelId] ?? 0;
      if (initialUnread > 0 && initialUnread < history.length) {
        setUnreadDividerId(history[history.length - initialUnread].id);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history]);

  // Reset per-channel scroll/pagination/draft-adjacent state whenever
  // the channel actually changes (not on every history refetch) —
  // otherwise switching DMs could carry over "no more history" or a
  // stale unread-divider position from the previous conversation.
  useEffect(() => {
    setHasMoreOlder(true);
    setStickToBottom(true);
    setNewBelowCount(0);
    setUnreadDividerId(null);
    unreadDividerCapturedRef.current = false;
  }, [channelId]);

  // Per-channel draft persistence — switching channels with unsent text
  // used to just discard it. sessionStorage (not localStorage) since a
  // draft is transient scratch state for this browsing session, not
  // something worth keeping around indefinitely across visits.
  useEffect(() => {
    const saved = sessionStorage.getItem(`palspace-draft:${channelId}`) ?? '';
    setInput(saved);
    return () => {
      const key = `palspace-draft:${channelId}`;
      if (inputValueRef.current.trim()) sessionStorage.setItem(key, inputValueRef.current);
      else sessionStorage.removeItem(key);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  // Loads the next page of older history when the user scrolls near the
  // top, prepending it while holding the visual scroll position steady
  // (otherwise the viewport would jump to wherever the new content
  // pushed it, which reads as the screen "jumping" under your cursor).
  const loadOlderMessages = useCallback(async () => {
    if (loadingOlder || !hasMoreOlder) return;
    const container = scrollRef.current;
    const oldest = messages[0];
    if (!container || !oldest || oldest.id < 0) return; // negative ids are optimistic/pending, nothing older to fetch against yet
    setLoadingOlder(true);
    try {
      const older = await listOlderMessages(channelId, oldest.id);
      if (older.length === 0) {
        setHasMoreOlder(false);
        return;
      }
      const prevScrollHeight = container.scrollHeight;
      const prevScrollTop = container.scrollTop;
      programmaticScrollRef.current = true;
      setMessages((prev) => [...older, ...prev]);
      if (older.length < 50) setHasMoreOlder(false);
      requestAnimationFrame(() => {
        if (container) {
          container.scrollTop = container.scrollHeight - prevScrollHeight + prevScrollTop;
        }
        programmaticScrollRef.current = false;
      });
    } catch {
      // Leave hasMoreOlder as-is — a transient network error shouldn't
      // permanently mark the channel as "fully loaded"; the next scroll
      // near the top just tries again.
    } finally {
      setLoadingOlder(false);
    }
  }, [channelId, hasMoreOlder, loadingOlder, messages]);

  function handleScroll() {
    const container = scrollRef.current;
    if (!container || programmaticScrollRef.current) return;
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    const atBottom = distanceFromBottom < STICK_TO_BOTTOM_THRESHOLD;
    setStickToBottom(atBottom);
    if (atBottom) setNewBelowCount(0);
    if (container.scrollTop < LOAD_OLDER_THRESHOLD) {
      loadOlderMessages();
    }
  }

  // Auto-grow the composer as its content wraps to more lines, capped
  // by max-h in the className below (overflow-y then takes over) —
  // recalculated by resetting to 'auto' first so shrinking back down
  // after deleting text works too, not just growing. useLayoutEffect,
  // not useEffect: measuring/resizing after paint let the textarea
  // render at its old height for one frame on every keystroke before
  // snapping to the new one — a small but very noticeable flicker on a
  // fast desktop browser, since typing fires this constantly. Doing the
  // measurement synchronously before the browser paints removes that
  // frame entirely.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [input]);

  function scrollToPresent() {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    setStickToBottom(true);
    setNewBelowCount(0);
  }

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

  // "Seen" indicator — see getOtherDmParticipantId/getReadReceipt in
  // channels.ts for why this data already existed but nothing surfaced
  // it. Only meaningful for a 1:1 DM (returns null in a space channel,
  // where "seen by" is a many-member concept this isn't trying to be),
  // so this silently no-ops there.
  useEffect(() => {
    let cancelled = false;
    let otherUserId: string | null = null;
    let sub: ReturnType<typeof subscribeToTable> | null = null;

    getOtherDmParticipantId(channelId)
      .then((uid) => {
        if (cancelled || !uid) return;
        otherUserId = uid;
        return getReadReceipt(channelId, uid).then((lastRead) => {
          if (!cancelled) setOtherLastRead(lastRead);
        });
      })
      .then(() => {
        if (cancelled || !otherUserId) return;
        sub = subscribeToTable('read_receipts', `channel_id=eq.${channelId}`, () => {
          if (!otherUserId) return;
          getReadReceipt(channelId, otherUserId).then((lastRead) => {
            if (!cancelled) setOtherLastRead(lastRead);
          });
        });
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      setOtherLastRead(null);
      if (sub) unsubscribe(sub);
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
              next[idx] = { ...incoming, sender_username: prev[idx].sender_username, sender_display_name: prev[idx].sender_display_name, sender_avatar_url: prev[idx].sender_avatar_url, sender_avatar_decoration: prev[idx].sender_avatar_decoration, sender_name_style: prev[idx].sender_name_style, pending: false };
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
          const senderAvatarUrl = isMe ? (profile.avatar_url ?? undefined) : undefined;
          const senderAvatarDecoration = isMe ? (profile.equipped_avatar_decoration ?? null) : null;
          const senderNameStyle = isMe ? (profile.name_style as DisplayMessage['sender_name_style']) : null;
          return [...prev, { ...incoming, sender_username: senderUsername, sender_display_name: senderDisplayName, sender_avatar_url: senderAvatarUrl, sender_avatar_decoration: senderAvatarDecoration, sender_name_style: senderNameStyle }];
        });
        // Someone else's message can be exactly what completes today's
        // streak — refetch so it updates live instead of only after
        // your own next message or a manual reload.
        queryClient.invalidateQueries({ queryKey: ['channel-streak', channelId] });
      },
      (updated) => {
        setMessages((prev) => prev.map((m) => (m.id === updated.id ? { ...m, ...updated } : m)));
      }
    );

    const typingChannel = subscribeToTyping(channelId, (username) => {
      if (username === profile?.username) return;
      const existing = typingTimeoutsRef.current.get(username);
      if (existing) clearTimeout(existing);
      setTypingUsers((prev) => (prev.includes(username) ? prev : [...prev, username]));
      typingTimeoutsRef.current.set(
        username,
        setTimeout(() => {
          setTypingUsers((prev) => prev.filter((u) => u !== username));
          typingTimeoutsRef.current.delete(username);
        }, 2500)
      );
    });

    return () => {
      unsubscribe(channel);
      unsubscribe(typingChannel);
      // Without this, a typing indicator from the channel you just left
      // could keep showing for up to 2.5s after switching to a
      // different one — its timeout was still pending and nothing
      // reset the displayed list on channel change.
      typingTimeoutsRef.current.forEach((t) => clearTimeout(t));
      typingTimeoutsRef.current.clear();
      setTypingUsers([]);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId, profile?.id]);

  const prevMessageCountRef = useRef(0);
  // Mirrors stickToBottom into a ref so the ResizeObserver callback below
  // (which can't re-subscribe on every state change without constantly
  // tearing down and rebuilding the observer) always reads the current
  // value instead of a stale one captured at observer-creation time.
  const stickToBottomRef = useRef(true);
  useEffect(() => {
    stickToBottomRef.current = stickToBottom;
  }, [stickToBottom]);
  // True from the moment a channel is opened until its first scroll-to-
  // bottom actually happens — lets that first scroll snap instantly
  // instead of animating the (often long) initial jump, which is what
  // made opening a conversation look like it "didn't scroll all the way"
  // when a smooth scroll got interrupted or simply hadn't finished yet.
  const isInitialLoadRef = useRef(true);
  useEffect(() => {
    isInitialLoadRef.current = true;
  }, [channelId]);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const grew = messages.length > prevMessageCountRef.current;
    prevMessageCountRef.current = messages.length;
    if (programmaticScrollRef.current) return; // an older-messages prepend is handling its own scroll restoration
    if (stickToBottom) {
      const container = scrollRef.current;
      if (container) {
        if (isInitialLoadRef.current) {
          // Instant, not smooth — a long animated scroll on channel open
          // can visibly get cut short by layout still settling (avatars/
          // images finishing their own layout pass), which read exactly
          // like "doesn't scroll all the way down." The ResizeObserver
          // below keeps this pinned to the true bottom afterward as
          // content continues to load in.
          container.scrollTop = container.scrollHeight;
          if (messages.length > 0) isInitialLoadRef.current = false;
        } else {
          container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
        }
      }
    } else if (grew) {
      // Scrolled up reading history and a new message just landed below
      // — don't yank the view down, just count it for the floating
      // "jump to present" button.
      setNewBelowCount((n) => n + 1);
    }
  }, [messages, stickToBottom]);

  // Keeps the view pinned to the true bottom as content already on
  // screen keeps growing after the initial paint — avatars, avatar
  // decorations, message images, and link-preview cards all load in
  // asynchronously and change the content's real height *after* the
  // scroll-to-bottom above already ran, which is exactly what could
  // leave the view resting short of the actual bottom. Only acts while
  // stickToBottom is true, so it never fights someone who's deliberately
  // scrolled up to read history.
  useEffect(() => {
    const content = contentRef.current;
    const container = scrollRef.current;
    if (!content || !container || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      if (programmaticScrollRef.current || !stickToBottomRef.current) return;
      container.scrollTop = container.scrollHeight;
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, [channelId]);

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

  // Replaces the in-progress "@partial" token (right before the caret)
  // with the chosen username, then refocuses so typing continues
  // seamlessly — this is the actual autocomplete accept step, the
  // dropdown itself is purely a list of clickable/keyboard-navigable
  // suggestions built on top of it.
  function acceptMention(username: string) {
    const el = inputRef.current;
    const caret = el?.selectionStart ?? input.length;
    const before = input.slice(0, caret);
    const after = input.slice(caret);
    const replaced = before.replace(/(?:^|\s)@([a-zA-Z0-9_]{0,32})$/, (whole) => {
      const leadingSpace = whole.startsWith(' ') ? ' ' : '';
      return `${leadingSpace}@${username} `;
    });
    const newValue = replaced + after;
    setInput(newValue);
    setMentionQuery(null);
    requestAnimationFrame(() => {
      el?.focus();
      const newCaret = replaced.length;
      el?.setSelectionRange(newCaret, newCaret);
    });
  }

  // Same mechanic as acceptMention: replace the in-progress ":partial"
  // token with the actual emoji character (not the shortcode text) —
  // picking a suggestion drops the finished emoji straight in, rather
  // than completing the shortcode text and still relying on send-time
  // expansion.
  function acceptEmoji(code: string) {
    recordEmojiUsed(code);
    const el = inputRef.current;
    const caret = el?.selectionStart ?? input.length;
    const before = input.slice(0, caret);
    const after = input.slice(caret);
    const replaced = before.replace(/:([a-zA-Z0-9_+-]*)$/, `${EMOJI_MAP[code]} `);
    const newValue = replaced + after;
    setInput(newValue);
    setEmojiQuery(null);
    requestAnimationFrame(() => {
      el?.focus();
      const newCaret = replaced.length;
      el?.setSelectionRange(newCaret, newCaret);
    });
  }

  async function handleSend() {
    if (!input.trim() || !profile) return;
    const clientRef = crypto.randomUUID();
    const body = input;
    const replyToId = replyTarget?.id;
    setInput('');
    setReplyTarget(null);
    setStickToBottom(true);

    const optimistic: DisplayMessage = {
      id: -Date.now(), // temp negative id, never collides with real bigint identity ids
      channel_id: channelId,
      sender_id: profile.id,
      sender_username: profile.username,
      sender_display_name: profile.display_name,
      sender_avatar_url: profile.avatar_url ?? undefined,
      sender_avatar_decoration: profile.equipped_avatar_decoration ?? null,
      sender_name_style: profile.name_style as DisplayMessage['sender_name_style'],
      body_raw: body,
      body_rendered: body, // rendered for real once the emoji lib runs in sendMessage; good enough for the instant local paint
      reply_to_id: replyToId ?? null,
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

    try {
      await sendMessage(channelId, body, {
        replyToId,
        clientRef,
        expiresInSeconds: ephemeralSeconds || undefined,
      });
      // The streak trigger (038) runs server-side on this insert, so the
      // cached streak value can now be stale — worth a refetch since
      // "today's message just completed the streak" is exactly the
      // moment someone would want to see the count actually move.
      queryClient.invalidateQueries({ queryKey: ['channel-streak', channelId] });
      // No need to manually swap state here — the realtime INSERT
      // subscription above will fire and reconcile via client_ref.
    } catch {
      // Used to just roll the optimistic message back out of existence
      // and alert() — meaning a flaky connection silently ate your
      // message with a single dismissible popup as the only trace.
      // Instead, mark it failed in place so it stays visible with a
      // "failed to send, tap to retry" affordance, same as
      // iMessage/WhatsApp's own failed-send state.
      setMessages((prev) => prev.map((m) => (m.client_ref === clientRef ? { ...m, pending: false, failed: true } : m)));
    }
  }

  // Re-sends a message that previously failed, reusing its existing
  // client_ref so the realtime reconciliation path (see the INSERT
  // subscription above) still matches it up correctly on success.
  async function retrySend(message: DisplayMessage) {
    if (!message.client_ref) return;
    setMessages((prev) => prev.map((m) => (m.client_ref === message.client_ref ? { ...m, pending: true, failed: false } : m)));
    try {
      await sendMessage(channelId, message.body_raw, {
        replyToId: message.reply_to_id ?? undefined,
        clientRef: message.client_ref,
        mediaUrl: message.media_url ?? undefined,
        mediaType: (message.media_type as 'image' | 'audio' | undefined) ?? undefined,
      });
    } catch {
      setMessages((prev) => prev.map((m) => (m.client_ref === message.client_ref ? { ...m, pending: false, failed: true } : m)));
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
        sender_avatar_url: profile.avatar_url ?? undefined,
        sender_avatar_decoration: profile.equipped_avatar_decoration ?? null,
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

  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const dragDepthRef = useRef(0);

  // Safety net: if a drag is released outside the browser window entirely
  // (dragged back out to the desktop, another app, or the OS taskbar),
  // some browsers never fire a matching dragleave/drop on this element —
  // dragDepthRef never returns to 0, and the "Drop image to send" overlay
  // is left stuck visible over the whole chat indefinitely. A window-level
  // dragend always fires when the drag operation itself ends, regardless
  // of where it was released, so it's used here purely to force-reset.
  useEffect(() => {
    function resetDragState() {
      dragDepthRef.current = 0;
      setIsDraggingFile(false);
    }
    window.addEventListener('dragend', resetDragState);
    window.addEventListener('drop', resetDragState);
    return () => {
      window.removeEventListener('dragend', resetDragState);
      window.removeEventListener('drop', resetDragState);
    };
  }, []);

  // Drag-and-drop onto the whole chat pane, not just the attach button —
  // standard in every modern chat app, wasn't wired up at all before.
  // dragDepthRef counts enter/leave pairs because child elements firing
  // their own dragenter/dragleave would otherwise flicker the overlay
  // off every time the pointer crosses a nested element's boundary.
  function handleDragEnter(e: React.DragEvent) {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    dragDepthRef.current += 1;
    setIsDraggingFile(true);
  }
  function handleDragOver(e: React.DragEvent) {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
  }
  function handleDragLeave(e: React.DragEvent) {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDraggingFile(false);
  }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    dragDepthRef.current = 0;
    setIsDraggingFile(false);
    const file = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith('image/'));
    if (file) handleAttachImage(file);
  }

  // Clipboard paste for images — pasting a screenshot straight into the
  // composer, standard everywhere else, wasn't wired up here at all.
  function handleComposerPaste(e: React.ClipboardEvent) {
    const item = Array.from(e.clipboardData.items).find((i) => i.type.startsWith('image/'));
    if (!item) return; // let plain text paste through untouched
    const file = item.getAsFile();
    if (file) {
      e.preventDefault();
      handleAttachImage(file);
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
      sender_avatar_url: profile.avatar_url ?? undefined,
      sender_avatar_decoration: profile.equipped_avatar_decoration ?? null,
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
      const myName = profile?.display_name ?? profile?.username ?? 'You';
      if (idx === -1) {
        return { ...prev, [messageId]: [...list, { emoji, count: 1, reactedByMe: true, reactedByNames: [myName] }] };
      }
      const nextCount = reactedByMe ? list[idx].count - 1 : list[idx].count + 1;
      const nextList =
        nextCount <= 0
          ? list.filter((_, i) => i !== idx)
          : list.map((r, i) =>
              i === idx
                ? {
                    ...r,
                    count: nextCount,
                    reactedByMe: !reactedByMe,
                    reactedByNames: reactedByMe ? r.reactedByNames.filter((n) => n !== myName) : [...r.reactedByNames, myName],
                  }
                : r
            );
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

  // Shared "jump to a specific message" used by search results, and
  // reusable for the pin bar too — handles the case a simple
  // scrollIntoView can't: the target might be older than the 50-most-
  // recent-messages window listMessages() loads, meaning there's
  // nothing in the DOM to scroll to at all yet. Falls back to loading
  // a fresh window centered on that message when it isn't already
  // present.
  function jumpToMessage(messageId: number) {
    const existing = document.getElementById(`msg-${messageId}`);
    if (existing) {
      existing.scrollIntoView({ block: 'center' });
      existing.classList.add('message-link-highlight');
      setTimeout(() => existing.classList.remove('message-link-highlight'), 1800);
      return;
    }
    listMessagesAround(channelId, messageId).then((around) => {
      setMessages(around.map((m) => ({ ...m })));
      requestAnimationFrame(() => {
        const el = document.getElementById(`msg-${messageId}`);
        if (el) {
          el.scrollIntoView({ block: 'center' });
          el.classList.add('message-link-highlight');
          setTimeout(() => el.classList.remove('message-link-highlight'), 1800);
        }
      });
    });
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
    <div
      className="relative flex h-full flex-col"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDraggingFile && (
        <div className="pointer-events-none absolute inset-3 z-40 flex items-center justify-center rounded-2xl border-2 border-dashed border-[var(--presence-default-a)] bg-[var(--color-void)]/70 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-2 text-[var(--color-ink)]">
            <ImagePlus size={28} />
            <span className="text-sm font-medium">Drop image to send</span>
          </div>
        </div>
      )}
      <div className="flex h-[62px] shrink-0 items-baseline gap-2.5 border-b border-[var(--color-hairline)] px-4 md:px-7">
        <button
          onClick={() => router.back()}
          aria-label="Back"
          className="mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-ink)] md:hidden"
        >
          <ArrowLeft size={18} />
        </button>
        <h2 className="font-serif text-lg font-semibold"># {channelLabel}</h2>
        {streak && streak.currentStreak > 0 && (() => {
          // "Completed today" purely by string-comparing UTC dates —
          // matches the server's own (now() at time zone 'utc')::date,
          // so this can't drift out of sync with what actually decides
          // the streak. If today hasn't been completed yet, this is the
          // exact moment the "don't be the one who breaks it" pressure
          // that makes streaks work is supposed to kick in — an
          // identical 🔥 badge regardless of whether today's already
          // secured or not would waste that entirely.
          const completedToday = streak.lastCompletedDate === new Date().toISOString().slice(0, 10);
          return (
            <span
              title={
                completedToday
                  ? streak.longestStreak > streak.currentStreak
                    ? `Longest streak: ${streak.longestStreak} days`
                    : 'Keep it going!'
                  : 'Send a message today to keep the streak alive!'
              }
              className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-bold ${
                completedToday ? 'bg-orange-500/15 text-orange-400' : 'animate-pulse bg-amber-400/20 text-amber-300'
              }`}
            >
              {completedToday ? '🔥' : '⏳'} {streak.currentStreak}
            </span>
          );
        })()}
        {pinnedList.length > 0 && (
          <button
            onClick={() => setPinsBarOpen((v) => !v)}
            className="flex items-center gap-1 rounded-full border border-[var(--color-hairline)] px-2 py-0.5 text-[11px] text-[var(--color-ink-muted)] hover:border-[var(--color-hairline-strong)] hover:text-[var(--color-ink)]"
          >
            📌 {pinnedList.length}
          </button>
        )}
        <button
          onClick={() => setSearchOpen((v) => !v)}
          className={`ml-auto flex h-8 w-8 items-center justify-center rounded-full text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-ink)] ${searchOpen ? 'bg-[var(--color-surface-raised)] text-[var(--color-ink)]' : ''}`}
          aria-label="Search this conversation"
          title="Search this conversation"
        >
          <SearchIcon size={15} />
        </button>
        {channelInfo?.is_group && (
          <button
            onClick={() => setGroupSettingsOpen(true)}
            className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-ink)]"
            aria-label="Group members"
            title="Group members"
          >
            <Users size={15} />
          </button>
        )}
        {call.status === 'idle' && (
          <button
            onClick={call.join}
            className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-ink)]"
            aria-label="Start voice call"
            title="Start voice call"
          >
            <Phone size={16} />
          </button>
        )}
        <span
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${connectionStatus === 'connected' ? 'bg-emerald-400' : 'bg-[var(--color-ink-faint)]'}`}
          title={connectionStatus}
        />
      </div>

      {searchOpen && (
        <MessageSearchPanel
          channelId={channelId}
          onClose={() => setSearchOpen(false)}
          onJumpTo={jumpToMessage}
        />
      )}

      {groupSettingsOpen && <GroupDmSettingsModal channelId={channelId} onClose={() => setGroupSettingsOpen(false)} />}

      <CallBar call={call} label={`Voice — ${channelLabel}`} />

      {pinsBarOpen && pinnedList.length > 0 && (
        <div className="max-h-32 overflow-y-auto border-b border-[var(--color-hairline)] bg-[var(--color-surface)] px-4 py-2 md:px-7">
          {pinnedList.map((pin) => {
            const pinnedMessage = messages.find((m) => m.id === pin.message_id);
            return (
              <button
                key={pin.message_id}
                onClick={() => {
                  setPinsBarOpen(false);
                  jumpToMessage(pin.message_id);
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

      <div className="relative min-h-0 flex-1">
      <div ref={scrollRef} onScroll={handleScroll} className="h-full overflow-x-hidden overflow-y-auto px-4 py-5 md:px-9 md:py-7">
        <div ref={contentRef}>
        {loadingOlder && (
          <div className="mb-3 flex justify-center">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--color-hairline-strong)] border-t-[var(--color-ink-muted)]" />
          </div>
        )}
        {!hasMoreOlder && messages.length > 0 && (
          <div className="mb-4 flex justify-center">
            <span className="font-mono text-[10px] uppercase tracking-wide text-[var(--color-ink-faint)]">
              Beginning of conversation
            </span>
          </div>
        )}
        <AnimatePresence initial={false}>
          {messages.map((m, i) => {
            const prev = messages[i - 1];
            const showDateSeparator = !prev || !isSameCalendarDay(m.created_at, prev.created_at);
            const showUnreadDivider = unreadDividerId !== null && m.id === unreadDividerId;
            // Real message grouping — before this, every single message
            // showed a full avatar + name header no matter what, so
            // anyone sending a few short messages back-to-back (which is
            // extremely normal chat behavior, not an edge case) got their
            // name and picture repeated every single line. Grouped when:
            // same sender, same channel, less than 5 minutes apart
            // (Discord/Slack both use a similar window), and neither
            // message is a reply (a reply always shows its own header
            // since it's referencing something specific, not continuing
            // a run). Deleted messages don't break a run visually since
            // "message deleted" already renders as its own distinct row.
            const isGrouped =
              !!prev &&
              prev.sender_id === m.sender_id &&
              !m.reply_to_id &&
              !prev.reply_to_id &&
              !m.deleted &&
              !prev.deleted &&
              Math.abs(new Date(m.created_at).getTime() - new Date(prev.created_at).getTime()) < 5 * 60 * 1000;
            return (
              <div key={m.client_ref ?? m.id}>
                {showDateSeparator && (
                  <div className="my-4 flex items-center gap-3">
                    <div className="h-px flex-1 bg-[var(--color-hairline)]" />
                    <span className="shrink-0 font-mono text-[10.5px] uppercase tracking-wide text-[var(--color-ink-faint)]">
                      {formatDateSeparator(m.created_at)}
                    </span>
                    <div className="h-px flex-1 bg-[var(--color-hairline)]" />
                  </div>
                )}
                {showUnreadDivider && (
                  // Discord's actual shape for this: a solid line spanning
                  // the *entire* width with a small filled pill sitting on
                  // top of the line at the right edge — not text floating
                  // between two half-width line segments (which was closer
                  // to a plain section divider than an unread marker).
                  <div className="relative my-4 flex items-center">
                    <div className="h-px w-full bg-red-500/70" />
                    <span className="absolute right-0 rounded-full bg-red-500 px-2 py-[1px] font-mono text-[9.5px] font-bold uppercase tracking-wide text-white">
                      New
                    </span>
                  </div>
                )}
                <MessageRow
                  message={m}
                  isMine={m.sender_id === profile?.id}
                  isEditing={editingId === m.id}
                  isGrouped={isGrouped && !showDateSeparator && !showUnreadDivider}
                  knownUsernames={mentionCandidates.map((c) => c.username)}
                  replySnippet={m.reply_to_id ? messages.find((x) => x.id === m.reply_to_id) : undefined}
                  compact={compactMode}
                  bubbles={chatBubbles}
                  onReply={() => setReplyTarget(m)}
                  onEdit={() => startEdit(m)}
                  onSaveEdit={(body) => saveEdit(m.id, body)}
                  onDelete={() => handleDelete(m.id)}
                  onRetry={() => retrySend(m)}
                  reactions={reactionsByMessage[m.id] ?? []}
                  onReact={(emoji) => handleReact(m.id, emoji)}
                  isPinned={pinnedIds.has(m.id)}
                  onTogglePin={() => handleTogglePin(m)}
                  onMarkUnread={() => handleMarkUnread(m)}
                  onCopyText={() => handleCopyText(m)}
                  onCopyLink={() => handleCopyLink(m)}
                  onForward={() => setForwardTarget(m)}
                  onJumpToReply={jumpToMessage}
                />
              </div>
            );
          })}
        </AnimatePresence>

        {(() => {
          const lastMine = [...messages].reverse().find((m) => !m.pending);
          if (!lastMine || lastMine.sender_id !== profile?.id) return null;
          const seen = otherLastRead != null && otherLastRead >= lastMine.id;
          if (!seen) return null;
          return (
            <div className="mt-1 flex justify-end pr-1 font-mono text-[10px] text-[var(--color-ink-muted)]">Seen</div>
          );
        })()}
        </div>
      </div>

      {/* Discord's actual shape for this: a full-width bar docked to the
          bottom edge of the message pane (not a floating pill that has
          to guess a horizontal center), with the count on the left and a
          dedicated "Jump to present" action on the right. Appears once
          you've scrolled up to read history and either new messages have
          landed below, or you're just far enough from the bottom that
          getting back manually would be annoying. */}
      {!stickToBottom && messages.length > 0 && (
        <div className="absolute inset-x-0 bottom-0 z-20 flex items-center justify-between gap-3 border-t border-[var(--color-hairline-strong)] bg-[var(--color-surface-overlay)]/95 px-4 py-2 shadow-[0_-8px_16px_-8px_rgba(0,0,0,0.3)] backdrop-blur-sm md:px-7">
          <span className="text-[12px] font-medium text-[var(--color-ink)]">
            {newBelowCount > 0 ? `${newBelowCount} new message${newBelowCount > 1 ? 's' : ''}` : 'Viewing older messages'}
          </span>
          <button
            onClick={scrollToPresent}
            className="flex items-center gap-1 rounded-full presence-fill px-3 py-1 text-[11.5px] font-semibold text-black transition-transform hover:scale-105"
          >
            Jump to present
            <ArrowDown size={12} />
          </button>
        </div>
      )}
      </div>

      <div className={`flex items-center gap-1.5 px-4 text-[11.5px] text-[var(--color-ink-muted)] transition-opacity md:px-7 ${typingUsers.length > 0 ? 'opacity-100' : 'opacity-0'}`}>
        {typingUsers.length > 0 && (
          <span className="flex items-center gap-[3px]" aria-hidden="true">
            <span className="h-[5px] w-[5px] animate-bounce rounded-full bg-current [animation-delay:-0.3s]" />
            <span className="h-[5px] w-[5px] animate-bounce rounded-full bg-current [animation-delay:-0.15s]" />
            <span className="h-[5px] w-[5px] animate-bounce rounded-full bg-current" />
          </span>
        )}
        {formatTypingLabel(typingUsers)}
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
        <div className="composer-round relative rounded-2xl border border-[var(--color-hairline)] bg-[var(--color-surface)] p-3.5 shadow-sm transition-colors focus-within:border-[var(--color-hairline-strong)]">
          {mentionQuery !== null && mentionMatches.length > 0 && (
            <div className="absolute bottom-full left-0 z-20 mb-1.5 w-56 overflow-hidden rounded-lg border border-[var(--color-hairline-strong)] bg-[var(--color-surface-overlay)] py-1 shadow-2xl">
              {mentionMatches.map((m, idx) => (
                <button
                  key={m.id}
                  onMouseDown={(e) => {
                    // mousedown (not click) so this fires before the
                    // input's own blur — a click would let the input
                    // blur first and the dropdown unmount before the
                    // selection registers.
                    e.preventDefault();
                    acceptMention(m.username);
                  }}
                  className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12.5px] ${idx === mentionActiveIndex ? 'bg-[var(--color-surface-raised)]' : ''}`}
                >
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-full presence-fill text-[8px] font-bold text-black">
                    {m.avatar_url ? <img src={m.avatar_url} alt="" className="h-full w-full object-cover" /> : m.display_name.slice(0, 1).toUpperCase()}
                  </div>
                  <span className="min-w-0 flex-1 truncate">{m.display_name}</span>
                  <span className="shrink-0 text-[var(--color-ink-faint)]">@{m.username}</span>
                </button>
              ))}
            </div>
          )}
          {emojiQuery !== null && emojiMatches.length > 0 && (
            <div className="absolute bottom-full left-0 z-20 mb-1.5 w-52 overflow-hidden rounded-lg border border-[var(--color-hairline-strong)] bg-[var(--color-surface-overlay)] shadow-2xl">
              <div className="border-b border-[var(--color-hairline)] px-2.5 py-1.5 font-mono text-[9.5px] uppercase tracking-wide text-[var(--color-ink-faint)]">
                Emoji matching :{emojiQuery}
              </div>
              <div className="py-1">
                {emojiMatches.map(([code, char], idx) => (
                  <button
                    key={code}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      acceptEmoji(code);
                    }}
                    className={`flex w-full items-center gap-2.5 px-2.5 py-1.5 text-left text-[12.5px] ${idx === emojiActiveIndex ? 'bg-[var(--color-surface-raised)]' : ''}`}
                  >
                    <span className="text-[20px] leading-none">{char}</span>
                    <span className="text-[var(--color-ink-muted)]">:{code}:</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => {
              const value = e.target.value;
              setInput(value);
              if (value.trim()) handleTyping();

              // Detect an in-progress, unterminated "@partial" token
              // right before the caret — this is what turns mentions
              // from "type the exact username and hope" into a real
              // autocomplete. Only looks behind the caret (not the
              // whole message) so a completed earlier @mention doesn't
              // reopen the dropdown while typing further along.
              const caret = e.target.selectionStart ?? value.length;
              const uptoCaret = value.slice(0, caret);
              const mentionMatch = /(?:^|\s)@([a-zA-Z0-9_]{0,32})$/.exec(uptoCaret);
              if (mentionMatch) {
                setMentionQuery(mentionMatch[1]);
                setMentionActiveIndex(0);
              } else {
                setMentionQuery(null);
              }

              // Only triggers once at least one letter follows the ':'
              // — ":partial" with zero characters yet would otherwise
              // match on every single colon typed (including ones
              // meant as plain punctuation, e.g. "9:30").
              const emojiMatch = /:([a-zA-Z0-9_+-]{1,})$/.exec(uptoCaret);
              if (emojiMatch && !mentionMatch) {
                setEmojiQuery(emojiMatch[1]);
                setEmojiActiveIndex(0);
              } else {
                setEmojiQuery(null);
              }
            }}
            onKeyDown={(e) => {
              if (mentionQuery !== null && mentionMatches.length > 0) {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setMentionActiveIndex((i) => (i + 1) % mentionMatches.length);
                  return;
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setMentionActiveIndex((i) => (i - 1 + mentionMatches.length) % mentionMatches.length);
                  return;
                }
                if (e.key === 'Enter' || e.key === 'Tab') {
                  e.preventDefault();
                  acceptMention(mentionMatches[mentionActiveIndex].username);
                  return;
                }
                if (e.key === 'Escape') {
                  setMentionQuery(null);
                  return;
                }
              }
              if (emojiQuery !== null && emojiMatches.length > 0) {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setEmojiActiveIndex((i) => (i + 1) % emojiMatches.length);
                  return;
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setEmojiActiveIndex((i) => (i - 1 + emojiMatches.length) % emojiMatches.length);
                  return;
                }
                if (e.key === 'Enter' || e.key === 'Tab') {
                  e.preventDefault();
                  acceptEmoji(emojiMatches[emojiActiveIndex][0]);
                  return;
                }
                if (e.key === 'Escape') {
                  setEmojiQuery(null);
                  return;
                }
              }
              // Enter sends; Shift+Enter inserts a real newline (the
              // textarea's default behavior, so just don't intercept
              // it) — matches Discord/Slack/iMessage convention rather
              // than the old single-line input where Enter was the
              // only option and multi-line messages weren't possible.
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            onPaste={handleComposerPaste}
            placeholder={ephemeralSeconds ? `Disappearing in ${ephemeralSeconds}s… try :fire:` : 'Message... try :fire: :heart: :rocket: — Shift+Enter for a new line'}
            rows={1}
            className="max-h-[200px] w-full resize-none bg-transparent text-[14px] leading-[1.5] text-[var(--color-ink)] placeholder-[var(--color-ink-faint)] outline-none"
          />

          <div className="mt-2 flex items-center justify-between border-t border-[var(--color-hairline)]/60 pt-2">
            <div className="flex items-center gap-1 text-[var(--color-ink-muted)]">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingImage}
                className="rounded-full p-1.5 transition-colors hover:bg-[var(--color-ink)]/[0.06] hover:text-[var(--color-ink)] disabled:opacity-40"
                title="Attachment"
                aria-label="Attach image"
              >
                {uploadingImage ? (
                  <span className="block h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--color-ink-faint)] border-t-[var(--color-ink)]" />
                ) : (
                  <ImagePlus size={16} />
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
                  className={`rounded-full p-1.5 transition-colors hover:bg-[var(--color-ink)]/[0.06] hover:text-[var(--color-ink)] ${ephemeralSeconds ? 'text-[var(--presence-default-a)]' : ''}`}
                  title="Disappearing messages"
                  aria-haspopup="true"
                >
                  <Timer size={16} />
                </button>
                {ephemeralMenuOpen && (
                  <div className="absolute bottom-full left-0 mb-2 flex flex-col overflow-hidden rounded-lg border border-[var(--color-hairline-strong)] bg-[var(--color-surface-raised)] text-[12.5px] shadow-2xl">
                    {EPHEMERAL_OPTIONS.map((opt) => (
                      <button
                        key={opt.seconds}
                        onClick={() => {
                          setEphemeralSeconds(opt.seconds);
                          setEphemeralMenuOpen(false);
                        }}
                        className={`px-4 py-2 text-left transition-colors hover:bg-[var(--color-surface-overlay)] ${ephemeralSeconds === opt.seconds ? 'text-[var(--presence-default-a)]' : 'text-[var(--color-ink)]/80'}`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <button
                onClick={toggleVoiceRecording}
                className={`rounded-full p-1.5 transition-colors hover:bg-[var(--color-ink)]/[0.06] hover:text-[var(--color-ink)] ${recording ? 'text-red-400' : ''}`}
                title={recording ? 'Stop recording' : 'Record a voice note'}
                aria-label={recording ? 'Stop recording' : 'Record a voice note'}
              >
                {recording ? <Square size={15} /> : <Mic size={16} />}
              </button>

              <div className="relative">
                <button
                  onClick={() => {
                    setEmojiPickerOpen((v) => !v);
                    setGifPickerOpen(false);
                  }}
                  className="rounded-full p-1.5 transition-colors hover:bg-[var(--color-ink)]/[0.06] hover:text-[var(--color-ink)]"
                  title="Add Emoji"
                  aria-haspopup="true"
                >
                  <Smile size={16} />
                </button>
                {emojiPickerOpen && <EmojiPicker onSelect={(emoji) => setInput((v) => v + emoji)} onClose={() => setEmojiPickerOpen(false)} />}
              </div>

              <div className="relative">
                <button
                  onClick={() => {
                    setGifPickerOpen((v) => !v);
                    setEmojiPickerOpen(false);
                  }}
                  className="rounded-full p-1.5 transition-colors hover:bg-[var(--color-ink)]/[0.06] hover:text-[var(--color-ink)]"
                  title="Add GIF"
                  aria-haspopup="true"
                >
                  <Sticker size={16} />
                </button>
                {gifPickerOpen && <GifPicker onSelect={handleSendGif} onClose={() => setGifPickerOpen(false)} />}
              </div>
            </div>

            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="flex items-center gap-2 rounded-sm bg-white px-5 py-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-black transition-all hover:bg-[var(--color-ink-muted)] active:scale-95 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-white"
            >
              <Send size={12} />
              Send
            </button>
          </div>
        </div>
      </div>

      {forwardTarget && <ForwardMessageModal message={forwardTarget} onClose={() => setForwardTarget(null)} />}
    </div>
  );
}

// The reply-preview line above a message — before this, it only ever
// showed anything when the replied-to message happened to already be
// in the currently-loaded messages window (a plain array .find()).
// Reply to something older than that window and the entire "↩
// replying to…" line silently disappeared, with zero indication a
// reply had even happened, and there was no way to jump to the
// original either way. This always resolves (falling back to
// getMessagePreview for anything not already loaded) and the whole
// line is clickable.
function ReplyPreviewLine({ replyToId, snippet, onJump }: { replyToId: number; snippet?: DisplayMessage; onJump: () => void }) {
  const { data: fallback } = useQuery({
    queryKey: ['message-preview', replyToId],
    queryFn: () => getMessagePreview(replyToId),
    enabled: !snippet,
    staleTime: 60_000,
  });

  const senderName = snippet?.sender_display_name ?? fallback?.sender_display_name;
  const preview = snippet ? (snippet.deleted ? 'Message deleted' : snippet.body_rendered) : fallback ? (fallback.deleted ? 'Message deleted' : fallback.body_rendered) : null;

  if (!senderName || preview === null) {
    // Still loading, or the message genuinely doesn't exist anymore
    // (deleted at the DB row level, not just soft-deleted) — either
    // way, showing nothing is better than a broken-looking line.
    return null;
  }

  return (
    <button
      onClick={onJump}
      className="group/reply mb-1 flex max-w-[320px] items-center gap-1.5 rounded pl-1 text-left"
    >
      {/* Discord's own curved connector — an L-shaped line pointing from
          the reply icon down into the actual message bubble below,
          rather than a plain "↩" glyph that reads more like a Markdown
          artifact than an intentional UI element. */}
      <svg width="16" height="12" viewBox="0 0 16 12" className="shrink-0 text-[var(--color-ink-faint)]">
        <path d="M2 0 V6 Q2 10 6 10 H14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <span className="truncate font-mono text-[10.5px] text-[var(--color-ink-muted)] transition-colors group-hover/reply:text-[var(--color-ink)]">
        <span className="font-semibold">{senderName}</span> <span className="group-hover/reply:underline">{preview}</span>
      </span>
    </button>
  );
}

function MessageRow({
  message,
  isMine,
  isEditing,
  isGrouped,
  knownUsernames,
  replySnippet,
  compact,
  bubbles,
  onReply,
  onEdit,
  onSaveEdit,
  onDelete,
  onRetry,
  reactions,
  onReact,
  isPinned,
  onTogglePin,
  onMarkUnread,
  onCopyText,
  onCopyLink,
  onForward,
  onJumpToReply,
}: {
  message: DisplayMessage;
  isMine: boolean;
  isEditing: boolean;
  isGrouped: boolean;
  knownUsernames: string[];
  replySnippet?: DisplayMessage;
  compact: boolean;
  bubbles: boolean;
  onReply: () => void;
  onEdit: () => void;
  onSaveEdit: (body: string) => void;
  onDelete: () => void;
  onRetry: () => void;
  reactions: MessageReactionSummary[];
  onReact: (emoji: string) => void;
  isPinned: boolean;
  onTogglePin: () => void;
  onMarkUnread: () => void;
  onCopyText: () => void;
  onCopyLink: () => void;
  onForward: () => void;
  onJumpToReply: (messageId: number) => void;
}) {
  const [editValue, setEditValue] = useState(message.body_rendered);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuDropUp, setMenuDropUp] = useState(false);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const [longPressMenuOpen, setLongPressMenuOpen] = useState(false);
  const [quickReactOpen, setQuickReactOpen] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);

  // Long-press-to-open-menu — this is the actual fix for "there's no
  // way to react/reply/forward on mobile at all": every one of those
  // actions previously lived only in `.hover-toolbar`, a
  // `group-hover:opacity-100` element, which has nothing to key off of
  // on a touch screen since there's no hover state. 450ms is roughly
  // what iOS/Android's own long-press gestures use before triggering.
  function handleTouchStart() {
    longPressFired.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true;
      if (navigator.vibrate) navigator.vibrate(12);
      setLongPressMenuOpen(true);
    }, 450);
  }
  function cancelLongPress() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  if (message.deleted) {
    return (
      <div id={`msg-${message.id}`} className={`flex gap-3 ${compact ? 'py-1' : 'py-2'} ${isMine ? 'flex-row-reverse' : ''}`}>
        <div className="w-10 shrink-0" />
        <div className="rounded-2xl border border-dashed border-[var(--color-hairline-strong)] px-3.5 py-2 font-mono text-[13px] italic text-[var(--color-ink-muted)]">
          message deleted
        </div>
      </div>
    );
  }

  const initials = message.sender_username.slice(0, 2).toUpperCase();
  const viewerUsername = useAppStore((s) => s.profile?.username);
  const mentionsMe =
    !!viewerUsername &&
    new RegExp(`@${viewerUsername.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(message.body_raw ?? '');
  const isExpiring = !!message.expires_at;
  const popoverAnchorRef = useRef<HTMLDivElement>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const hoverTime = new Date(message.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  return (
    <motion.div
      id={`msg-${message.id}`}
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: message.pending ? 0.5 : 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className={`group relative -mx-2 flex gap-3.5 rounded-lg px-2 transition-colors duration-100 hover:bg-[var(--color-ink)]/[0.03] ${
        mentionsMe && !isMine ? 'bg-[#f0b429]/[0.05] hover:bg-[#f0b429]/[0.08]' : ''
      } ${isGrouped ? 'py-[3px]' : compact ? 'py-1' : 'py-[7px]'} ${isMine ? 'flex-row-reverse' : ''}`}
      onTouchStart={handleTouchStart}
      onTouchEnd={cancelLongPress}
      onTouchMove={cancelLongPress}
      onTouchCancel={cancelLongPress}
      onContextMenu={(e) => {
        // A long-press on many touch browsers also fires the native
        // context menu (image save / text select popup) right on top
        // of the custom one — suppress it once our own long-press menu
        // has actually fired, but leave normal right-click alone.
        if (longPressFired.current) e.preventDefault();
      }}
    >
      {!compact && !isGrouped && (
        <button onClick={() => setPopoverOpen((v) => !v)} className="mt-0.5 flex w-10 shrink-0 items-center justify-center transition-transform hover:scale-[1.04]">
          <DecoratedAvatar decorationId={message.sender_avatar_decoration} size={34}>
            <div className="h-[34px] w-[34px] overflow-hidden rounded-full">
              {message.sender_avatar_url ? (
                <img src={message.sender_avatar_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center presence-fill text-[11px] font-bold text-black">
                  {initials}
                </div>
              )}
            </div>
          </DecoratedAvatar>
        </button>
      )}
      {!compact && isGrouped && (
        // Where the avatar would be on a non-grouped message — kept the
        // same width so grouped lines stay perfectly aligned under the
        // one avatar that started the run, and only reveals the time on
        // hover (same idea as Discord/Slack), so the info's still
        // reachable without repeating a full header on every line.
        <div className="flex w-10 shrink-0 items-center justify-center">
          <span className="hidden font-mono text-[9px] text-[var(--color-ink-faint)] group-hover:inline">{hoverTime}</span>
        </div>
      )}
      {compact && <div className="w-10 shrink-0" />}
      <div className={`relative flex flex-col ${bubbles ? 'max-w-[74%]' : 'max-w-full flex-1'} ${isMine ? 'items-end' : 'items-start'}`}>
        {!isGrouped && (
          <div ref={popoverAnchorRef} className={`mb-0.5 flex items-baseline gap-2 ${isMine ? 'flex-row-reverse' : ''}`}>
            <button onClick={() => setPopoverOpen((v) => !v)} className="text-[13px] font-semibold hover:opacity-80">
              <NameStyle name={message.sender_display_name} style={message.sender_name_style as NameStyleData} />
            </button>
            {/* Discord always shows a timestamp right next to the name on
                the first message of a group — this used to only reveal a
                time on hover for *grouped* follow-up lines, leaving the
                actual header (the one place you'd expect it most) with
                no time at all. */}
            <span className="font-mono text-[10.5px] text-[var(--color-ink-faint)]">{hoverTime}</span>
            {message.edited_at && <span className="font-mono text-[10px] text-[var(--color-ink-muted)]">(edited)</span>}
            {isExpiring && <span className="font-mono text-[10px] text-[var(--presence-default-a)]">disappearing</span>}
          </div>
        )}
        {popoverOpen && (
          <ProfilePopover username={message.sender_username} anchorRef={popoverAnchorRef} onClose={() => setPopoverOpen(false)} />
        )}

        {(replySnippet || message.reply_to_id) && (
          <ReplyPreviewLine
            replyToId={message.reply_to_id!}
            snippet={replySnippet}
            onJump={() => onJumpToReply(message.reply_to_id!)}
          />
        )}

        {isEditing ? (
          <div className="flex items-center gap-1.5">
            <textarea
              autoFocus
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  onSaveEdit(editValue);
                }
              }}
              rows={1}
              className="min-w-[220px] max-w-full resize-none rounded-2xl border border-[var(--presence-default-b)] bg-[var(--color-surface-raised)] px-3.5 py-2 text-sm leading-[1.5] text-[var(--color-ink)] outline-none"
            />
            <button
              onClick={() => onSaveEdit(editValue)}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-black"
            >
              ✓
            </button>
          </div>
        ) : (
          <>
            {/* Hover-toolbar anchor: wraps only the message's own visual
                content (media + bubble/text) — NOT the header, reply
                line, or reactions row below it. Before this, the
                toolbar was positioned against the *entire message
                column*, which stretches to the full row width whenever
                chat bubbles are off (max-w-full flex-1) — so the
                toolbar's "hug the bubble edge" positioning (right-full /
                left-full) ended up hugging the edge of the whole row
                instead, landing far from the actual text. An
                inline-block wrapper always shrinks to its content's
                actual rendered width regardless of the outer column's
                width, so the toolbar sits right next to the message in
                both bubble and flat mode. */}
            <div className={`group/msg relative inline-block max-w-full ${message.failed ? 'opacity-70' : ''}`}>
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
                  className={
                    bubbles
                      ? `bubble-shape rounded-2xl px-4 py-[11px] text-[13.5px] leading-[1.6] ${
                          isMine
                            ? 'rounded-br-md presence-fill font-medium text-black'
                            : mentionsMe
                              ? 'rounded-bl-md border border-[#f0b429]/50 bg-[#f0b429]/[0.09] text-[var(--color-ink)] shadow-[0_0_0_1px_rgba(240,180,41,0.12)]'
                              : 'rounded-bl-md border border-[var(--color-hairline)] bg-[var(--color-surface)] text-[var(--color-ink)]'
                        }`
                      : `text-[13.5px] leading-[1.55] text-[var(--color-ink)] ${mentionsMe && !isMine ? 'border-l-2 border-[#f0b429]/60 pl-2' : ''}`
                  }
                >
                  {renderMarkdown(message.body_rendered, viewerUsername, knownUsernames)}
                </div>
              )}
              {message.body_rendered && extractFirstUrl(message.body_rendered) && (
                <LinkPreviewCard url={extractFirstUrl(message.body_rendered)!} />
              )}

              {!message.pending && !message.failed && (
                <div
                  // Anchored to overlap the message's own top corner
                  // (right-0/left-0, not right-full/left-full) rather
                  // than poking out to the side of the bubble. Poking
                  // outside the bubble's own box used to extend the
                  // scroll container's actual scrollable width every
                  // time a different message was hovered — and because
                  // the container only declared overflow-y (not
                  // overflow-x), the browser silently turns overflow-x
                  // into 'auto' too whenever overflow-y isn't 'visible',
                  // so that phantom extra width could flicker a
                  // horizontal scrollbar in and out on desktop as you
                  // moved the mouse across different messages. Overlapping
                  // the corner instead keeps the toolbar fully inside the
                  // message's own horizontal footprint, so it can't ever
                  // widen the scrollable area no matter which message
                  // (short or long, own or theirs) is being hovered.
                  className={`hover-toolbar absolute -top-4 right-0 z-20 flex origin-top-right scale-95 items-center gap-0.5 whitespace-nowrap rounded-lg border border-[var(--color-hairline-strong)] bg-[var(--color-surface-overlay)] p-1 opacity-0 shadow-2xl transition-all duration-100 group-hover:scale-100 group-hover:opacity-100 group-hover/msg:scale-100 group-hover/msg:opacity-100 ${
                    isMine ? 'left-0 right-auto origin-top-left' : ''
                  }`}
                >
        <button onClick={onCopyText} title="Copy Text" className="rounded-md p-1.5 text-[var(--color-ink-muted)] transition-colors hover:bg-[var(--color-ink)]/[0.06] hover:text-[var(--color-ink)]">
          <Copy size={14} />
        </button>
        <div className="relative">
          <button
            onClick={() => setQuickReactOpen((v) => !v)}
            title="React with Emoji"
            className={`rounded-md p-1.5 text-[var(--color-ink-muted)] transition-colors hover:bg-[var(--color-ink)]/[0.06] hover:text-[var(--color-ink)] ${quickReactOpen ? 'bg-[var(--color-ink)]/[0.06] text-[var(--color-ink)]' : ''}`}
          >
            <Smile size={14} />
          </button>
          {quickReactOpen && (
            <div className="absolute bottom-full z-20 mb-1.5 flex gap-0.5 rounded-full border border-[var(--color-hairline-strong)] bg-[var(--color-surface-overlay)] p-1 shadow-2xl">
              {QUICK_REACT_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => {
                    onReact(emoji);
                    setQuickReactOpen(false);
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-[16px] transition-transform hover:scale-125 hover:bg-[var(--color-surface-raised)]"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>
        <button onClick={onReply} title="Reply" className="rounded-md p-1.5 text-[var(--color-ink-muted)] transition-colors hover:bg-[var(--color-ink)]/[0.06] hover:text-[var(--color-ink)]">
          <Reply size={14} />
        </button>
        <button onClick={onForward} title="Forward" className="rounded-md p-1.5 text-[var(--color-ink-muted)] transition-colors hover:bg-[var(--color-ink)]/[0.06] hover:text-[var(--color-ink)]">
          <ForwardIcon size={14} />
        </button>
        {isMine && (
          // Edit + Delete, front and center — previously both only
          // reachable by opening the "…" overflow menu, which made them
          // easy to miss entirely. Discord surfaces exactly these two
          // directly in the hover toolbar for your own messages rather
          // than one level deep; onDelete still confirms before doing
          // anything, and edit still uses the same inline textarea.
          <button onClick={onEdit} title="Edit" className="rounded-md p-1.5 text-[var(--color-ink-muted)] transition-colors hover:bg-[var(--color-ink)]/[0.06] hover:text-[var(--color-ink)]">
            <Pencil size={14} />
          </button>
        )}
        {isMine && (
          <button onClick={onDelete} title="Delete" className="rounded-md p-1.5 text-[var(--color-ink-muted)] transition-colors hover:bg-red-500/10 hover:text-red-400">
            <Trash2 size={14} />
          </button>
        )}
        <div className="relative ml-0.5 border-l border-[var(--color-hairline)] pl-1">
          <button
            ref={moreButtonRef}
            onClick={() => {
              // Decide whether the menu should drop down or flip
              // upward *before* it opens — it used to always open
              // downward from this button, which is fine for messages
              // near the top of the scroll area but meant every menu
              // on the last handful of messages in a conversation (the
              // ones people actually hover most) rendered partly or
              // fully underneath the composer, effectively unusable.
              // ~260px is a safe upper bound for this menu's rendered
              // height (7 items + padding) — good enough for a
              // direction decision without needing a second render to
              // measure the real box.
              const rect = moreButtonRef.current?.getBoundingClientRect();
              if (rect) setMenuDropUp(window.innerHeight - rect.bottom < 260);
              setMenuOpen((v) => !v);
            }}
            title="More Actions"
            className={`rounded-md p-1.5 text-[var(--color-ink-muted)] transition-colors hover:bg-[var(--color-ink)]/[0.06] hover:text-[var(--color-ink)] ${menuOpen ? 'bg-[var(--color-ink)]/[0.06] text-[var(--color-ink)]' : ''}`}
          >
            <MoreHorizontal size={14} />
          </button>
          {menuOpen && (
            <div className={`absolute z-20 ${menuDropUp ? 'bottom-full mb-1' : 'top-full mt-1'} ${isMine ? 'right-0' : 'left-0'}`}>
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
              )}
            </div>

            {reactions.length > 0 && (
              <div className={`mt-1 flex flex-wrap gap-1 ${isMine ? 'justify-end' : 'justify-start'}`}>
                {reactions.map((r) => (
                  <button
                    key={r.emoji}
                    onClick={() => onReact(r.emoji)}
                    title={
                      r.reactedByNames.length <= 3
                        ? r.reactedByNames.join(', ')
                        : `${r.reactedByNames.slice(0, 3).join(', ')} and ${r.reactedByNames.length - 3} more`
                    }
                    // Discord's actual reaction shape is a low, rounded
                    // *rectangle*, not a fully round pill — pills read
                    // more like filter chips than the tight, information-
                    // dense reaction row Discord/Slack both use. Border +
                    // background both light up together when you've
                    // reacted, rather than just the border, so your own
                    // reactions are unmistakable at a glance in a row of
                    // several.
                    className={`flex h-[22px] items-center gap-1.5 rounded-md border px-[6px] text-[12px] transition-colors ${
                      r.reactedByMe
                        ? 'border-[var(--presence-default-a)] bg-[var(--presence-default-a)]/20'
                        : 'border-transparent bg-[var(--color-ink)]/[0.05] hover:border-[var(--color-hairline-strong)] hover:bg-[var(--color-ink)]/[0.08]'
                    }`}
                  >
                    <span className="text-[13px] leading-none">{r.emoji}</span>
                    <span className={`font-mono text-[11px] leading-none ${r.reactedByMe ? 'font-semibold text-[var(--presence-default-a)]' : 'text-[var(--color-ink-muted)]'}`}>
                      {r.count}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {message.failed && (
              <button
                onClick={onRetry}
                className={`mt-1 flex items-center gap-1 text-[11px] text-red-400 hover:text-red-300 ${isMine ? 'self-end' : 'self-start'}`}
              >
                <AlertCircle size={11} />
                Failed to send · tap to retry
              </button>
            )}
          </>
        )}
      </div>

      {longPressMenuOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center md:hidden" onClick={() => setLongPressMenuOpen(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-md overflow-hidden rounded-t-2xl border-t border-[var(--color-hairline-strong)] bg-[var(--color-surface-overlay)] pb-[env(safe-area-inset-bottom)] shadow-2xl"
          >
            <div className="mx-auto mt-2.5 h-1 w-9 rounded-full bg-[var(--color-hairline-strong)]" />
            {/* Quick emoji row up top, same 8 shortcuts as the desktop
                hover toolbar's popover — the full "Add reaction" item
                below still opens the complete picker. */}
            <div className="flex items-center justify-center gap-1.5 border-b border-[var(--color-hairline)] px-4 py-3">
              {QUICK_REACT_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => {
                    onReact(emoji);
                    setLongPressMenuOpen(false);
                  }}
                  className="flex h-10 w-10 items-center justify-center rounded-full text-[19px] active:bg-[var(--color-surface-raised)]"
                >
                  {emoji}
                </button>
              ))}
            </div>
            <MessageContextMenu
              onClose={() => setLongPressMenuOpen(false)}
              onCopyText={onCopyText}
              onCopyLink={onCopyLink}
              onMarkUnread={onMarkUnread}
              onForward={onForward}
              onPin={onTogglePin}
              isPinned={isPinned}
              onReact={() => {
                setLongPressMenuOpen(false);
                setQuickReactOpen(true);
              }}
              onReply={() => {
                onReply();
                setLongPressMenuOpen(false);
              }}
              onEdit={isMine ? () => { onEdit(); setLongPressMenuOpen(false); } : undefined}
              onDelete={isMine ? () => { onDelete(); setLongPressMenuOpen(false); } : undefined}
              isMine={isMine}
              variant="sheet"
            />
          </div>
        </div>
      )}
    </motion.div>
  );
}
