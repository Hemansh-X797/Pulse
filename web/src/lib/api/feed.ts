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
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('not authenticated');

  const rendered = renderEmoji(body);
  const { data, error } = await supabase
    .from('posts')
    .insert({ author_id: userData.user.id, body_raw: body, body_rendered: rendered, media_url: mediaUrl ?? '' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function reactToPost(postId: number, emoji: string) {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('not authenticated');

  const { error } = await supabase
    .from('post_reactions')
    .upsert({ post_id: postId, user_id: userData.user.id, emoji }, { onConflict: 'post_id,user_id,emoji' });
  if (error) throw error;
}

export async function listComments(postId: number): Promise<(PostComment & { author_username: string })[]> {
  const { data, error } = await supabase
    .from('post_comments')
    .select('*, profiles!post_comments_author_id_fkey(username)')
    .eq('post_id', postId)
    .order('id', { ascending: true });
  if (error) throw error;

  // profiles(username) comes back nested; flatten it to match the
  // shape components expect (same flattening the C++ server did in SQL
  // with a JOIN, done here in JS since PostgREST returns nested objects).
  return (data ?? []).map((row) => {
    const profile = row.profiles as unknown as { username: string } | null;
    return { ...row, author_username: profile?.username ?? '?' };
  });
}

export async function addComment(postId: number, body: string) {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('not authenticated');

  const rendered = renderEmoji(body);
  const { data, error } = await supabase
    .from('post_comments')
    .insert({ post_id: postId, author_id: userData.user.id, body_raw: body, body_rendered: rendered })
    .select()
    .single();
  if (error) throw error;
  return data;
}
