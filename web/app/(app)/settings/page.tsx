'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Only auto-jump into Profile on desktop, where the category nav is
// always visible alongside the content anyway (redirecting there just
// picks a sensible default pane). On mobile, /settings is its own
// screen — the category list *is* the content (see SettingsShell's
// isSettingsRoot branch) — so redirecting past it would make the list
// unreachable and turn the mobile "← Settings" back button into a
// redirect loop back into whatever category you just left.
export default function Page() {
  const router = useRouter();

  useEffect(() => {
    if (window.matchMedia('(min-width: 768px)').matches) {
      router.replace('/settings/profile');
    }
  }, [router]);

  return null;
}
