'use client';

import { useEffect, useState } from 'react';
import { Mic, MicOff, PhoneOff, Volume2, Loader2 } from 'lucide-react';
import { useCall } from '../hooks/useCall';
import { getActiveCall, listCallParticipants, type CallParticipant } from '../lib/api/calls';
import { subscribeToTable, unsubscribe } from '../lib/realtime';

/**
 * A real voice-channel screen, not a text channel with a call bar
 * stapled on top. Before this, `SpaceTopic` rendered `ChatView` for
 * *every* channel kind — the full message composer, image upload,
 * emoji picker, everything — with `CallBar` sitting idle above it
 * until someone clicked to join. That's not what a voice channel is
 * supposed to feel like: clicking into one should immediately show who
 * (if anyone) is already talking and a clear way to join, the way
 * Discord's voice channels work, not a chat box you have to notice a
 * thin bar above.
 */
export function VoiceChannelView({ channelId, channelLabel }: { channelId: string; channelLabel: string }) {
  const call = useCall(channelId);
  const [preJoinParticipants, setPreJoinParticipants] = useState<CallParticipant[]>([]);
  const [activeCallId, setActiveCallId] = useState<string | null>(null);

  // Discover whether there's already a call running in this channel,
  // and keep that in sync via realtime on `calls` (which does have a
  // channel_id column to filter on).
  useEffect(() => {
    if (call.status !== 'idle') return;
    let cancelled = false;

    function refreshCall() {
      getActiveCall(channelId).then((active) => {
        if (!cancelled) setActiveCallId(active?.id ?? null);
      });
    }

    refreshCall();
    const callsSub = subscribeToTable('calls', `channel_id=eq.${channelId}`, refreshCall);
    return () => {
      cancelled = true;
      unsubscribe(callsSub);
    };
  }, [channelId, call.status]);

  // Once we know the active call's id, list (and live-track) who's in
  // it — `call_participants` only has a call_id column, not
  // channel_id, so this has to be a separate subscription scoped to
  // that id rather than trying to filter call_participants by a column
  // it doesn't have.
  useEffect(() => {
    if (call.status !== 'idle' || !activeCallId) {
      setPreJoinParticipants([]);
      return;
    }
    let cancelled = false;

    function refreshParticipants() {
      listCallParticipants(activeCallId!).then((p) => {
        if (!cancelled) setPreJoinParticipants(p);
      });
    }

    refreshParticipants();
    const participantsSub = subscribeToTable('call_participants', `call_id=eq.${activeCallId}`, refreshParticipants);
    return () => {
      cancelled = true;
      unsubscribe(participantsSub);
    };
  }, [activeCallId, call.status]);

  const displayParticipants = call.status === 'active' ? call.participants : preJoinParticipants;

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 px-6 text-center">
      {Array.from(call.remoteStreams.entries()).map(([userId, stream]) => (
        <audio
          key={userId}
          autoPlay
          ref={(el) => {
            if (el && el.srcObject !== stream) el.srcObject = stream;
          }}
        />
      ))}

      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-surface-raised)] text-[var(--color-ink-muted)]">
        <Volume2 size={26} />
      </div>

      <div>
        <h2 className="text-[17px] font-semibold">{channelLabel}</h2>
        <p className="mt-1 text-[12.5px] text-[var(--color-ink-muted)]">
          {call.status === 'active'
            ? `You're in this call · ${displayParticipants.length}/6`
            : displayParticipants.length > 0
              ? `${displayParticipants.length} ${displayParticipants.length === 1 ? 'person is' : 'people are'} already here`
              : 'No one is here yet'}
        </p>
      </div>

      {displayParticipants.length > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-3">
          {displayParticipants.map((p) => (
            <div key={p.user_id} className="flex flex-col items-center gap-1.5">
              <div className="relative flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-surface-overlay)] text-[13px] font-bold">
                {p.avatar_url ? <img src={p.avatar_url} alt="" className="h-full w-full rounded-full object-cover" /> : p.display_name.slice(0, 2).toUpperCase()}
                {p.muted && (
                  <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-void)] text-red-400">
                    <MicOff size={11} />
                  </span>
                )}
              </div>
              <span className="max-w-[70px] truncate text-[11px] text-[var(--color-ink-muted)]">{p.display_name}</span>
            </div>
          ))}
        </div>
      )}

      {call.status === 'error' && <p className="max-w-xs text-[12.5px] text-red-400">{call.error}</p>}

      <div className="flex items-center gap-3">
        {call.status === 'idle' && (
          <button
            onClick={call.join}
            className="flex items-center gap-2 rounded-full presence-fill px-6 py-3 text-[13.5px] font-semibold text-black transition-transform hover:scale-[1.03] active:scale-[0.98]"
          >
            <Volume2 size={16} /> Join Voice
          </button>
        )}
        {call.status === 'connecting' && (
          <div className="flex items-center gap-2 rounded-full bg-[var(--color-surface-raised)] px-6 py-3 text-[13.5px] font-medium text-[var(--color-ink-muted)]">
            <Loader2 size={15} className="animate-spin" /> Connecting…
          </div>
        )}
        {call.status === 'error' && (
          <button
            onClick={call.join}
            className="flex items-center gap-2 rounded-full bg-[var(--color-surface-raised)] px-6 py-3 text-[13.5px] font-semibold hover:bg-[var(--color-hairline-strong)]"
          >
            Try again
          </button>
        )}
        {call.status === 'active' && (
          <>
            <button
              onClick={call.toggleMute}
              className={`flex h-12 w-12 items-center justify-center rounded-full ${call.muted ? 'bg-red-500/15 text-red-400' : 'bg-[var(--color-surface-raised)] text-[var(--color-ink)]'}`}
              aria-label={call.muted ? 'Unmute' : 'Mute'}
              title={call.muted ? 'Unmute' : 'Mute'}
            >
              {call.muted ? <MicOff size={18} /> : <Mic size={18} />}
            </button>
            <button
              onClick={call.leave}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/15 text-red-400 hover:bg-red-500/25"
              aria-label="Leave call"
              title="Leave call"
            >
              <PhoneOff size={18} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
