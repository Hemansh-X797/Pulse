'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, X, Loader2 } from 'lucide-react';
import { getMyProfile, updateProfile } from '../../lib/api/profile';
import { isUsernameAvailable } from '../../lib/api/friends';
import { getLinkedIdentities, linkProvider, unlinkProvider, getSession } from '../../lib/api/auth';
import { useAppStore } from '../../store/useAppStore';
import { Field, inputClass } from './shared';

export function AccountSettings() {
  const queryClient = useQueryClient();
  const storeProfile = useAppStore((s) => s.profile);
  const setStoreProfile = useAppStore((s) => s.setProfile);

  const { data: profile } = useQuery({ queryKey: ['my-profile'], queryFn: getMyProfile, initialData: storeProfile ?? undefined });
  const { data: session } = useQuery({ queryKey: ['session'], queryFn: getSession });

  const [username, setUsername] = useState(profile?.username ?? '');
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle');

  useEffect(() => {
    if (!profile || username === profile.username) {
      setUsernameStatus('idle');
      return;
    }
    const trimmed = username.trim();
    if (trimmed.length < 3 || !/^[a-z0-9_]+$/i.test(trimmed)) {
      setUsernameStatus('invalid');
      return;
    }
    setUsernameStatus('checking');
    const handle = setTimeout(() => {
      isUsernameAvailable(trimmed)
        .then((available) => setUsernameStatus(available ? 'available' : 'taken'))
        .catch(() => setUsernameStatus('idle'));
    }, 400);
    return () => clearTimeout(handle);
  }, [username, profile]);

  const saveUsernameMutation = useMutation({
    mutationFn: () => updateProfile({ username: username.trim() }),
    onSuccess: (updated) => {
      setStoreProfile(updated);
      queryClient.invalidateQueries({ queryKey: ['my-profile'] });
    },
  });

  const { data: identities = [] } = useQuery({ queryKey: ['linked-identities'], queryFn: getLinkedIdentities });
  const linkMutation = useMutation({ mutationFn: linkProvider });
  const unlinkMutation = useMutation({
    mutationFn: unlinkProvider,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['linked-identities'] }),
  });

  return (
    <div>
      <h1 className="mb-6 font-serif text-2xl font-semibold">Account</h1>

      <section className="mb-6 rounded-xl border border-[var(--color-hairline)] bg-[var(--color-surface)] p-5">
        <h2 className="mb-1 text-sm font-semibold text-[var(--color-ink)]">Status</h2>
        <p className="mb-3 text-[11.5px] text-[var(--color-ink-faint)]">
          What other people see next to your name while you&apos;re connected.
        </p>
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              { value: 'online' as const, label: 'Online', color: '#22c55e' },
              { value: 'dnd' as const, label: 'Do Not Disturb', color: '#ef4444' },
              { value: 'invisible' as const, label: 'Invisible', color: '#52525b' },
            ]
          ).map((opt) => (
            <button
              key={opt.value}
              onClick={async () => {
                const updated = await updateProfile({ status: opt.value });
                setStoreProfile(updated);
                queryClient.invalidateQueries({ queryKey: ['my-profile'] });
              }}
              className={`flex flex-col items-center gap-1.5 rounded-lg border p-2.5 ${
                profile?.status === opt.value ? 'border-[var(--presence-default-a)] bg-[var(--presence-default-a)]/10' : 'border-[var(--color-hairline)] hover:border-[var(--color-hairline-strong)]'
              }`}
            >
              <span className="h-3 w-3 rounded-full" style={{ background: opt.color }} />
              <span className="text-[11.5px] font-medium">{opt.label}</span>
            </button>
          ))}
        </div>
        {profile?.status === 'invisible' && (
          <p className="mt-2.5 text-[11px] text-[var(--color-ink-faint)]">
            You&apos;ll appear offline to everyone, but everything else still works normally.
          </p>
        )}
      </section>

      <section className="mb-6 rounded-xl border border-[var(--color-hairline)] bg-[var(--color-surface)] p-5">
        <h2 className="mb-4 text-sm font-semibold text-[var(--color-ink)]">Account info</h2>

        <Field label="Email" hint="Managed through your connected sign-in method below.">
          <input value={session?.user.email ?? ''} disabled className={`${inputClass} cursor-not-allowed opacity-60`} />
        </Field>

        <Field label="Username" hint={usernameStatus === 'invalid' ? '3+ characters, letters/numbers/underscore only.' : 'Unique across PalSpace.'}>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13.5px] text-[var(--color-ink-faint)]">@</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase())}
              maxLength={32}
              className={`${inputClass} pl-6 pr-8`}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2">
              {usernameStatus === 'checking' && <Loader2 size={14} className="animate-spin text-[var(--color-ink-faint)]" />}
              {usernameStatus === 'available' && <Check size={14} className="text-emerald-400" />}
              {(usernameStatus === 'taken' || usernameStatus === 'invalid') && <X size={14} className="text-red-400" />}
            </span>
          </div>
          {usernameStatus === 'taken' && <span className="mt-1 block text-[11px] text-red-400">That username is taken.</span>}
        </Field>

        <button
          onClick={() => saveUsernameMutation.mutate()}
          disabled={usernameStatus !== 'available' || saveUsernameMutation.isPending}
          className="rounded-full bg-[var(--color-ink)] px-5 py-2 text-[13px] font-semibold text-black disabled:opacity-40"
        >
          {saveUsernameMutation.isPending ? 'Saving…' : saveUsernameMutation.isSuccess ? 'Saved' : 'Save username'}
        </button>
      </section>

      <section className="rounded-xl border border-[var(--color-hairline)] bg-[var(--color-surface)] p-5">
        <h2 className="mb-1 text-sm font-semibold text-[var(--color-ink)]">Connected accounts</h2>
        <p className="mb-4 text-[13px] text-[var(--color-ink-muted)]">
          Sign in with any of these — they're all the same PalSpace account, not separate ones.
        </p>
        <div className="space-y-2">
          {(['google', 'discord', 'github'] as const).map((provider) => {
            const identity = identities.find((i) => i.provider === provider);
            const linked = Boolean(identity);
            const isLastMethod = identities.length <= 1;
            return (
              <div key={provider} className="flex items-center justify-between rounded-lg border border-[var(--color-hairline)] bg-[var(--color-surface-raised)] px-3.5 py-2.5">
                <span className="text-[13px] font-medium capitalize">{provider}</span>
                {linked ? (
                  <button
                    onClick={() => identity && unlinkMutation.mutate(identity)}
                    disabled={isLastMethod || unlinkMutation.isPending}
                    title={isLastMethod ? "Can't remove your only sign-in method" : undefined}
                    className="text-[12px] text-[var(--color-ink-muted)] hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Disconnect
                  </button>
                ) : (
                  <button
                    onClick={() => linkMutation.mutate(provider)}
                    className="rounded-full bg-[var(--color-surface-overlay)] px-3 py-1 text-[12px] font-medium text-[var(--color-ink)] hover:bg-[var(--color-hairline-strong)]"
                  >
                    Connect
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-[11px] text-[var(--color-ink-faint)]">
          Facebook and other providers need their own OAuth app set up first — ask if you want one added.
        </p>
      </section>

      <section>
        <h2 className="mb-1 text-sm font-semibold text-[var(--color-ink)]">Legal</h2>
        <div className="flex flex-wrap gap-4 text-[13px]">
          <Link href="/terms" target="_blank" className="text-[var(--color-ink-muted)] underline hover:text-[var(--color-ink)]">
            Terms of Service
          </Link>
          <Link href="/privacy" target="_blank" className="text-[var(--color-ink-muted)] underline hover:text-[var(--color-ink)]">
            Privacy Policy
          </Link>
          <Link href="/status" target="_blank" className="text-[var(--color-ink-muted)] underline hover:text-[var(--color-ink)]">
            System Status
          </Link>
        </div>
      </section>
    </div>
  );
}
