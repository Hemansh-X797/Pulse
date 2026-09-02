// Mirrors supabase/schema.sql exactly. In a real workflow you'd generate
// this file with `supabase gen types typescript --project-id <id>` once
// the project exists and never hand-edit it again — it's hand-written
// here only because there's no live Supabase project to generate
// against yet. Regenerate it for real as your first step after running
// the schema (see docs/SUPABASE_SETUP.md).

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          username: string;
          display_name: string;
          bio: string;
          pronouns: string;
          status_text: string;
          avatar_url: string;
          banner_url: string;
          accent_color_top: string;
          accent_color_bottom: string;
          created_at: string;
          interests: string[];
          onboarding_completed: boolean;
          status: 'online' | 'dnd' | 'invisible';
          name_style: { font?: string; effect?: string; colors?: string[] } | null;
          equipped_nameplate: string | null;
          equipped_avatar_decoration: string | null;
          date_of_birth: string | null;
          last_seen_at: string | null;
        };
        Insert: Partial<Database['public']['Tables']['profiles']['Row']> & { id: string; username: string; display_name: string };
        Update: Partial<Database['public']['Tables']['profiles']['Row']>;
        Relationships: [];
      };
      spaces: {
        Row: {
          id: string;
          name: string;
          icon_url: string;
          accent_color_top: string;
          accent_color_bottom: string;
          owner_id: string;
          invite_code: string;
          created_at: string;
          is_private: boolean;
          tags: string[];
          description: string;
        };
        Insert: Partial<Database['public']['Tables']['spaces']['Row']> & { name: string; owner_id: string };
        Update: Partial<Database['public']['Tables']['spaces']['Row']>;
        Relationships: [];
      };
      space_members: {
        Row: { space_id: string; user_id: string; role: 'owner' | 'admin' | 'member'; joined_at: string };
        Insert: { space_id: string; user_id: string; role?: 'owner' | 'admin' | 'member' };
        Update: Partial<Database['public']['Tables']['space_members']['Row']>;
        Relationships: [];
      };
      // "channels" stays the DB table name (it backs both DMs and
      // space-scoped group chat via is_group / space_id) but rows where
      // space_id is set are labeled "Topic" everywhere in the UI/types
      // layer — see the `Topic` alias at the bottom of this file.
      channels: {
        Row: {
          id: string;
          is_group: boolean;
          name: string;
          space_id: string | null;
          topic: string;
          position: number;
          created_at: string;
          category_id: string | null;
          kind: 'text' | 'voice';
        };
        Insert: Partial<Database['public']['Tables']['channels']['Row']> & { name?: string };
        Update: Partial<Database['public']['Tables']['channels']['Row']>;
        Relationships: [];
      };
      space_roles: {
        Row: {
          id: string;
          space_id: string;
          name: string;
          color: string;
          permissions: Record<string, boolean>;
          position: number;
          is_default: boolean;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      space_member_roles: {
        Row: { space_id: string; user_id: string; role_id: string; granted_at: string };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      space_categories: {
        Row: { id: string; space_id: string; name: string; position: number; created_at: string };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      space_bans: {
        Row: { space_id: string; user_id: string; banned_by: string; reason: string; created_at: string };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      calls: {
        Row: { id: string; channel_id: string; started_by: string; started_at: string; ended_at: string | null };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      call_participants: {
        Row: { call_id: string; user_id: string; joined_at: string; left_at: string | null; muted: boolean };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      channel_members: {
        Row: { channel_id: string; user_id: string; joined_at: string };
        Insert: { channel_id: string; user_id: string };
        Update: Partial<Database['public']['Tables']['channel_members']['Row']>;
        Relationships: [];
      };
      messages: {
        Row: {
          id: number;
          channel_id: string;
          sender_id: string;
          body_raw: string;
          body_rendered: string;
          reply_to_id: number | null;
          edited_at: string | null;
          deleted: boolean;
          client_ref: string | null;
          expires_at: string | null;
          media_url: string | null;
          media_type: 'image' | 'audio' | null;
          created_at: string;
        };
        Insert: {
          channel_id: string;
          sender_id: string;
          body_raw: string;
          body_rendered: string;
          reply_to_id?: number | null;
          client_ref?: string | null;
          expires_at?: string | null;
          media_url?: string | null;
          media_type?: 'image' | 'audio' | null;
        };
        Update: Partial<Database['public']['Tables']['messages']['Row']>;
        Relationships: [];
      };
      message_reactions: {
        Row: { message_id: number; user_id: string; emoji: string };
        Insert: { message_id: number; user_id: string; emoji: string };
        Update: never;
        Relationships: [];
      };
      read_receipts: {
        Row: { channel_id: string; user_id: string; last_read_message_id: number; updated_at: string };
        Insert: { channel_id: string; user_id: string; last_read_message_id: number };
        Update: Partial<Database['public']['Tables']['read_receipts']['Row']>;
        Relationships: [];
      };
      pinned_messages: {
        Row: { message_id: number; channel_id: string; pinned_by: string; pinned_at: string };
        Insert: { message_id: number; channel_id: string; pinned_by: string };
        Update: never;
        Relationships: [];
      };
      posts: {
        Row: {
          id: number;
          author_id: string;
          body_raw: string;
          body_rendered: string;
          media_url: string;
          edited_at: string | null;
          created_at: string;
        };
        Insert: { author_id: string; body_raw: string; body_rendered: string; media_url?: string };
        Update: Partial<Pick<Database['public']['Tables']['posts']['Row'], 'body_raw' | 'body_rendered' | 'edited_at'>>;
        Relationships: [];
      };
      post_comments: {
        Row: {
          id: number;
          post_id: number;
          author_id: string;
          body_raw: string;
          body_rendered: string;
          edited_at: string | null;
          created_at: string;
        };
        Insert: { post_id: number; author_id: string; body_raw: string; body_rendered: string };
        Update: Partial<Pick<Database['public']['Tables']['post_comments']['Row'], 'body_raw' | 'body_rendered' | 'edited_at'>>;
        Relationships: [];
      };
      post_reactions: {
        Row: { post_id: number; user_id: string; emoji: string; created_at: string };
        Insert: { post_id: number; user_id: string; emoji: string };
        Update: never;
        Relationships: [];
      };
      notifications: {
        Row: {
          id: number;
          user_id: string;
          type: 'message' | 'reaction' | 'comment' | 'space_invite' | 'friend_request' | 'friend_accept';
          actor_id: string | null;
          actor_username: string;
          channel_id: string | null;
          post_id: number | null;
          body: string;
          read: boolean;
          created_at: string;
        };
        Insert: never; // notifications are created by DB triggers, never inserted from the client
        Update: { read?: boolean };
        Relationships: [];
      };
      friend_requests: {
        Row: {
          id: number;
          sender_id: string;
          recipient_id: string;
          status: 'pending' | 'accepted' | 'declined';
          created_at: string;
          responded_at: string | null;
        };
        Insert: { sender_id: string; recipient_id: string };
        Update: { status?: 'pending' | 'accepted' | 'declined'; responded_at?: string };
        Relationships: [];
      };
      blocked_users: {
        Row: { blocker_id: string; blocked_id: string; created_at: string };
        Insert: { blocker_id: string; blocked_id: string };
        Update: never;
        Relationships: [];
      };
      notification_preferences: {
        Row: {
          user_id: string;
          messages: boolean;
          reactions: boolean;
          comments: boolean;
          friend_requests: boolean;
          space_invites: boolean;
          notifications_enabled: boolean;
          follow_posts: boolean;
          friend_posts: boolean;
          updated_at: string;
        };
        Insert: never; // row is created automatically by a signup trigger
        Update: Partial<Pick<Database['public']['Tables']['notification_preferences']['Row'], 'messages' | 'reactions' | 'comments' | 'friend_requests' | 'space_invites' | 'notifications_enabled' | 'follow_posts' | 'friend_posts' | 'updated_at'>>;
        Relationships: [];
      };
      follows: {
        Row: { follower_id: string; followed_id: string; created_at: string };
        Insert: { follower_id: string; followed_id: string };
        Update: never;
        Relationships: [];
      };
      stories: {
        Row: {
          id: number;
          author_id: string;
          media_url: string;
          media_type: 'image' | 'video';
          duration_seconds: number | null;
          created_at: string;
          expires_at: string;
        };
        Insert: { author_id: string; media_url: string; media_type?: 'image' | 'video'; duration_seconds?: number | null };
        Update: never;
        Relationships: [];
      };
    };
    Views: {
      feed_view: {
        Row: {
          id: number;
          author_id: string;
          author_username: string;
          author_display_name: string;
          author_avatar_url: string;
          author_accent_top: string;
          author_accent_bottom: string;
          author_name_style: { font?: string; effect?: string; colors?: string[] } | null;
          body_rendered: string;
          media_url: string;
          hashtags: string[];
          created_at: string;
          edited_at: string | null;
          reaction_count: number;
          comment_count: number;
          my_reactions: string[];
        };
        Relationships: [];
      };
      friends_view: {
        Row: { user_id: string; friend_id: string; friends_since: string };
        Relationships: [];
      };
    };
    Functions: {
      channel_unread_counts: {
        Args: Record<string, never>;
        Returns: { channel_id: string; unread: number }[];
      };
      transfer_space_ownership: {
        Args: { p_space_id: string; p_new_owner: string };
        Returns: void;
      };
      leave_or_delete_space: {
        Args: { p_space_id: string };
        Returns: { deleted: boolean };
      };
      is_username_available: {
        Args: { p_username: string };
        Returns: boolean;
      };
      create_dm_channel: {
        Args: { other_user_id: string };
        Returns: string;
      };
      get_mutual_friends: {
        Args: { other_user_id: string };
        Returns: { friend_id: string; username: string; display_name: string; avatar_url: string; accent_color_top: string; accent_color_bottom: string }[];
      };
      send_friend_request: {
        Args: { p_recipient_id: string };
        Returns: string;
      };
      create_space_role: {
        Args: { p_space_id: string; p_name: string; p_color?: string };
        Returns: string;
      };
      update_space_role_permissions: {
        Args: { p_role_id: string; p_permissions: Record<string, boolean> };
        Returns: void;
      };
      update_space_role: {
        Args: { p_role_id: string; p_name: string; p_color: string };
        Returns: void;
      };
      delete_space_role: {
        Args: { p_role_id: string };
        Returns: void;
      };
      assign_space_role: {
        Args: { p_space_id: string; p_target_user_id: string; p_role_id: string };
        Returns: void;
      };
      unassign_space_role: {
        Args: { p_space_id: string; p_target_user_id: string; p_role_id: string };
        Returns: void;
      };
      space_member_has_permission: {
        Args: { p_space_id: string; p_user_id: string; p_permission: string };
        Returns: boolean;
      };
      create_space_category: {
        Args: { p_space_id: string; p_name: string };
        Returns: string;
      };
      reorder_space_channel: {
        Args: { p_channel_id: string; p_new_position: number };
        Returns: void;
      };
      create_space_channel: {
        Args: { p_space_id: string; p_name: string; p_kind?: string; p_category_id?: string | null };
        Returns: string;
      };
      kick_space_member: {
        Args: { p_space_id: string; p_target_user_id: string };
        Returns: void;
      };
      ban_space_member: {
        Args: { p_space_id: string; p_target_user_id: string; p_reason?: string };
        Returns: void;
      };
      unban_space_member: {
        Args: { p_space_id: string; p_target_user_id: string };
        Returns: void;
      };
      start_or_join_call: {
        Args: { p_channel_id: string };
        Returns: string;
      };
      leave_call: {
        Args: { p_call_id: string };
        Returns: void;
      };
      set_call_muted: {
        Args: { p_call_id: string; p_muted: boolean };
        Returns: void;
      };
    };
  };
}

export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Space = Database['public']['Tables']['spaces']['Row'];
export type Channel = Database['public']['Tables']['channels']['Row'];
/** UI-facing alias: a Channel row that belongs to a Space (space_id set) is a "Topic". */
export type Topic = Channel;
export type Message = Database['public']['Tables']['messages']['Row'];
export type Post = Database['public']['Tables']['posts']['Row'];
export type PostComment = Database['public']['Tables']['post_comments']['Row'];
export type PalSpaceNotification = Database['public']['Tables']['notifications']['Row'];
export type FriendRequest = Database['public']['Tables']['friend_requests']['Row'];
export type FeedItem = Database['public']['Views']['feed_view']['Row'];
