'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAppStore } from '../store/useAppStore';

// This replaces the old single "?" avatar button in GlobalNav that
// instantly signed you out with no confirmation. Logout now lives here,
// behind a confirm step. This is a minimal shell for now — the full
// profile customization panel (display name, avatar, banner, accent
// colors, pronouns, bio, connected accounts) is scoped as a Phase 2 item,
// not bundled into this migration pass.
export function Settings() {
  const router = useRouter();
  const profile = useAppStore((s) => s.profile);
  const reset = useAppStore((s) => s.reset);
  const [confirmingLogout, setConfirmingLogout] = useState(false);

  async function handleConfirmLogout() {
    await supabase.auth.signOut();
    reset();
    router.push('/login');
  }

  return (
    <div className="mx-auto h-full max-w-2xl overflow-y-auto px-8 py-10">
      <h1 className="mb-6 font-serif text-2xl font-semibold">Settings</h1>

      <section className="mb-8 rounded-2xl border border-white/[0.07] bg-neutral-900/60 p-6">
        <h2 className="mb-1 text-sm font-semibold text-white">Profile</h2>
        <p className="mb-4 text-[13px] text-neutral-500">
          Signed in as <span className="text-neutral-300">@{profile?.username ?? '…'}</span>
        </p>
        <p className="text-[12.5px] text-neutral-600">
          Full profile customization (avatar, banner, accent colors, bio, pronouns, connected accounts) lands here in
          the next pass.
        </p>
      </section>

      <section className="rounded-2xl border border-red-500/20 bg-red-500/[0.04] p-6">
        <h2 className="mb-1 text-sm font-semibold text-red-300">Account</h2>
        <p className="mb-4 text-[13px] text-neutral-500">Sign out of PalSpace on this device.</p>

        {!confirmingLogout ? (
          <button
            onClick={() => setConfirmingLogout(true)}
            className="flex items-center gap-2 rounded-full border border-red-500/30 bg-red-500/10 px-4 py-2 text-[13px] font-medium text-red-300 hover:bg-red-500/20"
          >
            <LogOut size={14} /> Log out
          </button>
        ) : (
          <div className="flex items-center gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
            <span className="text-[13px] text-red-200">Log out of PalSpace?</span>
            <button
              onClick={handleConfirmLogout}
              className="rounded-full bg-red-500 px-3.5 py-1.5 text-[12.5px] font-semibold text-white hover:bg-red-400"
            >
              Yes, log out
            </button>
            <button
              onClick={() => setConfirmingLogout(false)}
              className="flex items-center gap-1 rounded-full px-3 py-1.5 text-[12.5px] text-neutral-400 hover:text-white"
            >
              <X size={13} /> Cancel
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
