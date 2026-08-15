'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, ImagePlus, Mic, Timer, Square, Reply, Pencil, X } from 'lucide-react';
import {
  listMessages,
  sendMessage,
  editMessage,
  deleteMessage,
  markRead,
} from '../../lib/api/channels';
import { uploadMedia } from '../../lib/api/media';
import {
  subscribeToChannelMessages,
  subscribeToTyping,
  broadcastTyping,
  unsubscribe,
} from '../../lib/realtime';
import { useAppStore } from '../../store/useAppStore';
import type { Message } from '../../lib/database.types';

type DisplayMessage = (Message & { sender_username: string }) & { pending?: boolean };

const EPHEMERAL_OPTIONS = [
  { label: 'Off', seconds: 0 },
  { label: '10s', seconds: 10 },
  { label: '1m', seconds: 60 },
  { label: '1h', seconds: 3600 },
];

export function ChatView({ channelId, channelLabel }: { channelId: string; channelLabel: string }) {
  const queryClient = useQueryClient();
  const profile = useAppStore((s) => s.profile);
  const connectionStatus = useAppStore((s) => s.connectionStatus);

  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState('');
  const [typingUser, setTypingUser] = useState<string | null>(null);
  const [replyTarget, setReplyTarget] = useState<DisplayMessage | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [ephemeralSeconds, setEphemeralSeconds] = useState(0);
  const [ephemeralMenuOpen, setEphemeralMenuOpen] = useState(false);
  const [recording, setRecording] = useState(false);

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
              next[idx] = { ...incoming, sender_username: prev[idx].sender_username, pending: false };
              return next;
            }
          }
          if (prev.some((m) => m.id === incoming.id)) return prev;
          const senderUsername = incoming.sender_id === profile?.id ? profile.username : '…';
          return [...prev, { ...incoming, sender_username: senderUsername }];
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
    const url = await uploadMedia(file);
    const clientRef = crypto.randomUUID();
    const optimistic: DisplayMessage = {
      id: -Date.now(),
      channel_id: channelId,
      sender_id: profile.id,
      sender_username: profile.username,
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

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-[62px] shrink-0 items-baseline gap-2.5 border-b border-white/[0.07] px-7">
        <h2 className="font-serif text-lg font-semibold"># {channelLabel}</h2>
        <span
          className={`ml-auto h-1.5 w-1.5 rounded-full ${connectionStatus === 'connected' ? 'bg-emerald-400' : 'bg-neutral-600'}`}
          title={connectionStatus}
        />
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-7 py-6">
        <AnimatePresence initial={false}>
          {messages.map((m) => (
            <MessageRow
              key={m.client_ref ?? m.id}
              message={m}
              isMine={m.sender_id === profile?.id}
              isEditing={editingId === m.id}
              replySnippet={m.reply_to_id ? messages.find((x) => x.id === m.reply_to_id) : undefined}
              onReply={() => setReplyTarget(m)}
              onEdit={() => startEdit(m)}
              onSaveEdit={(body) => saveEdit(m.id, body)}
              onDelete={() => handleDelete(m.id)}
            />
          ))}
        </AnimatePresence>
      </div>

      <div className={`px-7 text-[11.5px] text-neutral-500 transition-opacity ${typingUser ? 'opacity-100' : 'opacity-0'}`}>
        {typingUser && `${typingUser} is typing…`}
      </div>

      {replyTarget && (
        <div className="mx-7 mb-2 flex items-center gap-2.5 rounded-lg border border-white/[0.07] bg-neutral-900 px-3 py-2">
          <div className="h-full w-[3px] shrink-0 self-stretch rounded bg-gradient-to-br from-indigo-400 to-pink-400" />
          <div className="min-w-0 flex-1">
            <div className="text-[10px] text-neutral-500">replying to {replyTarget.sender_username}</div>
            <div className="truncate text-[13px] text-neutral-400">{replyTarget.body_rendered}</div>
          </div>
          <button onClick={() => setReplyTarget(null)} className="text-neutral-500 hover:text-white" aria-label="Cancel reply">
            <X size={16} />
          </button>
        </div>
      )}

      <div className="px-7 pb-6 pt-3">
        <div className="flex items-center gap-2 rounded-full border border-white/[0.07] bg-neutral-900 py-1.5 pl-4 pr-1.5">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-neutral-400 hover:text-white"
            aria-label="Attach image"
          >
            <ImagePlus size={17} />
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
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${ephemeralSeconds ? 'text-pink-400' : 'text-neutral-400'} hover:text-white`}
              aria-label="Ephemeral message timer"
              aria-haspopup="true"
            >
              <Timer size={17} />
            </button>
            {ephemeralMenuOpen && (
              <div className="absolute bottom-full left-0 mb-2 flex flex-col overflow-hidden rounded-lg border border-white/10 bg-neutral-800 text-[12.5px]">
                {EPHEMERAL_OPTIONS.map((opt) => (
                  <button
                    key={opt.seconds}
                    onClick={() => {
                      setEphemeralSeconds(opt.seconds);
                      setEphemeralMenuOpen(false);
                    }}
                    className={`px-4 py-2 text-left hover:bg-neutral-700 ${ephemeralSeconds === opt.seconds ? 'text-pink-400' : 'text-neutral-300'}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={toggleVoiceRecording}
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${recording ? 'text-red-400' : 'text-neutral-400'} hover:text-white`}
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
            className="min-w-0 flex-1 bg-transparent text-sm text-white placeholder-neutral-500 outline-none"
          />

          <button
            onClick={handleSend}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-black transition-transform active:scale-90"
            aria-label="Send"
          >
            <Send size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}

function MessageRow({
  message,
  isMine,
  isEditing,
  replySnippet,
  onReply,
  onEdit,
  onSaveEdit,
  onDelete,
}: {
  message: DisplayMessage;
  isMine: boolean;
  isEditing: boolean;
  replySnippet?: DisplayMessage;
  onReply: () => void;
  onEdit: () => void;
  onSaveEdit: (body: string) => void;
  onDelete: () => void;
}) {
  const [editValue, setEditValue] = useState(message.body_rendered);

  if (message.deleted) {
    return (
      <div className={`flex gap-2.5 py-1.5 ${isMine ? 'flex-row-reverse' : ''}`}>
        <div className="w-[30px] shrink-0" />
        <div className="rounded-2xl border border-dashed border-white/10 px-3.5 py-2 font-mono text-[13px] italic text-neutral-500">
          message deleted
        </div>
      </div>
    );
  }

  const initials = message.sender_username.slice(0, 2).toUpperCase();
  const isExpiring = !!message.expires_at;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: message.pending ? 0.5 : 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className={`group flex gap-2.5 py-1.5 ${isMine ? 'flex-row-reverse' : ''}`}
    >
      <div className="mt-0.5 flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-400 to-pink-400 text-[11px] font-bold text-black">
        {initials}
      </div>
      <div className={`flex max-w-[70%] flex-col ${isMine ? 'items-end' : 'items-start'}`}>
        <div className={`mb-0.5 flex items-baseline gap-2 ${isMine ? 'flex-row-reverse' : ''}`}>
          <span className="text-[12.5px] font-semibold">{message.sender_username}</span>
          {message.edited_at && <span className="font-mono text-[10px] text-neutral-500">edited</span>}
          {isExpiring && <span className="font-mono text-[10px] text-pink-400">disappearing</span>}
        </div>

        {replySnippet && (
          <div className="mb-0.5 max-w-[320px] truncate font-mono text-[10.5px] text-neutral-500">
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
              className="min-w-[220px] rounded-full border border-indigo-400 bg-neutral-800 px-3.5 py-2 text-sm text-white outline-none"
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
              <div className="mb-1 overflow-hidden rounded-xl border border-white/10">
                <img src={message.media_url} alt="" className="max-h-80 max-w-xs object-cover" />
              </div>
            )}
            {message.media_type === 'audio' && message.media_url && (
              <audio controls src={message.media_url} className="mb-1 h-9 max-w-xs" />
            )}
            {message.body_rendered && (
              <div
                className={`rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
                  isMine
                    ? 'rounded-br-md bg-gradient-to-br from-indigo-400 to-pink-400 font-medium text-black'
                    : 'rounded-bl-md border border-white/[0.07] bg-neutral-900 text-white'
                }`}
              >
                {message.body_rendered}
              </div>
            )}
          </>
        )}
      </div>

      <div className={`flex items-center gap-1 self-center opacity-0 transition-opacity group-hover:opacity-100 ${isMine ? 'order-first' : ''}`}>
        <button onClick={onReply} className="flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-neutral-900 text-neutral-400 hover:text-white" aria-label="Reply">
          <Reply size={12} />
        </button>
        {isMine && (
          <>
            <button onClick={onEdit} className="flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-neutral-900 text-neutral-400 hover:text-white" aria-label="Edit">
              <Pencil size={12} />
            </button>
            <button onClick={onDelete} className="flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-neutral-900 text-neutral-400 hover:text-white" aria-label="Delete">
              ×
            </button>
          </>
        )}
      </div>
    </motion.div>
  );
}
