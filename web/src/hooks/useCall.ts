'use client';

import { useCallback, useRef, useState } from 'react';
import { CallSession } from '../lib/webrtc';
import { startOrJoinCall, leaveCall, setCallMuted, listCallParticipants, type CallParticipant } from '../lib/api/calls';
import { subscribeToTable, unsubscribe } from '../lib/realtime';
import { useAppStore } from '../store/useAppStore';

export type CallStatus = 'idle' | 'connecting' | 'active' | 'error';

export function useCall(channelId: string | null) {
  const profile = useAppStore((s) => s.profile);
  const [status, setStatus] = useState<CallStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [callId, setCallId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<CallParticipant[]>([]);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [muted, setMuted] = useState(false);
  const sessionRef = useRef<CallSession | null>(null);
  const participantSubRef = useRef<ReturnType<typeof subscribeToTable> | null>(null);

  const refreshParticipants = useCallback((activeCallId: string) => {
    listCallParticipants(activeCallId)
      .then(setParticipants)
      .catch(() => {});
  }, []);

  const join = useCallback(async () => {
    if (!channelId || !profile) return;
    setStatus('connecting');
    setError(null);
    try {
      const activeCallId = await startOrJoinCall(channelId);
      setCallId(activeCallId);
      refreshParticipants(activeCallId);

      const session = new CallSession(channelId, profile.id, {
        onRemoteStream: (userId, stream) => {
          setRemoteStreams((prev) => new Map(prev).set(userId, stream));
        },
        onPeerLeft: (userId) => {
          setRemoteStreams((prev) => {
            const next = new Map(prev);
            next.delete(userId);
            return next;
          });
        },
        onPeerJoined: () => refreshParticipants(activeCallId),
      });
      await session.start();
      sessionRef.current = session;

      // Live participant list — same "must be in the realtime
      // publication" requirement as everything else in this app;
      // handled by 025_voice_calls.sql.
      participantSubRef.current = subscribeToTable('call_participants', `call_id=eq.${activeCallId}`, () =>
        refreshParticipants(activeCallId)
      );

      setStatus('active');
    } catch (e) {
      setStatus('error');
      setError(
        e instanceof Error
          ? e.name === 'NotAllowedError'
            ? 'Microphone access was denied — allow mic access to join the call.'
            : e.message
          : 'Could not join the call.'
      );
    }
  }, [channelId, profile, refreshParticipants]);

  const leave = useCallback(async () => {
    if (sessionRef.current) {
      await sessionRef.current.end();
      sessionRef.current = null;
    }
    if (participantSubRef.current) {
      unsubscribe(participantSubRef.current);
      participantSubRef.current = null;
    }
    if (callId) {
      leaveCall(callId).catch(() => {});
    }
    setStatus('idle');
    setCallId(null);
    setParticipants([]);
    setRemoteStreams(new Map());
  }, [callId]);

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      sessionRef.current?.setMuted(next);
      if (callId) setCallMuted(callId, next).catch(() => {});
      return next;
    });
  }, [callId]);

  return { status, error, callId, participants, remoteStreams, muted, join, leave, toggleMute };
}
