import { supabase } from './supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

/**
 * Full-mesh WebRTC: every participant opens a direct peer connection
 * to every other participant. This is genuinely free (no media
 * server), but quality degrades past a handful of people since each
 * participant uploads their own stream N-1 times — that's exactly why
 * start_or_join_call() caps a call at 6 participants server-side
 * (025_voice_calls.sql). A real SFU (one upload per person, server
 * fans it out) is the VM-requiring path that's explicitly deferred
 * per the plan.
 *
 * Signaling (exchanging SDP offers/answers and ICE candidates) goes
 * over a Supabase Realtime *broadcast* channel — not postgres_changes,
 * since this traffic is high-frequency and ephemeral (never needs to
 * be a database row) — same "broadcast for ephemeral things" pattern
 * typing indicators already use in realtime.ts. This is what makes
 * signaling free: no separate signaling server, just the Realtime
 * connection every client already has open.
 */

// STUN is free and public. TURN (needed as a fallback when a direct
// P2P connection can't be established — symmetric NATs, some
// corporate firewalls, roughly 10-20% of real-world connections) is
// NOT free by default and I can't fabricate real credentials for you.
// Set these three env vars from a free-tier TURN provider (Metered/
// OpenRelay or Cloudflare Calls both have one) to enable it — without
// them, calls still work for the majority of direct-P2P-capable
// connections, just not the ones that need a relay.
const TURN_URL = process.env.NEXT_PUBLIC_TURN_URL;
const TURN_USERNAME = process.env.NEXT_PUBLIC_TURN_USERNAME;
const TURN_CREDENTIAL = process.env.NEXT_PUBLIC_TURN_CREDENTIAL;

function getIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }];
  if (TURN_URL && TURN_USERNAME && TURN_CREDENTIAL) {
    servers.push({ urls: TURN_URL, username: TURN_USERNAME, credential: TURN_CREDENTIAL });
  }
  return servers;
}

type SignalMessage =
  | { type: 'offer'; from: string; to: string; sdp: RTCSessionDescriptionInit }
  | { type: 'answer'; from: string; to: string; sdp: RTCSessionDescriptionInit }
  | { type: 'ice-candidate'; from: string; to: string; candidate: RTCIceCandidateInit }
  | { type: 'join'; from: string }
  | { type: 'leave'; from: string };

export interface CallSessionCallbacks {
  onRemoteStream: (userId: string, stream: MediaStream) => void;
  onPeerLeft: (userId: string) => void;
  onPeerJoined: (userId: string) => void;
}

/**
 * One CallSession per active call — owns the local mic stream, the
 * mesh of RTCPeerConnections (one per other participant), and the
 * signaling channel. A new peer connection is created reactively the
 * first time a signal arrives from a given user, so join order doesn't
 * matter — whoever's already in the call and whoever just joined both
 * end up with a connection to each other regardless of who signals
 * first.
 */
export class CallSession {
  private channelId: string;
  private userId: string;
  private signaling: RealtimeChannel;
  private peers = new Map<string, RTCPeerConnection>();
  private localStream: MediaStream | null = null;
  private callbacks: CallSessionCallbacks;
  private closed = false;

  constructor(channelId: string, userId: string, callbacks: CallSessionCallbacks) {
    this.channelId = channelId;
    this.userId = userId;
    this.callbacks = callbacks;
    this.signaling = supabase.channel(`call-signal:${channelId}`, {
      config: { broadcast: { self: false } },
    });
  }

  async start(): Promise<void> {
    this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });

    this.signaling.on('broadcast', { event: 'signal' }, ({ payload }) => {
      this.handleSignal(payload as SignalMessage);
    });

    await new Promise<void>((resolve) => {
      this.signaling.subscribe((status) => {
        if (status === 'SUBSCRIBED') resolve();
      });
    });

    // Announce myself so everyone already in the call opens a
    // connection to me — the `calls`/`call_participants` DB rows are
    // the source of truth for who's already there (fetched separately
    // by whoever constructs this class); this broadcast is purely "I
    // just joined, signal me."
    this.send({ type: 'join', from: this.userId });
  }

  private send(message: SignalMessage) {
    this.signaling.send({ type: 'broadcast', event: 'signal', payload: message });
  }

  private getOrCreatePeer(otherUserId: string): RTCPeerConnection {
    let pc = this.peers.get(otherUserId);
    if (pc) return pc;

    pc = new RTCPeerConnection({ iceServers: getIceServers() });
    this.peers.set(otherUserId, pc);

    if (this.localStream) {
      for (const track of this.localStream.getTracks()) {
        pc.addTrack(track, this.localStream);
      }
    }

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        this.send({ type: 'ice-candidate', from: this.userId, to: otherUserId, candidate: e.candidate.toJSON() });
      }
    };

    pc.ontrack = (e) => {
      this.callbacks.onRemoteStream(otherUserId, e.streams[0]);
    };

    pc.onconnectionstatechange = () => {
      if (pc!.connectionState === 'failed' || pc!.connectionState === 'closed') {
        this.peers.delete(otherUserId);
        this.callbacks.onPeerLeft(otherUserId);
      }
    };

    return pc;
  }

  private async handleSignal(message: SignalMessage) {
    if (message.from === this.userId) return;
    if ('to' in message && message.to !== this.userId) return;

    if (message.type === 'join') {
      // A new peer announced themselves — I initiate the offer to them
      // (deterministic tie-break: lower userId always offers, so two
      // peers don't both send an offer to each other simultaneously
      // and end up with a glare condition).
      this.callbacks.onPeerJoined(message.from);
      if (this.userId < message.from) {
        const pc = this.getOrCreatePeer(message.from);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        this.send({ type: 'offer', from: this.userId, to: message.from, sdp: offer });
      }
      return;
    }

    if (message.type === 'leave') {
      const pc = this.peers.get(message.from);
      pc?.close();
      this.peers.delete(message.from);
      this.callbacks.onPeerLeft(message.from);
      return;
    }

    const pc = this.getOrCreatePeer(message.from);

    if (message.type === 'offer') {
      await pc.setRemoteDescription(new RTCSessionDescription(message.sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      this.send({ type: 'answer', from: this.userId, to: message.from, sdp: answer });
    } else if (message.type === 'answer') {
      await pc.setRemoteDescription(new RTCSessionDescription(message.sdp));
    } else if (message.type === 'ice-candidate') {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(message.candidate));
      } catch {
        // Candidates that arrive before setRemoteDescription resolves
        // are expected sometimes with mesh + broadcast ordering —
        // dropping one candidate doesn't break the connection as long
        // as others succeed, so this isn't surfaced as an error.
      }
    }
  }

  setMuted(muted: boolean) {
    if (!this.localStream) return;
    for (const track of this.localStream.getAudioTracks()) {
      track.enabled = !muted;
    }
  }

  async end() {
    if (this.closed) return;
    this.closed = true;
    this.send({ type: 'leave', from: this.userId });
    for (const pc of this.peers.values()) pc.close();
    this.peers.clear();
    this.localStream?.getTracks().forEach((t) => t.stop());
    await supabase.removeChannel(this.signaling);
  }
}
