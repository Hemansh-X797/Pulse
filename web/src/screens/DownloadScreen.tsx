'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Globe, Laptop, Smartphone, CheckCircle2 } from 'lucide-react';
import { DownloadButton } from '../components/DownloadButton';
import { useInstallPrompt } from '../hooks/useInstallPrompt';

type Platform = 'ios' | 'android' | 'desktop' | 'unknown';

function detectPlatform(): Platform {
  if (typeof window === 'undefined') return 'unknown';
  const ua = window.navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua) && !(window as unknown as { MSStream?: unknown }).MSStream) return 'ios';
  if (/Android/.test(ua)) return 'android';
  if (/Win|Mac|Linux/.test(window.navigator.platform || ua)) return 'desktop';
  return 'unknown';
}

const WHY_PWA = [
  'One codebase, every platform — no separate App Store build lagging behind the web version.',
  'Installs in seconds, no app store account or review wait.',
  'Same real-time connection as the browser — nothing is a stripped-down "lite" version.',
  'Updates the instant you reload it, no manual "update available" nagging.',
];

export function DownloadScreen() {
  const [platform, setPlatform] = useState<Platform>('unknown');
  const { installed } = useInstallPrompt();

  useEffect(() => {
    setPlatform(detectPlatform());
  }, []);

  return (
    <div className="flex min-h-screen w-full flex-col bg-[var(--color-void)] text-[var(--color-ink)]">
      <header className="flex h-16 shrink-0 items-center justify-between px-6 md:px-10">
        <Link href="/" className="flex items-center gap-2">
          <img
            src="/logo.svg"
            alt=""
            className="h-6 w-6"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
          <span className="font-serif text-lg font-semibold">PalSpace</span>
        </Link>
        <Link href="/login" className="text-[13px] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]">
          Log in
        </Link>
      </header>

      <main className="flex flex-1 flex-col items-center px-6 py-14 text-center md:px-10">
        <h1 className="mb-3 max-w-xl font-serif text-3xl font-semibold leading-tight md:text-5xl">Get PalSpace on your device</h1>
        <p className="mb-8 max-w-md text-[14.5px] leading-relaxed text-[var(--color-ink-muted)]">
          A real install — its own icon, its own window, no browser bar — in about two taps.
        </p>

        {installed ? (
          <div className="mb-10 flex items-center gap-2 rounded-full border border-[var(--presence-default-a)]/40 bg-[var(--presence-default-a)]/10 px-5 py-2.5 text-[13px] font-medium">
            <CheckCircle2 size={16} className="text-[var(--presence-default-a)]" />
            PalSpace is already installed on this device.
          </div>
        ) : (
          <div className="mb-10">
            <DownloadButton size="lg" />
          </div>
        )}

        <div className="grid w-full max-w-3xl grid-cols-1 gap-3.5 text-left sm:grid-cols-3">
          <PlatformCard
            icon={Smartphone}
            title="iOS"
            active={platform === 'ios'}
            steps={['Open this page in Safari', 'Tap Share, then "Add to Home Screen"', 'Tap Add — done']}
          />
          <PlatformCard
            icon={Smartphone}
            title="Android"
            active={platform === 'android'}
            steps={['Tap "Download PalSpace" above', 'Confirm the install prompt', 'PalSpace opens like any other app']}
          />
          <PlatformCard
            icon={Laptop}
            title="Desktop"
            active={platform === 'desktop'}
            steps={['Tap "Download PalSpace" above', 'Confirm in Chrome/Edge\'s install dialog', 'PalSpace opens in its own window']}
          />
        </div>

        <div className="mt-4 flex items-center gap-1.5 text-[11.5px] text-[var(--color-ink-faint)]">
          <Globe size={12} /> Works best on Chrome, Edge, or Safari. Firefox doesn't support installing web apps yet.
        </div>

        <div className="mt-16 w-full max-w-md text-left">
          <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-[0.15em] text-[var(--color-ink-faint)]">Why not an app store build?</h2>
          <ul className="space-y-2.5">
            {WHY_PWA.map((point) => (
              <li key={point} className="flex items-start gap-2.5 text-[13px] leading-relaxed text-[var(--color-ink-muted)]">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full presence-fill" />
                {point}
              </li>
            ))}
          </ul>
        </div>
      </main>

      <footer className="flex items-center justify-center border-t border-[var(--color-hairline)] px-6 py-6 text-[12px] text-[var(--color-ink-faint)]">
        <span>© {new Date().getFullYear()} PalSpace</span>
      </footer>
    </div>
  );
}

function PlatformCard({
  icon: Icon,
  title,
  active,
  steps,
}: {
  icon: typeof Smartphone;
  title: string;
  active: boolean;
  steps: string[];
}) {
  return (
    <div
      className={`rounded-2xl border p-5 transition-colors ${
        active ? 'border-[var(--presence-default-a)]/50 bg-[var(--presence-default-a)]/[0.06]' : 'border-[var(--color-hairline)] bg-[var(--color-surface)]'
      }`}
    >
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-surface-raised)] text-[var(--presence-default-a)]">
          <Icon size={15} />
        </div>
        <span className="text-[13.5px] font-semibold">{title}</span>
        {active && <span className="ml-auto rounded-full bg-[var(--presence-default-a)]/15 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wide text-[var(--presence-default-a)]">You're here</span>}
      </div>
      <ol className="space-y-1.5">
        {steps.map((step, i) => (
          <li key={step} className="flex items-start gap-2 text-[12px] leading-relaxed text-[var(--color-ink-muted)]">
            <span className="mt-0.5 shrink-0 font-mono text-[10px] text-[var(--color-ink-faint)]">{i + 1}.</span>
            {step}
          </li>
        ))}
      </ol>
    </div>
  );
}
