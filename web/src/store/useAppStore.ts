import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import type { Profile } from '../lib/database.types';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

interface AppState {
  // ---- auth ----
  session: Session | null;
  profile: Profile | null;
  setSession: (session: Session | null) => void;
  setProfile: (profile: Profile | null) => void;

  // ---- active context (which space/topic is open) ----
  activeSpaceId: string | null; // null = Home context (feed/DMs), matches the /channels/@me vs /spaces/:spaceId route split
  activeChannelId: string | null;
  setActiveSpace: (spaceId: string | null) => void;
  setActiveChannel: (channelId: string | null) => void;

  // ---- unread / notifications ----
  unreadByChannel: Record<string, number>;
  // Separate from unreadByChannel on purpose: unread is "there are new
  // messages here," which for a DM is already inherently about you (the
  // whole conversation is), so a distinct "ping" indicator there would
  // just be a louder duplicate of the same information. This tracks
  // specifically "you were @mentioned here" — meaningful for a busy
  // space channel with dozens of unread messages where only a couple
  // actually named you, and meant to be surfaced (as an amber "ping"
  // badge) only in space channel lists, never in the DM list. See
  // SecondarySidebar's two rendering branches for where each is used.
  mentionsByChannel: Record<string, number>;
  unreadNotifications: number;
  setUnreadByChannel: (counts: Record<string, number>) => void;
  setMentionsByChannel: (counts: Record<string, number>) => void;
  setUnreadNotifications: (count: number) => void;
  totalUnreadChannels: () => number;

  // ---- realtime connection status (surfaced in the UI as a status dot,
  // same purpose as the C++ client's `wsConnected` state) ----
  connectionStatus: ConnectionStatus;
  setConnectionStatus: (status: ConnectionStatus) => void;

  // ---- presence: who else is online right now, and how (online/dnd).
  // Absence from this map means offline OR invisible — see
  // subscribeToGlobalPresence's doc comment for why those two cases are
  // deliberately indistinguishable to other clients. ----
  presenceByUserId: Record<string, 'online' | 'dnd'>;
  setPresenceByUserId: (map: Record<string, 'online' | 'dnd'>) => void;

  reset: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  session: null,
  profile: null,
  setSession: (session) => set({ session }),
  setProfile: (profile) => set({ profile }),

  activeSpaceId: null,
  activeChannelId: null,
  setActiveSpace: (spaceId) => set({ activeSpaceId: spaceId }),
  setActiveChannel: (channelId) => set({ activeChannelId: channelId }),

  unreadByChannel: {},
  mentionsByChannel: {},
  unreadNotifications: 0,
  setUnreadByChannel: (counts) => set({ unreadByChannel: counts }),
  setMentionsByChannel: (counts) => set({ mentionsByChannel: counts }),
  setUnreadNotifications: (count) => set({ unreadNotifications: count }),
  totalUnreadChannels: () => Object.values(get().unreadByChannel).reduce((a, b) => a + b, 0),

  connectionStatus: 'connecting',
  setConnectionStatus: (status) => set({ connectionStatus: status }),

  presenceByUserId: {},
  setPresenceByUserId: (map) => set({ presenceByUserId: map }),

  reset: () =>
    set({
      session: null,
      profile: null,
      activeSpaceId: null,
      activeChannelId: null,
      unreadByChannel: {},
      mentionsByChannel: {},
      unreadNotifications: 0,
      connectionStatus: 'disconnected',
      presenceByUserId: {},
    }),
}));
