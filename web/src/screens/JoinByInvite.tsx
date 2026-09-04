'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2, TriangleAlert } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { joinSpaceByInvite } from '../lib/api/spaces';

/**
 * Redeems a space invite code. This route existing at all is the fix:
 * SpaceSettingsModal's Invites tab has handed out links shaped exactly
 * like `${origin}/join/${code}` since it was built, and
 * joinSpaceByInvite() has existed in spaces.ts just as long — but there
 * was never an app/join/[code] route to receive that link, so every
 * invite link anyone copied and sent to a friend 404'd. The only
 * working way to redeem a code was typing it manually into a separate
 * "have an invite code?" modal buried in the space-switcher — the
 * shareable link itself, the thing people actually paste into a chat,
 * never worked.
 */
export function JoinByInvite() {
  const router = useRouter();
  const params = useParams<{ code: string }>()!;
  const [status, setStatus] = useState<'checking' | 'joining' | 'error'>('checking');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (!data.session) {
        // Not logged in — send to login, remembering this exact invite
        // so signing in lands the person straight back here instead of
        // just dumping them at /home having lost the invite entirely.
        router.replace(`/login?redirect=${encodeURIComponent(`/join/${params.code}`)}`);
        return;
      }
      setStatus('joining');
      joinSpaceByInvite(params.code)
        .then((space) => {
          if (!cancelled) router.replace(`/spaces/${space.id}`);
        })
        .catch((e) => {
          if (!cancelled) {
            setStatus('error');
            setError(e instanceof Error ? e.message : 'This invite link is invalid or has expired.');
          }
        });
    });

    return () => {
      cancelled = true;
    };
  }, [params.code, router]);

  return (
    <div className="flex h-screen w-full flex-col items-center justify-center gap-4 bg-[var(--color-void)] px-6 text-center text-[var(--color-ink)]">
      {status === 'error' ? (
        <>
          <TriangleAlert size={28} className="text-red-400" />
          <p className="max-w-xs text-[13.5px] text-[var(--color-ink-muted)]">{error}</p>
          <Link href="/home" className="mt-2 rounded-full bg-white px-5 py-2 text-[13px] font-semibold text-black">
            Go to PalSpace
          </Link>
        </>
      ) : (
        <>
          <Loader2 size={24} className="animate-spin text-[var(--color-ink-muted)]" />
          <p className="text-[13px] text-[var(--color-ink-muted)]">{status === 'joining' ? 'Joining space…' : 'Checking invite…'}</p>
        </>
      )}
    </div>
  );
}
