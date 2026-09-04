'use client';

// NOTE: this is still the pre-rework signup form (email/password + OAuth
// buttons side by side). The "Google-only account creation, link everything
// else after" flow you asked for is a Phase 3 item (auth overhaul) — see
// MIGRATION_GUIDE.md — so it's intentionally not changed here yet.

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { signInWithPassword, signUpWithPassword, signInWithGoogle, signInWithDiscord, signInWithGithub } from '../lib/api/auth';

export function Login() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Used by /join/[code] to send someone here to log in, then land
  // straight back on the invite instead of just dumping them at /home
  // and losing the invite entirely — see the redirect-preserving note
  // in app/join/[code]/page.tsx.
  const redirectTo = searchParams.get('redirect');
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');

  async function handleSubmit() {
    setError('');
    try {
      if (mode === 'signup') {
        await signUpWithPassword(email, password, username, displayName || username);
        // New signups go through onboarding (interests + avatar +
        // starter spaces) before landing in the app; existing accounts
        // (backfilled to onboarding_completed = true by
        // 011_onboarding_and_public_spaces.sql) skip straight to /home.
        // A pending invite redirect is intentionally not threaded
        // through onboarding here (that flow has its own multi-step
        // navigation) — the invite link itself doesn't expire, so a
        // brand-new signup can just click it again once onboarding's done.
        router.push('/onboarding');
      } else {
        await signInWithPassword(email, password);
        router.push(redirectTo || '/home');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'something went wrong');
    }
  }

  return (
    <div className="flex h-screen w-full">
      <div
        className="hidden flex-[0_0_42%] max-w-[620px] bg-cover bg-center md:block"
        style={{ backgroundImage: "url('/auth-scene.svg')" }}
        role="img"
        aria-label="Dusk over rolling hills"
      />
      <div className="flex flex-1 items-center justify-center bg-[var(--color-void)] p-10 text-[var(--color-ink)]">
        <div className="w-full max-w-[340px]">
          <div className="mb-16 flex items-center justify-center gap-2">
            <span className="h-[7px] w-[7px] rounded-full presence-fill" />
            <span className="font-serif text-xl font-semibold">PalSpace</span>
          </div>

          <h1 className="mb-2.5 text-center font-serif text-3xl font-semibold">
            {mode === 'signup' ? 'Join PalSpace' : 'Welcome back'}
          </h1>
          <p className="mb-9 text-center text-[13.5px] text-[var(--color-ink-muted)]">
            {mode === 'signup' ? "pick a username, we'll handle the rest" : 'sign in to pick up where you left off'}
          </p>

          <div className="mb-6 flex flex-col gap-2.5">
            {mode === 'signup' && (
              <>
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Display name"
                  className="w-full rounded-full border border-[var(--color-hairline)] bg-[var(--color-surface)] px-5 py-3.5 text-center text-sm text-[var(--color-ink)] placeholder-[var(--color-ink-faint)] outline-none focus:border-white/20"
                />
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Username"
                  className="w-full rounded-full border border-[var(--color-hairline)] bg-[var(--color-surface)] px-5 py-3.5 text-center text-sm text-[var(--color-ink)] placeholder-[var(--color-ink-faint)] outline-none focus:border-white/20"
                />
              </>
            )}
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              type="email"
              className="w-full rounded-full border border-[var(--color-hairline)] bg-[var(--color-surface)] px-5 py-3.5 text-center text-sm text-[var(--color-ink)] placeholder-[var(--color-ink-faint)] outline-none focus:border-white/20"
            />
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              type="password"
              className="w-full rounded-full border border-[var(--color-hairline)] bg-[var(--color-surface)] px-5 py-3.5 text-center text-sm text-[var(--color-ink)] placeholder-[var(--color-ink-faint)] outline-none focus:border-white/20"
            />
          </div>

          <button
            onClick={handleSubmit}
            className="mx-auto block rounded-full bg-white px-8 py-3 text-[13.5px] font-semibold text-black transition hover:bg-[var(--color-ink)]/90 active:scale-95"
          >
            {mode === 'signup' ? 'Create account' : "Let's go"}
          </button>
          <div className="mt-3.5 min-h-[16px] text-center text-xs text-red-400">{error}</div>

          {mode === 'signup' && (
            <p className="mx-auto mt-2 max-w-[280px] text-center text-[11px] leading-relaxed text-[var(--color-ink-faint)]">
              By creating an account you agree to PalSpace&apos;s{' '}
              <Link href="/terms" target="_blank" className="underline hover:text-[var(--color-ink-muted)]">
                Terms
              </Link>{' '}
              and{' '}
              <Link href="/privacy" target="_blank" className="underline hover:text-[var(--color-ink-muted)]">
                Privacy Policy
              </Link>
              .
            </p>
          )}

          <div className="my-8 flex items-center gap-3 text-[11.5px] text-[var(--color-ink-muted)]">
            <span className="h-px flex-1 bg-white/[0.07]" />
            or continue with
            <span className="h-px flex-1 bg-white/[0.07]" />
          </div>

          <div className="flex justify-center gap-3.5">
            <button
              onClick={() => signInWithGoogle()}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--color-hairline)] bg-[var(--color-surface)] transition hover:-translate-y-0.5 hover:bg-[var(--color-surface-raised)]"
              aria-label="Continue with Google"
            >
              <GoogleIcon />
            </button>
            <button
              onClick={() => signInWithDiscord()}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-[#5865F2] transition hover:-translate-y-0.5 hover:bg-[#6771f5]"
              aria-label="Continue with Discord"
            >
              <DiscordIcon />
            </button>
            <button
              onClick={() => signInWithGithub()}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--color-hairline)] bg-[#181717] transition hover:-translate-y-0.5 hover:bg-[#24292e]"
              aria-label="Continue with GitHub"
            >
              <GithubIcon />
            </button>
          </div>

          <div className="mt-7 text-center text-[12.5px] text-[var(--color-ink-muted)]">
            {mode === 'signup' ? (
              <>
                Already have an account?{' '}
                <button onClick={() => setMode('login')} className="border-b border-white/30 font-medium text-[var(--color-ink)]">
                  Log in
                </button>
              </>
            ) : (
              <>
                New here?{' '}
                <button onClick={() => setMode('signup')} className="border-b border-white/30 font-medium text-[var(--color-ink)]">
                  Create an account
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 48 48">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.9-2.26 5.36-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59A14.5 14.5 0 0 1 9.5 24c0-1.59.27-3.13.76-4.59l-7.98-6.19A23.94 23.94 0 0 0 0 24c0 3.86.92 7.51 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.92-2.14 15.89-5.82l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.97 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

function GithubIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="white">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

function DiscordIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 127.14 96.36">
      <path
        fill="#ffffff"
        d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2A68.68,68.68,0,0,1,87.53,85a77,77,0,0,0,6.89,11.36A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z"
      />
    </svg>
  );
}
