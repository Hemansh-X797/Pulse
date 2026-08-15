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
  unreadNotifications: number;
  setUnreadByChannel: (counts: Record<string, number>) => void;
  setUnreadNotifications: (count: number) => void;
  totalUnreadChannels: () => number;

  // ---- realtime connection status (surfaced in the UI as a status dot,
  // same purpose as the C++ client's `wsConnected` state) ----
  connectionStatus: ConnectionStatus;
  setConnectionStatus: (status: ConnectionStatus) => void;

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
  unreadNotifications: 0,
  setUnreadByChannel: (counts) => set({ unreadByChannel: counts }),
  setUnreadNotifications: (count) => set({ unreadNotifications: count }),
  totalUnreadChannels: () => Object.values(get().unreadByChannel).reduce((a, b) => a + b, 0),

  connectionStatus: 'connecting',
  setConnectionStatus: (status) => set({ connectionStatus: status }),

  reset: () =>
    set({
      session: null,
      profile: null,
      activeSpaceId: null,
      activeChannelId: null,
      unreadByChannel: {},
      unreadNotifications: 0,
      connectionStatus: 'disconnected',
    }),
}));
