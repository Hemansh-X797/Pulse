'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { X, User, KeyRound, ShieldCheck, Bell, Palette, LogOut } from 'lucide-react';
import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAppStore } from '../../store/useAppStore';

const CATEGORIES = [
  { href: '/settings/profile', label: 'Profile', icon: User },
  { href: '/settings/account', label: 'Account', icon: KeyRound },
  { href: '/settings/privacy', label: 'Privacy & Safety', icon: ShieldCheck },
  { href: '/settings/notifications', label: 'Notifications', icon: Bell },
  { href: '/settings/appearance', label: 'Appearance', icon: Palette },
] as const;

export function SettingsShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '';
  const router = useRouter();
  const reset = useAppStore((s) => s.reset);
  const [confirmingLogout, setConfirmingLogout] = useState(false);

  // Same list/detail split as the main AppShell, for the same reason:
  // a 240px settings nav plus real content doesn't fit on a phone
  // screen. /settings itself (the bare root) shows the category list
  // full-width; picking a category shows just that page with a back
  // link, mirroring how the chat back button works.
  const isSettingsRoot = pathname === '/settings';

  async function handleConfirmLogout() {
    await supabase.auth.signOut();
    reset();
    router.push('/login');
  }

  return (
    <div className="flex h-full flex-col md:flex-row">
      <nav
        className={`${isSettingsRoot ? 'flex' : 'hidden'} w-full shrink-0 flex-col border-r border-[var(--color-hairline)] bg-[var(--color-surface)] px-3 py-6 md:flex md:w-[240px]`}
      >
        <div className="mb-4 flex items-center justify-between px-2">
          <span className="font-mono text-[10px] font-medium uppercase tracking-wider text-[var(--color-ink-faint)]">User Settings</span>
          <Link href="/home" className="text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] md:hidden" aria-label="Close settings">
            <X size={16} />
          </Link>
        </div>
        {CATEGORIES.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`mb-0.5 flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] font-medium transition-colors ${
                active ? 'bg-[var(--color-surface-raised)] text-[var(--color-ink)]' : 'text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-raised)]/60 hover:text-[var(--color-ink)]'
              }`}
            >
              <Icon size={16} /> {label}
            </Link>
          );
        })}

        <div className="my-3 h-px bg-[var(--color-hairline)]" role="separator" />

        {!confirmingLogout ? (
          <button
            onClick={() => setConfirmingLogout(true)}
            className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] font-medium text-red-400 hover:bg-red-500/10"
          >
            <LogOut size={16} /> Log Out
          </button>
        ) : (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-2.5">
            <p className="mb-2 text-[12px] text-red-200">Log out of PalSpace?</p>
            <div className="flex gap-2">
              <button onClick={handleConfirmLogout} className="rounded-full bg-red-500 px-3 py-1 text-[11.5px] font-semibold text-white">
                Yes
              </button>
              <button onClick={() => setConfirmingLogout(false)} className="rounded-full px-3 py-1 text-[11.5px] text-[var(--color-ink-muted)]">
                Cancel
              </button>
            </div>
          </div>
        )}
      </nav>

      <div className={`relative flex-1 overflow-y-auto ${isSettingsRoot ? 'hidden md:block' : 'block'}`}>
        <button
          onClick={() => (isSettingsRoot ? router.push('/home') : router.push('/settings'))}
          className="absolute right-6 top-6 hidden h-9 w-9 items-center justify-center rounded-full border border-[var(--color-hairline)] text-[var(--color-ink-muted)] hover:border-[var(--color-hairline-strong)] hover:text-[var(--color-ink)] md:flex"
          aria-label="Close settings"
        >
          <X size={16} />
        </button>
        {/* Mobile-only back-to-categories link, since the desktop X
            above (which exits settings entirely) isn't the right
            action here — going back one level, not leaving settings,
            is what "back" should mean once you're inside a category. */}
        <button
          onClick={() => router.push('/settings')}
          className="mb-2 flex items-center gap-1.5 px-4 pt-4 text-[13px] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] md:hidden"
        >
          ← Settings
        </button>
        <div className={`mx-auto px-5 py-4 md:px-8 md:py-9 ${pathname === '/settings/profile' ? 'max-w-4xl' : 'max-w-xl'}`}>{children}</div>
      </div>
    </div>
  );
}
