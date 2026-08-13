import { Outlet } from '@tanstack/react-router';
import { GlobalNav } from './GlobalNav';
import { SecondarySidebar } from './SecondarySidebar';

export function AppShell() {
  return (
    <div className="flex h-screen w-full bg-neutral-950 text-neutral-50">
      <GlobalNav />
      <SecondarySidebar />
      <main className="flex min-w-0 flex-1 flex-col">
        <Outlet />
      </main>
    </div>
  );
}
