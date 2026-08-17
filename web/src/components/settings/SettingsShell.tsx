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

  async function handleConfirmLogout() {
    await supabase.auth.signOut();
    reset();
    router.push('/login');
  }

  return (
    <div className="flex h-full">
      <nav className="flex w-[240px] shrink-0 flex-col border-r border-[var(--color-hairline)] bg-[var(--color-surface)] px-3 py-6">
        <div className="mb-4 px-2 font-mono text-[10px] font-medium uppercase tracking-wider text-[var(--color-ink-faint)]">
          User Settings
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

      <div className="relative flex-1 overflow-y-auto">
        <Link
          href="/home"
          className="absolute right-6 top-6 flex h-9 w-9 items-center justify-center rounded-full border border-[var(--color-hairline)] text-[var(--color-ink-muted)] hover:border-[var(--color-hairline-strong)] hover:text-[var(--color-ink)]"
          aria-label="Close settings"
        >
          <X size={16} />
        </Link>
        <div className="mx-auto max-w-xl px-8 py-9">{children}</div>
      </div>
    </div>
  );
}
