import { supabase } from '../supabase';

export interface StoryProfile {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string;
  accent_color_top: string;
  accent_color_bottom: string;
}

export interface StoryGroup {
  author: StoryProfile;
  stories: { id: number; media_url: string; created_at: string; expires_at: string }[];
}

export async function createStory(mediaUrl: string) {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('not authenticated');
  const { error } = await supabase.from('stories').insert({ author_id: userData.user.id, media_url: mediaUrl });
  if (error) throw error;
}

/**
 * Active stories (RLS already filters to non-expired + yours/friends'),
 * grouped by author so the tray can render one ring per person instead
 * of one item per story.
 */
export async function listActiveStoryGroups(): Promise<StoryGroup[]> {
  const { data, error } = await supabase
    .from('stories')
    .select('id, media_url, created_at, expires_at, author:author_id(id, username, display_name, avatar_url, accent_color_top, accent_color_bottom)')
    .order('created_at', { ascending: true });
  if (error) throw error;

  const groups = new Map<string, StoryGroup>();
  for (const row of data ?? []) {
    const author = row.author as unknown as StoryProfile;
    if (!groups.has(author.id)) groups.set(author.id, { author, stories: [] });
    groups.get(author.id)!.stories.push({ id: row.id, media_url: row.media_url, created_at: row.created_at, expires_at: row.expires_at });
  }
  // Your own group first (if you have one), so you always see your story
  // at the front of the tray the way Instagram does.
  const { data: userData } = await supabase.auth.getUser();
  const arr = Array.from(groups.values());
  arr.sort((a, b) => (a.author.id === userData.user?.id ? -1 : b.author.id === userData.user?.id ? 1 : 0));
  return arr;
}

export async function deleteStory(storyId: number) {
  const { error } = await supabase.from('stories').delete().eq('id', storyId);
  if (error) throw error;
}
