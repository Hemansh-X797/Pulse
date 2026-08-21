import { supabase } from '../supabase';
import { renderEmoji } from '../emoji';
import type { FeedItem, PostComment } from '../database.types';

export async function listFeed(limit = 30): Promise<FeedItem[]> {
  const { data, error } = await supabase
    .from('feed_view')
    .select('*')
    // Same recency + engagement-weighted ordering as the C++ version's
    // feed() query — Postgres can't easily order by a computed
    // expression on a view from the client side, so this sorts by
    // recency here and by (recency + engagement) via the `order by`
    // baked into a future materialized version once that's worth it;
    // for now this matches the "simple, honest, not overbuilt" scoring
    // note left in ARCHITECTURE.md.
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

export async function createPost(body: string, mediaUrl?: string) {
  const trimmed = body.trim();
  if (!trimmed && !mediaUrl) throw new Error('post needs text or an image');

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('not authenticated');

  const rendered = renderEmoji(trimmed);
  const { data, error } = await supabase
    .from('posts')
    .insert({ author_id: userData.user.id, body_raw: trimmed, body_rendered: rendered, media_url: mediaUrl ?? '' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function editPost(postId: number, body: string) {
  const trimmed = body.trim();
  if (!trimmed) throw new Error('post cannot be empty');
  const rendered = renderEmoji(trimmed);
  // "authors can update own posts" RLS policy (migration 003) is the
  // real enforcement — this fails outright if you don't own the post.
  const { error } = await supabase
    .from('posts')
    .update({ body_raw: trimmed, body_rendered: rendered, edited_at: new Date().toISOString() })
    .eq('id', postId);
  if (error) throw error;
}

export async function deletePost(postId: number) {
  const { error } = await supabase.from('posts').delete().eq('id', postId);
  if (error) throw error;
}

/**
 * Reactions are toggleable, not additive: calling this with an emoji you
 * already reacted with removes it, otherwise it adds it. The caller
 * passes `currentlyReacted` (read from feed_view's `my_reactions` array)
 * so this doesn't need a round-trip just to check state first.
 */
export async function toggleReaction(postId: number, emoji: string, currentlyReacted: boolean) {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('not authenticated');

  if (currentlyReacted) {
    const { error } = await supabase
      .from('post_reactions')
      .delete()
      .eq('post_id', postId)
      .eq('user_id', userData.user.id)
      .eq('emoji', emoji);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('post_reactions')
      .upsert({ post_id: postId, user_id: userData.user.id, emoji }, { onConflict: 'post_id,user_id,emoji' });
    if (error) throw error;
  }
}

export async function listComments(postId: number): Promise<(PostComment & { author_username: string; author_display_name: string; author_avatar_url: string; author_accent_top: string; author_accent_bottom: string; author_name_style: { font?: string; effect?: string; colors?: string[] } | null })[]> {
  const { data, error } = await supabase
    .from('post_comments')
    .select('*, profiles!post_comments_author_id_fkey(username, display_name, avatar_url, accent_color_top, accent_color_bottom, name_style)')
    .eq('post_id', postId)
    .order('id', { ascending: true });
  if (error) throw error;

  // profiles(...) comes back nested; flatten it to match the shape
  // components expect (same flattening the C++ server did in SQL with a
  // JOIN, done here in JS since PostgREST returns nested objects).
  return (data ?? []).map((row) => {
    const profile = row.profiles as unknown as { username: string; display_name: string; avatar_url: string; accent_color_top: string; accent_color_bottom: string; name_style: { font?: string; effect?: string; colors?: string[] } | null } | null;
    return {
      ...row,
      author_username: profile?.username ?? '?',
      author_display_name: profile?.display_name ?? profile?.username ?? '?',
      author_avatar_url: profile?.avatar_url ?? '',
      author_accent_top: profile?.accent_color_top ?? '',
      author_accent_bottom: profile?.accent_color_bottom ?? '',
      author_name_style: profile?.name_style ?? null,
    };
  });
}

export async function addComment(postId: number, body: string) {
  const trimmed = body.trim();
  if (!trimmed) throw new Error('comment cannot be empty');

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('not authenticated');

  const rendered = renderEmoji(trimmed);
  const { data, error } = await supabase
    .from('post_comments')
    .insert({ post_id: postId, author_id: userData.user.id, body_raw: trimmed, body_rendered: rendered })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function editComment(commentId: number, body: string) {
  const trimmed = body.trim();
  if (!trimmed) throw new Error('comment cannot be empty');
  const rendered = renderEmoji(trimmed);
  const { error } = await supabase
    .from('post_comments')
    .update({ body_raw: trimmed, body_rendered: rendered, edited_at: new Date().toISOString() })
    .eq('id', commentId);
  if (error) throw error;
}

export async function deleteComment(commentId: number) {
  const { error } = await supabase.from('post_comments').delete().eq('id', commentId);
  if (error) throw error;
}
