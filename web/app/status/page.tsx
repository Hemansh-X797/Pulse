'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../src/lib/supabase';

type Health = 'checking' | 'green' | 'yellow' | 'red';

interface ServiceState {
  label: string;
  health: Health;
  latencyMs: number | null;
  detail: string;
  history: number[]; // latency samples, ms, most recent last
}

const GREEN_MAX_MS = 500;
const YELLOW_MAX_MS = 2000;
const SAMPLE_INTERVAL_MS = 30_000;
const MAX_HISTORY = 20;

function classify(latencyMs: number): Health {
  if (latencyMs <= GREEN_MAX_MS) return 'green';
  if (latencyMs <= YELLOW_MAX_MS) return 'yellow';
  return 'red';
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;

async function checkDatabase(): Promise<{ health: Health; latencyMs: number | null; detail: string }> {
  const start = performance.now();
  try {
    const { error } = await supabase.from('profiles').select('id', { head: true, count: 'exact' }).limit(1);
    const latency = Math.round(performance.now() - start);
    if (error) return { health: 'red', latencyMs: latency, detail: error.message };
    return { health: classify(latency), latencyMs: latency, detail: `${latency}ms round-trip query` };
  } catch (e) {
    return { health: 'red', latencyMs: null, detail: e instanceof Error ? e.message : 'unreachable' };
  }
}

async function checkAuth(): Promise<{ health: Health; latencyMs: number | null; detail: string }> {
  if (!SUPABASE_URL) return { health: 'red', latencyMs: null, detail: 'not configured' };
  const start = performance.now();
  try {
    // GoTrue's own public health endpoint — doesn't need an API key or
    // an active session, just tells us the auth server itself is up.
    const res = await fetch(`${SUPABASE_URL}/auth/v1/health`);
    const latency = Math.round(performance.now() - start);
    if (!res.ok) return { health: 'red', latencyMs: latency, detail: `HTTP ${res.status}` };
    return { health: classify(latency), latencyMs: latency, detail: `${latency}ms health check` };
  } catch (e) {
    return { health: 'red', latencyMs: null, detail: e instanceof Error ? e.message : 'unreachable' };
  }
}

async function checkStorage(): Promise<{ health: Health; latencyMs: number | null; detail: string }> {
  if (!SUPABASE_URL) return { health: 'red', latencyMs: null, detail: 'not configured' };
  const start = performance.now();
  try {
    const res = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '' },
    });
    const latency = Math.round(performance.now() - start);
    // 200 (buckets listed) or 401/403 (reachable but this anon key can't
    // list buckets) both mean the Storage API itself is up and
    // responding — only a network failure or 5xx means it's actually
    // down.
    if (res.status >= 500) return { health: 'red', latencyMs: latency, detail: `HTTP ${res.status}` };
    return { health: classify(latency), latencyMs: latency, detail: `${latency}ms response` };
  } catch (e) {
    return { health: 'red', latencyMs: null, detail: e instanceof Error ? e.message : 'unreachable' };
  }
}

async function checkRealtime(): Promise<{ health: Health; latencyMs: number | null; detail: string }> {
  const start = performance.now();
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      supabase.removeChannel(channel);
      resolve({ health: 'red', latencyMs: null, detail: 'subscribe timed out after 5s' });
    }, 5000);

    const channel = supabase.channel(`status-check-${Date.now()}`).subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        clearTimeout(timeout);
        const latency = Math.round(performance.now() - start);
        supabase.removeChannel(channel);
        resolve({ health: classify(latency), latencyMs: latency, detail: `${latency}ms to subscribe` });
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        clearTimeout(timeout);
        supabase.removeChannel(channel);
        resolve({ health: 'red', latencyMs: null, detail: status });
      }
    });
  });
}

const CHECKS: { key: string; label: string; run: () => Promise<{ health: Health; latencyMs: number | null; detail: string }> }[] = [
  { key: 'database', label: 'Database', run: checkDatabase },
  { key: 'auth', label: 'Authentication', run: checkAuth },
  { key: 'storage', label: 'Storage', run: checkStorage },
  { key: 'realtime', label: 'Realtime', run: checkRealtime },
];

