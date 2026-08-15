'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { getProfileByUsername } from '../lib/api/profile';
import { createOrGetDM } from '../lib/api/channels';

export function UserProfile() {
  const params = useParams<{ username: string }>();
  const username = params.username;
  const router = useRouter();
  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile', username],
    queryFn: () => getProfileByUsername(username),
  });

  async function handleMessage() {
    const channelId = await createOrGetDM(username);
    router.push(`/channels/@me/${channelId}`);
  }

  if (isLoading) return null;
  if (!profile) {
    return <div className="flex h-full items-center justify-center text-sm text-neutral-500">User not found.</div>;
  }

  return (
    <div className="h-full overflow-y-auto">
      <div
        className="h-40"
        style={{
          background: profile.banner_url
            ? `url(${profile.banner_url}) center/cover`
            : `linear-gradient(150deg, ${profile.accent_color_top}, ${profile.accent_color_bottom})`,
        }}
      />
      <div className="px-8 pb-8">
        <div
          className="-mt-10 mb-4 flex h-20 w-20 items-center justify-center rounded-full border-4 border-neutral-950 text-2xl font-bold text-black"
          style={{
            background: profile.avatar_url
              ? `url(${profile.avatar_url}) center/cover`
              : `linear-gradient(150deg, ${profile.accent_color_top}, ${profile.accent_color_bottom})`,
          }}
        >
          {!profile.avatar_url && profile.display_name.slice(0, 2).toUpperCase()}
        </div>
        <h1 className="font-serif text-2xl font-semibold">{profile.display_name}</h1>
        <p className="mb-1 text-sm text-neutral-500">
          @{profile.username} {profile.pronouns && `· ${profile.pronouns}`}
        </p>
        {profile.bio && <p className="mt-3 max-w-lg text-[14px] text-neutral-300">{profile.bio}</p>}
        <button
          onClick={handleMessage}
          className="mt-5 rounded-full bg-white px-5 py-2 text-[13px] font-semibold text-black hover:bg-neutral-200"
        >
          Message
        </button>

        {/* Instagram-style media grid: still a follow-up slice, not
            stubbed here on purpose — see notes in the original component. */}
        <div className="mt-10 border-t border-white/[0.07] pt-6">
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-neutral-500">Shared Media</h2>
          <p className="text-sm text-neutral-500">Media grid — next slice, not stubbed here on purpose.</p>
        </div>
      </div>
    </div>
  );
}
