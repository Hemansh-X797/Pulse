'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Users, FileText, Layers, MessageSquare, TrendingUp, Search, ShieldAlert, Loader2 } from 'lucide-react';
import { amIAdmin, getAdminStats, adminSearchUsers, adminListRecentSignups, type AdminUserRow } from '../lib/api/admin';

/**
 * Gated in two layers: this component itself won't render the panel
 * contents until amIAdmin() (which re-checks server-side via RLS —
 * see 036_app_admins.sql) resolves true, AND every RPC the panel calls
 * re-checks admin status itself again. So even someone who found this
 * route directly and somehow rendered past the client check would get
 * a raised exception from every single data call — the client gate is
 * a UX nicety, not the real boundary.
 */
export function AdminPanel() {
  const { data: isAdmin, isLoading } = useQuery({ queryKey: ['am-i-admin'], queryFn: amIAdmin });

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[var(--color-void)]">
        <Loader2 size={20} className="animate-spin text-[var(--color-ink-muted)]" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center gap-3 bg-[var(--color-void)] text-center text-[var(--color-ink)]">
        <ShieldAlert size={28} className="text-red-400" />
        <p className="text-[13.5px] text-[var(--color-ink-muted)]">You don't have access to this page.</p>
      </div>
    );
  }

  return <AdminDashboard />;
}

function AdminDashboard() {
  const { data: stats } = useQuery({ queryKey: ['admin-stats'], queryFn: getAdminStats });
  const { data: recentSignups = [] } = useQuery({ queryKey: ['admin-recent-signups'], queryFn: () => adminListRecentSignups(10) });
  const [query, setQuery] = useState('');
  const { data: searchResults, isFetching: searching } = useQuery({
    queryKey: ['admin-user-search', query],
    queryFn: () => adminSearchUsers(query),
    enabled: query.trim().length > 1,
  });

  return (
    <div className="min-h-screen w-full bg-[var(--color-void)] px-6 py-8 text-[var(--color-ink)] md:px-12">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 flex items-center gap-2.5">
          <ShieldAlert size={20} className="text-[var(--presence-default-a)]" />
          <h1 className="font-serif text-2xl font-semibold">Admin</h1>
        </div>

        <div className="mb-10 grid grid-cols-2 gap-3 md:grid-cols-5">
          <StatCard icon={Users} label="Users" value={stats?.total_users} />
          <StatCard icon={FileText} label="Posts" value={stats?.total_posts} />
          <StatCard icon={Layers} label="Spaces" value={stats?.total_spaces} />
          <StatCard icon={MessageSquare} label="Messages" value={stats?.total_messages} />
          <StatCard icon={TrendingUp} label="Signups (7d)" value={stats?.signups_last_7d} highlight />
        </div>

        <div className="mb-10">
          <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-[0.15em] text-[var(--color-ink-faint)]">User lookup</h2>
          <div className="mb-3 flex items-center gap-2 rounded-lg border border-[var(--color-hairline)] bg-[var(--color-surface)] px-3 py-2">
            <Search size={14} className="text-[var(--color-ink-faint)]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by username or display name…"
              className="w-full bg-transparent text-[13px] outline-none placeholder:text-[var(--color-ink-faint)]"
            />
            {searching && <Loader2 size={13} className="animate-spin text-[var(--color-ink-faint)]" />}
          </div>
          {query.trim().length > 1 && <UserTable rows={searchResults ?? []} empty="No matching users." />}
        </div>

        <div>
          <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-[0.15em] text-[var(--color-ink-faint)]">Recent signups</h2>
          <UserTable rows={recentSignups} empty="No signups yet." />
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, highlight }: { icon: typeof Users; label: string; value: number | undefined; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border p-3.5 ${highlight ? 'border-[var(--presence-default-a)]/40 bg-[var(--presence-default-a)]/[0.06]' : 'border-[var(--color-hairline)] bg-[var(--color-surface)]'}`}>
      <Icon size={14} className="mb-2 text-[var(--color-ink-muted)]" />
      <div className="text-[20px] font-semibold tabular-nums">{value ?? '—'}</div>
      <div className="text-[10.5px] text-[var(--color-ink-faint)]">{label}</div>
    </div>
  );
}

function UserTable({ rows, empty }: { rows: AdminUserRow[]; empty: string }) {
  if (rows.length === 0) {
    return <p className="rounded-xl border border-dashed border-[var(--color-hairline)] px-4 py-6 text-center text-[12.5px] text-[var(--color-ink-faint)]">{empty}</p>;
  }
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--color-hairline)]">
      {rows.map((u) => (
        <a
          key={u.id}
          href={`/${u.username}`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-3 border-b border-[var(--color-hairline)] px-3.5 py-2.5 last:border-b-0 hover:bg-[var(--color-surface-raised)]"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--color-surface-raised)] text-[10px] font-bold">
            {u.avatar_url ? <img src={u.avatar_url} alt="" className="h-full w-full object-cover" /> : u.display_name.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12.5px] font-medium">{u.display_name}</div>
            <div className="truncate text-[11px] text-[var(--color-ink-faint)]">@{u.username}</div>
          </div>
          <div className="shrink-0 text-[10.5px] text-[var(--color-ink-faint)]">{new Date(u.created_at).toLocaleDateString()}</div>
        </a>
      ))}
    </div>
  );
}
