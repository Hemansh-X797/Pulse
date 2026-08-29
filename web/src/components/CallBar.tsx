'use client';

import { useEffect, useRef } from 'react';
import { Mic, MicOff, PhoneOff, Loader2 } from 'lucide-react';
import type { useCall } from '../hooks/useCall';

/**
 * Renders remote participants' audio via hidden <audio> elements (one
 * per remote stream) plus a compact control bar. Voice-only for now —
 * per the honest scoping in plan.md, video/screen-share aren't part of
 * this pass.
 */
export function CallBar({ call, label }: { call: ReturnType<typeof useCall>; label: string }) {
  const audioRefs = useRef<Map<string, HTMLAudioElement>>(new Map());

  useEffect(() => {
    call.remoteStreams.forEach((stream, userId) => {
      const el = audioRefs.current.get(userId);
      if (el && el.srcObject !== stream) {
        el.srcObject = stream;
      }
    });
  }, [call.remoteStreams]);

  if (call.status === 'idle') return null;

  return (
    <div className="flex items-center justify-between border-b border-[var(--color-hairline)] bg-[var(--color-surface-raised)] px-4 py-2.5">
      {Array.from(call.remoteStreams.entries()).map(([userId, stream]) => (
        <audio
          key={userId}
          autoPlay
          ref={(el) => {
            if (el) {
              audioRefs.current.set(userId, el);
              if (el.srcObject !== stream) el.srcObject = stream;
            }
          }}
        />
      ))}

      <div className="flex items-center gap-2.5">
        {call.status === 'connecting' && (
          <>
            <Loader2 size={14} className="animate-spin text-[var(--color-ink-muted)]" />
            <span className="text-[12.5px] text-[var(--color-ink-muted)]">Connecting…</span>
          </>
        )}
        {call.status === 'active' && (
          <>
            <span className="h-2 w-2 rounded-full bg-green-500" />
            <span className="text-[12.5px] font-medium">{label}</span>
            <div className="flex -space-x-1.5">
              {call.participants.slice(0, 5).map((p) => (
                <div
                  key={p.user_id}
                  className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-[var(--color-surface-raised)] bg-[var(--color-surface-overlay)] text-[8px] font-bold"
                  title={p.display_name}
                >
                  {p.avatar_url ? <img src={p.avatar_url} alt="" className="h-full w-full rounded-full object-cover" /> : p.display_name.slice(0, 1).toUpperCase()}
                </div>
              ))}
            </div>
            <span className="text-[11px] text-[var(--color-ink-faint)]">{call.participants.length}/6</span>
          </>
        )}
        {call.status === 'error' && <span className="text-[12.5px] text-red-400">{call.error}</span>}
      </div>

      <div className="flex items-center gap-2">
        {call.status === 'active' && (
          <button
            onClick={call.toggleMute}
            className={`flex h-8 w-8 items-center justify-center rounded-full ${call.muted ? 'bg-red-500/15 text-red-400' : 'bg-[var(--color-surface-overlay)] text-[var(--color-ink)]'}`}
            aria-label={call.muted ? 'Unmute' : 'Mute'}
            title={call.muted ? 'Unmute' : 'Mute'}
          >
            {call.muted ? <MicOff size={14} /> : <Mic size={14} />}
          </button>
        )}
        <button
          onClick={call.leave}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-red-500/15 text-red-400 hover:bg-red-500/25"
          aria-label="Leave call"
          title="Leave call"
        >
          <PhoneOff size={14} />
        </button>
      </div>
    </div>
  );
}
