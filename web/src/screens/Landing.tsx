'use client';

import Link from 'next/link';
import { MessageCircle, Rss, Compass, Camera, ArrowRight } from 'lucide-react';
import { DownloadButton } from '../components/DownloadButton';

const FEATURES = [
  {
    icon: MessageCircle,
    title: 'Chat',
    description: 'Real-time DMs and group chats — markdown, GIFs, voice notes, disappearing messages.',
  },
  {
    icon: Rss,
    title: 'Feed',
    description: 'Post, react, comment — with real display-name styling and link previews built in.',
  },
  {
    icon: Compass,
    title: 'Spaces',
    description: 'Communities you own or join — public or invite-only, your call.',
  },
  {
    icon: Camera,
    title: 'Stories',
    description: 'Photos and video, up to 30 seconds, gone in 24 hours.',
  },
];

export function Landing() {
  return (
    <div className="flex min-h-screen w-full flex-col bg-[var(--color-void)] text-[var(--color-ink)]">
      <header className="flex h-16 shrink-0 items-center justify-between px-6 md:px-10">
        <div className="flex items-center gap-2">
          <img
            src="/logo.svg"
            alt=""
            className="h-6 w-6"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
          <span className="font-serif text-lg font-semibold">PalSpace</span>
        </div>
        <nav className="flex items-center gap-4">
          <DownloadButton size="md" />
          <Link href="/login" className="text-[13px] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]">
            Log in
          </Link>
          <Link
            href="/login"
            className="rounded-full bg-white px-4 py-1.5 text-[13px] font-semibold text-black transition-colors hover:bg-[var(--color-ink-muted)]"
          >
            Get started
          </Link>
        </nav>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center md:px-10">
        <div className="mb-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--color-ink-faint)]">
          <span className="h-1.5 w-1.5 rounded-full presence-fill" />
          Chat · Feed · Spaces · Stories
        </div>
        <h1 className="mb-4 max-w-2xl font-serif text-4xl font-semibold leading-tight md:text-6xl">
          One app. Everyone you talk to.
        </h1>
        <p className="mb-9 max-w-lg text-[15px] leading-relaxed text-[var(--color-ink-muted)]">
          PalSpace puts chat, a real feed, communities you actually own, and stories in one place —
          without asking you to choose which app your friends live in.
        </p>
        <div className="mb-5 flex flex-wrap items-center justify-center gap-3.5">
          <DownloadButton size="lg" />
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="flex items-center gap-2 rounded-full bg-white px-7 py-3 text-sm font-semibold text-black transition-colors hover:bg-[var(--color-ink-muted)]"
          >
            Get started <ArrowRight size={15} />
          </Link>
          <Link
            href="/login"
            className="rounded-full border border-[var(--color-hairline-strong)] px-7 py-3 text-sm font-medium text-[var(--color-ink)] transition-colors hover:border-[var(--color-ink-muted)]"
          >
            Log in
          </Link>
        </div>

        <div className="mt-20 grid w-full max-w-4xl grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(({ icon: Icon, title, description }) => (
            <div
              key={title}
              className="bespoke-corner flex flex-col items-start rounded-2xl border border-[var(--color-hairline)] bg-[var(--color-surface)] p-5 text-left transition-colors hover:border-[var(--color-hairline-strong)]"
            >
              <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--color-surface-raised)] text-[var(--presence-default-a)]">
                <Icon size={17} />
              </div>
              <h3 className="mb-1 text-[14px] font-semibold">{title}</h3>
              <p className="text-[12.5px] leading-relaxed text-[var(--color-ink-muted)]">{description}</p>
            </div>
          ))}
        </div>
      </main>

      <footer className="flex flex-col items-center gap-3 border-t border-[var(--color-hairline)] px-6 py-6 text-[12px] text-[var(--color-ink-faint)] md:flex-row md:justify-between md:px-10">
        <span>© {new Date().getFullYear()} PalSpace</span>
        <div className="flex gap-5">
          <Link href="/terms" className="hover:text-[var(--color-ink-muted)]">
            Terms
          </Link>
          <Link href="/privacy" className="hover:text-[var(--color-ink-muted)]">
            Privacy
          </Link>
          <Link href="/status" className="hover:text-[var(--color-ink-muted)]">
            Status
          </Link>
        </div>
      </footer>
    </div>
  );
}
