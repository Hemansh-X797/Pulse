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

/**
 * The "Following" feed tab — posts only from accounts you actually
 * follow, chronological. The `follows` table + follow/unfollow API has
 * existed since migration 017, and profile pages already show
 * follower/following counts and a Follow button, but the feed itself
 * had no way to filter down to just those people — the only feed was
 * the global one. Two queries (who you follow, then their posts) since
 * feed_view has no join back to `follows` to filter server-side in one
 * shot without a dedicated view; fine at this data volume, same
 * client-capped-then-filter approach the rest of feed.ts already uses
 * (see listTopPosts above).
 */
export async function listFollowingFeed(limit = 30): Promise<FeedItem[]> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return [];

  const { data: followingRows, error: followingError } = await supabase
    .from('follows')
    .select('followed_id')
    .eq('follower_id', userData.user.id);
  if (followingError) throw followingError;

  const followedIds = (followingRows ?? []).map((r) => r.followed_id);
  if (followedIds.length === 0) return [];

  const { data, error } = await supabase
    .from('feed_view')
    .select('*')
    .in('author_id', followedIds)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

/**
 * Explore's "top choices" — same view, ordered by a simple engagement
 * score (reactions weighted slightly above comments, since a comment
 * on your own post from yourself replying doesn't happen but a
 * self-reaction can't either — both counts already exclude nothing
 * special, this is just a reasonable default weighting, not tuned
 * against real usage data yet). Client-side computed sort since
 * ordering by a computed expression on a view needs either a second
 * generated column or client-side sort of a capped result set — the
 * latter is simpler and fine at this data volume.
 */
export async function listTopPosts(limit = 20): Promise<FeedItem[]> {
  const { data, error } = await supabase
    .from('feed_view')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200); // recent pool to rank within, not the whole table
  if (error) throw error;
  return (data ?? [])
    .map((post) => ({ post, score: post.reaction_count * 1.5 + post.comment_count }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.post);
}

/** Simple, honest account suggestions for the feed sidebar's "For You"
 * pill — accounts whose recent posts share a hashtag with your
 * interests, excluding anyone you already follow or are friends with.
 * Not a real recommendation model (that's meaningfully more work than
 * this pass covers), just a starting point for discovery. */
export async function getSuggestedAccounts(
  interests: string[],
  limit = 5
): Promise<{ id: string; username: string; display_name: string; avatar_url: string; accent_color_top: string; accent_color_bottom: string }[]> {
  if (interests.length === 0) return [];

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return [];

  const [postsRes, followingRes, friendsRes] = await Promise.all([
    supabase.from('feed_view').select('author_id').overlaps('hashtags', interests).order('created_at', { ascending: false }).limit(100),
    supabase.from('follows').select('followed_id').eq('follower_id', userData.user.id),
    supabase.from('friends_view').select('friend_id').eq('user_id', userData.user.id),
  ]);
  if (postsRes.error) throw postsRes.error;

  const excluded = new Set<string>([
    userData.user.id,
    ...(followingRes.data ?? []).map((r) => r.followed_id),
    ...(friendsRes.data ?? []).map((r) => r.friend_id),
  ]);

  const candidateIds = Array.from(new Set((postsRes.data ?? []).map((p) => p.author_id))).filter((id) => !excluded.has(id));
  if (candidateIds.length === 0) return [];

  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url, accent_color_top, accent_color_bottom')
    .in('id', candidateIds.slice(0, limit * 3));
  if (profilesError) throw profilesError;
  return (profiles ?? []).slice(0, limit);
}

/** Hashtag search for Explore — matches the generated `hashtags` array
 * column (021_post_hashtags_and_explore.sql), case-insensitive since
 * that column is already lowercased at generation time. */
export async function searchPostsByHashtag(tag: string, limit = 30): Promise<FeedItem[]> {
  const normalized = tag.replace(/^#/, '').toLowerCase();
  const { data, error } = await supabase
    .from('feed_view')
    .select('*')
    .contains('hashtags', [normalized])
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
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
