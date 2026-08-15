'use client';

import type { ReactNode } from 'react';
import { GlobalNav } from './GlobalNav';
import { SecondarySidebar } from './SecondarySidebar';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen w-full bg-[var(--color-void)] text-[var(--color-ink)]">
      <GlobalNav />
      <SecondarySidebar />
      <main className="flex min-w-0 flex-1 flex-col">{children}</main>
    </div>
  );
}