function StatusDot({ health }: { health: Health }) {
  const color = health === 'green' ? '#22c55e' : health === 'yellow' ? '#eab308' : health === 'red' ? '#ef4444' : '#52525b';
  return <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: color, boxShadow: health !== 'checking' ? `0 0 8px ${color}` : undefined }} />;
}

function Sparkline({ history }: { history: number[] }) {
  if (history.length < 2) return <div className="h-8 w-full" />;
  const max = Math.max(...history, YELLOW_MAX_MS);
  const points = history
    .map((v, i) => `${(i / (history.length - 1)) * 100},${32 - (Math.min(v, max) / max) * 30}`)
    .join(' ');
  return (
    <svg viewBox="0 0 100 32" preserveAspectRatio="none" className="h-8 w-full">
      <polyline points={points} fill="none" stroke="var(--color-ink-muted)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export default function StatusPage() {
  const [services, setServices] = useState<Record<string, ServiceState>>(() =>
    Object.fromEntries(CHECKS.map((c) => [c.key, { label: c.label, health: 'checking' as Health, latencyMs: null, detail: 'checking…', history: [] }]))
  );
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const historyRef = useRef<Record<string, number[]>>(Object.fromEntries(CHECKS.map((c) => [c.key, []])));

  async function runChecks() {
    for (const check of CHECKS) {
      const result = await check.run();
      if (result.latencyMs !== null) {
        historyRef.current[check.key] = [...historyRef.current[check.key], result.latencyMs].slice(-MAX_HISTORY);
      }
      setServices((prev) => ({
        ...prev,
        [check.key]: { label: check.label, ...result, history: historyRef.current[check.key] },
      }));
    }
    setLastChecked(new Date());
  }

  useEffect(() => {
    runChecks();
    const interval = setInterval(runChecks, SAMPLE_INTERVAL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allHealthy = Object.values(services).every((s) => s.health === 'green');
  const anyDown = Object.values(services).some((s) => s.health === 'red');
  const overallLabel = anyDown ? 'Partial outage' : allHealthy ? 'All systems operational' : Object.values(services).some((s) => s.health === 'checking') ? 'Checking…' : 'Degraded performance';
  const overallColor = anyDown ? '#ef4444' : allHealthy ? '#22c55e' : '#eab308';

  return (
    <div className="mx-auto min-h-screen max-w-2xl px-6 py-12 text-[var(--color-ink)]">
      <a href="/" className="mb-8 inline-block text-[13px] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]">
        ← Back to PalSpace
      </a>

      <h1 className="mb-1 font-serif text-3xl font-semibold">System Status</h1>
      <p className="mb-6 text-[13px] text-[var(--color-ink-faint)]">
        Live checks run from your own browser to PalSpace&apos;s backend every 30 seconds — this reflects your
        current connection&apos;s reachability and latency, not a persisted server-side uptime history.
      </p>

      <div className="mb-8 flex items-center gap-2.5 rounded-xl border border-[var(--color-hairline)] bg-[var(--color-surface)] px-4 py-3">
        <span className="inline-block h-3 w-3 rounded-full" style={{ background: overallColor, boxShadow: `0 0 10px ${overallColor}` }} />
        <span className="font-medium">{overallLabel}</span>
        {lastChecked && (
          <span className="ml-auto font-mono text-[11px] text-[var(--color-ink-faint)]">
            last checked {lastChecked.toLocaleTimeString()}
          </span>
        )}
      </div>

      <div className="space-y-3">
        {CHECKS.map((c) => {
          const s = services[c.key];
          return (
            <div key={c.key} className="rounded-xl border border-[var(--color-hairline)] bg-[var(--color-surface)] p-4">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <StatusDot health={s.health} />
                  <span className="text-[14px] font-medium">{s.label}</span>
                </div>
                <span className="font-mono text-[11px] text-[var(--color-ink-muted)]">{s.detail}</span>
              </div>
              <Sparkline history={s.history} />
            </div>
          );
        })}
      </div>

      <p className="mt-8 text-[11.5px] text-[var(--color-ink-faint)]">
        Green: under {GREEN_MAX_MS}ms. Yellow: under {YELLOW_MAX_MS}ms. Red: slower, erroring, or unreachable.
      </p>
    </div>
  );
}
