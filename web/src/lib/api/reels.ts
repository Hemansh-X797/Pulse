import { supabase } from '../supabase';
import { renderEmoji } from '../emoji';

export interface Reel {
  id: number;
  author_id: string;
  author_username: string;
  author_display_name: string;
  author_avatar_url: string;
  author_avatar_decoration: string | null;
  author_accent_top: string;
  author_accent_bottom: string;
  author_name_style: { font?: string; effect?: string; colors?: string[] } | null;
  video_url: string;
  caption_rendered: string;
  created_at: string;
  like_count: number;
  comment_count: number;
  liked_by_me: boolean;
}

export interface ReelComment {
  id: number;
  reel_id: number;
  author_id: string;
  author_username: string;
  author_display_name: string;
  author_avatar_url: string;
  body_rendered: string;
  created_at: string;
}

export async function listReels(limit = 20): Promise<Reel[]> {
  const { data, error } = await supabase.from('reel_feed_view').select('*').order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function createReel(videoUrl: string, caption: string) {
  const trimmed = caption.trim();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('not authenticated');

  const { data, error } = await supabase
    .from('reels')
    .insert({ author_id: userData.user.id, video_url: videoUrl, caption: trimmed, caption_rendered: renderEmoji(trimmed) })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteReel(reelId: number) {
  const { error } = await supabase.from('reels').delete().eq('id', reelId);
  if (error) throw error;
}

export async function toggleReelLike(reelId: number, currentlyLiked: boolean) {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('not authenticated');

  if (currentlyLiked) {
    const { error } = await supabase.from('reel_likes').delete().eq('reel_id', reelId).eq('user_id', userData.user.id);
    if (error) throw error;
  } else {
    // Same "insert, ignore a duplicate-key collision" pattern the
    // message-reaction toggle uses — a double-tap racing two toggles in
    // flight should end up liked, not throw a visible error over a
    // harmless PK collision.
    const { error } = await supabase.from('reel_likes').insert({ reel_id: reelId, user_id: userData.user.id });
    if (error && error.code !== '23505') throw error;
  }
}

export async function listReelComments(reelId: number): Promise<ReelComment[]> {
  const { data, error } = await supabase
    .from('reel_comments')
    .select('*, profiles!reel_comments_author_id_fkey(username, display_name, avatar_url)')
    .eq('reel_id', reelId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => {
    const profile = row.profiles as unknown as { username: string; display_name: string; avatar_url: string };
    return {
      id: row.id,
      reel_id: row.reel_id,
      author_id: row.author_id,
      author_username: profile?.username ?? '',
      author_display_name: profile?.display_name ?? '',
      author_avatar_url: profile?.avatar_url ?? '',
      body_rendered: row.body_rendered,
      created_at: row.created_at,
    };
  });
}

export async function addReelComment(reelId: number, body: string) {
  const trimmed = body.trim();
  if (!trimmed) throw new Error('comment cannot be empty');
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('not authenticated');

  const { error } = await supabase
    .from('reel_comments')
    .insert({ reel_id: reelId, author_id: userData.user.id, body_raw: trimmed, body_rendered: renderEmoji(trimmed) });
  if (error) throw error;
}
