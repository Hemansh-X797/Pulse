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
        };
        Insert: Partial<Database['public']['Tables']['profiles']['Row']> & { id: string; username: string; display_name: string };
        Update: Partial<Database['public']['Tables']['profiles']['Row']>;
        Relationships: [];
      };
      servers: {
        Row: {
          id: string;
          name: string;
          icon_url: string;
          accent_color_top: string;
          accent_color_bottom: string;
          owner_id: string;
          invite_code: string;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['servers']['Row']> & { name: string; owner_id: string };
        Update: Partial<Database['public']['Tables']['servers']['Row']>;
        Relationships: [];
      };
      server_members: {
        Row: { server_id: string; user_id: string; role: 'owner' | 'admin' | 'member'; joined_at: string };
        Insert: { server_id: string; user_id: string; role?: 'owner' | 'admin' | 'member' };
        Update: Partial<Database['public']['Tables']['server_members']['Row']>;
        Relationships: [];
      };
      channels: {
        Row: {
          id: string;
          is_group: boolean;
          name: string;
          server_id: string | null;
          topic: string;
          position: number;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['channels']['Row']> & { name?: string };
        Update: Partial<Database['public']['Tables']['channels']['Row']>;
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
      posts: {
        Row: {
          id: number;
          author_id: string;
          body_raw: string;
          body_rendered: string;
          media_url: string;
          created_at: string;
        };
        Insert: { author_id: string; body_raw: string; body_rendered: string; media_url?: string };
        Update: never;
        Relationships: [];
      };
      post_comments: {
        Row: {
          id: number;
          post_id: number;
          author_id: string;
          body_raw: string;
          body_rendered: string;
          created_at: string;
        };
        Insert: { post_id: number; author_id: string; body_raw: string; body_rendered: string };
        Update: never;
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
          type: 'message' | 'reaction' | 'comment' | 'server_invite';
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
    };
    Views: {
      feed_view: {
        Row: {
          id: number;
          author_id: string;
          author_username: string;
          author_display_name: string;
          author_avatar_url: string;
          body_rendered: string;
          media_url: string;
          created_at: string;
          reaction_count: number;
          comment_count: number;
        };
        Relationships: [];
      };
    };
    Functions: {
      channel_unread_counts: {
        Args: Record<string, never>;
        Returns: { channel_id: string; unread: number }[];
      };
    };
  };
}

export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Server = Database['public']['Tables']['servers']['Row'];
export type Channel = Database['public']['Tables']['channels']['Row'];
export type Message = Database['public']['Tables']['messages']['Row'];
export type Post = Database['public']['Tables']['posts']['Row'];
export type PostComment = Database['public']['Tables']['post_comments']['Row'];
export type PulseNotification = Database['public']['Tables']['notifications']['Row'];
export type FeedItem = Database['public']['Views']['feed_view']['Row'];
