'use client';

import React, { useState } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Activity,
  Server,
  Database,
  Wifi,
  ShieldCheck,
  HardDrive,
  RefreshCw,
  Clock,
  ExternalLink,
  Info
} from 'lucide-react';

interface SystemService {
  id: string;
  name: string;
  category: 'Core' | 'Infrastructure' | 'Media';
  description: string;
  status: 'operational' | 'degraded' | 'outage';
  uptimePercent: string;
  latencyMs: number;
  history: ('operational' | 'degraded' | 'outage')[]; // 30-day block history
}

const mockServices: SystemService[] = [
  {
    id: 'auth',
    name: 'Authentication & Session Engine',
    category: 'Core',
    description: 'Supabase Auth, JWT verification & OAuth providers',
    status: 'operational',
    uptimePercent: '99.99%',
    latencyMs: 24,
    history: Array(28).fill('operational').concat(['degraded', 'operational'])
  },
  {
    id: 'db',
    name: 'PostgreSQL Database & Connection Pooler',
    category: 'Core',
    description: 'Primary database cluster, read replicas & Supavisor',
    status: 'operational',
    uptimePercent: '100.0%',
    latencyMs: 12,
    history: Array(30).fill('operational')
  },
  {
    id: 'realtime',
    name: 'Realtime Gateway & WebSockets',
    category: 'Infrastructure',
    description: 'Pub/Sub messaging, presence sync & channel states',
    status: 'operational',
    uptimePercent: '99.95%',
    latencyMs: 35,
    history: Array(25).fill('operational').concat(['degraded', 'operational', 'operational', 'operational', 'operational'])
  },
  {
    id: 'api',
    name: 'Edge Functions & REST API',
    category: 'Infrastructure',
    description: 'Serverless API endpoints,webhooks & rate limiters',
    status: 'operational',
    uptimePercent: '99.98%',
    latencyMs: 42,
    history: Array(30).fill('operational')
  },
  {
    id: 'cdn',
    name: 'Media Storage & Global CDN',
    category: 'Media',
    description: 'Avatars, profile banners, attachments & image proxy',
    status: 'degraded',
    uptimePercent: '98.50%',
    latencyMs: 180,
    history: Array(22).fill('operational').concat(['outage', 'degraded'], Array(6).fill('operational'))
  }
];

// Sparkline / SVG Graph Components
const SystemLatencyChart = () => (
  <div className="h-24 w-full relative overflow-hidden">
    <svg className="w-full h-full" viewBox="0 0 500 100" preserveAspectRatio="none">
      <defs>
        <linearGradient id="latencyGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#a855f7" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#a855f7" stopOpacity="0.0" />
        </linearGradient>
      </defs>
      {/* Background Grid Lines */}
      <line x1="0" y1="25" x2="500" y2="25" stroke="#262626" strokeDasharray="4 4" />
      <line x1="0" y1="50" x2="500" y2="50" stroke="#262626" strokeDasharray="4 4" />
      <line x1="0" y1="75" x2="500" y2="75" stroke="#262626" strokeDasharray="4 4" />
      
      {/* Filled Area */}
      <polygon
        fill="url(#latencyGradient)"
        points="0,100 0,65 50,55 100,70 150,45 200,50 250,30 300,60 350,40 400,25 450,50 500,35 500,100"
      />
      {/* Animated Path */}
      <path
        d="M 0 65 L 50 55 L 100 70 L 150 45 L 200 50 L 250 30 L 300 60 L 350 40 L 400 25 L 450 50 L 500 35"
        fill="none"
        stroke="#c084fc"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  </div>
);

export default function StatusDashboard() {
  const [filterCategory, setFilterCategory] = useState<'All' | 'Core' | 'Infrastructure' | 'Media'>('All');
  const allOperational = mockServices.every((s) => s.status === 'operational');

  const filteredServices = filterCategory === 'All' 
    ? mockServices 
    : mockServices.filter(s => s.category === filterCategory);

  return (
    <div className="min-h-screen bg-[#050505] text-neutral-100 font-sans selection:bg-purple-500/30 selection:text-purple-200 antialiased relative overflow-x-hidden">
      
      {/* Ambient Lighting Background Effects */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[400px] bg-gradient-to-b from-purple-900/15 via-indigo-950/5 to-transparent blur-[140px] pointer-events-none -z-10" />

      <div className="max-w-6xl mx-auto px-4 py-8 md:py-16 space-y-10">

        {/* TOP BRAND HEADER */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-neutral-800/80 pb-8">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-500/20 border border-purple-400/30">
                <Activity className="w-5 h-5 text-white" />
              </div>
              <h1 className="text-2xl font-extrabold tracking-tight font-mono uppercase bg-gradient-to-r from-white via-neutral-200 to-neutral-400 bg-clip-text text-transparent">
                Pulse Status Center
              </h1>
            </div>
            <p className="text-xs text-neutral-400 pl-12 font-mono">
              Real-time telemetry, API performance & operational state
            </p>
          </div>

          <div className="flex items-center gap-4">
            <button 
              onClick={() => window.location.reload()} 
              className="px-3.5 py-2 rounded-lg bg-neutral-900 border border-neutral-800 hover:border-neutral-700 text-xs font-mono text-neutral-300 hover:text-white transition-all flex items-center gap-2 group"
            >
              <RefreshCw className="w-3.5 h-3.5 text-neutral-400 group-hover:rotate-180 transition-transform duration-500" />
              <span>Refresh Telemetry</span>
            </button>
            <div className="hidden sm:block h-8 w-[1px] bg-neutral-800" />
            <div className="text-right font-mono">
              <span className="text-[10px] text-neutral-500 uppercase block tracking-wider">System Clock</span>
              <span className="text-xs text-purple-300 font-semibold">UTC 02:21:22</span>
            </div>
          </div>
        </header>

        {/* OVERALL STATUS BANNER */}
        <section className={`relative overflow-hidden p-6 md:p-8 rounded-2xl border backdrop-blur-xl transition-all ${
          allOperational 
            ? 'bg-gradient-to-r from-emerald-950/30 via-emerald-900/10 to-transparent border-emerald-500/30 shadow-2xl shadow-emerald-950/20' 
            : 'bg-gradient-to-r from-amber-950/30 via-amber-900/10 to-transparent border-amber-500/30 shadow-2xl shadow-amber-950/20'
        }`}>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 relative z-10">
            <div className="flex items-start gap-4">
              <div className={`p-3 rounded-xl border ${
                allOperational 
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
                  : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
              }`}>
                {allOperational ? <CheckCircle2 className="w-8 h-8" /> : <AlertTriangle className="w-8 h-8" />}
              </div>
              <div className="space-y-1">
                <h2 className="text-lg md:text-xl font-bold text-white tracking-tight">
                  {allOperational ? 'All Systems Fully Operational' : 'Partial System Degradation Detected'}
                </h2>
                <p className="text-xs md:text-sm text-neutral-300 max-w-xl leading-relaxed">
                  {allOperational 
                    ? 'All global edge nodes, database clusters, and realtime gateways are operating within normal parameters.' 
                    : 'Media CDN and avatar attachment services are experiencing elevated latency. Our engineering team is currently investigating.'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-center bg-black/40 border border-white/10 rounded-full px-4 py-2 backdrop-blur-md">
              <span className={`w-2.5 h-2.5 rounded-full animate-ping ${allOperational ? 'bg-emerald-400' : 'bg-amber-400'}`} />
              <span className="text-xs font-mono uppercase tracking-widest text-neutral-200">
                {allOperational ? 'Global Health: 99.9%' : 'Global Health: 98.2%'}
              </span>
            </div>
          </div>
        </section>

        {/* METRICS & GRAPH DASHBOARD */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-5">
          

          <div className="bg-[#0c0d0f] border border-neutral-800/80 rounded-2xl p-5 space-y-4 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-mono text-neutral-400 uppercase tracking-wider">
                <Wifi className="w-4 h-4 text-purple-400" />
                <span>Global API Latency</span>
              </div>
              <span className="text-xs font-mono text-emerald-400 font-semibold">28ms avg</span>
            </div>
            <div className="text-2xl font-extrabold font-mono text-white">28.4 <span className="text-xs font-normal text-neutral-500">ms</span></div>
            <SystemLatencyChart />
          </div>


          <div className="bg-[#0c0d0f] border border-neutral-800/80 rounded-2xl p-5 space-y-4 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-mono text-neutral-400 uppercase tracking-wider">
                <Server className="w-4 h-4 text-indigo-400" />
                <span>Realtime Socket Traffic</span>
              </div>
              <span className="text-xs font-mono text-purple-400 font-semibold">Active</span>
            </div>
            <div className="space-y-1">
              <div className="text-2xl font-extrabold font-mono text-white">142.8k <span className="text-xs font-normal text-neutral-500">msg/sec</span></div>
              <p className="text-[11px] text-neutral-400">WebSocket connections synced cleanly across 12 region clusters.</p>
            </div>
            <div className="w-full bg-neutral-900 h-2 rounded-full overflow-hidden border border-neutral-800">
              <div className="bg-gradient-to-r from-indigo-500 to-purple-500 h-full w-[78%]" />
            </div>
          </div>

          <div className="bg-[#0c0d0f] border border-neutral-800/80 rounded-2xl p-5 space-y-4 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-mono text-neutral-400 uppercase tracking-wider">
                <Database className="w-4 h-4 text-emerald-400" />
                <span>PostgreSQL Pool Load</span>
              </div>
              <span className="text-xs font-mono text-emerald-400 font-semibold">Optimal</span>
            </div>
            <div className="space-y-1">
              <div className="text-2xl font-extrabold font-mono text-white">18% <span className="text-xs font-normal text-neutral-500">Capacity</span></div>
              <p className="text-[11px] text-neutral-400">Supavisor pooler managing 1,240 active client connections.</p>
            </div>
            <div className="w-full bg-neutral-900 h-2 rounded-full overflow-hidden border border-neutral-800">
              <div className="bg-emerald-500 h-full w-[18%]" />
            </div>
          </div>

        </section>

        {/* SERVICE STATUS & 30-DAY UPTIME BARS */}
        <section className="space-y-6">
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-800/80 pb-4">
            <div className="space-y-1">
              <h3 className="text-base font-semibold text-white">System Services Telemetry</h3>
              <p className="text-xs text-neutral-400">Historical performance over the last 30 calendar days</p>
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-1 bg-[#0c0d0f] p-1 rounded-xl border border-neutral-800">
              {(['All', 'Core', 'Infrastructure', 'Media'] as const).map((cat) => (
                <button
                  key={cat}
                  onClick={() => setFilterCategory(cat)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all ${
                    filterCategory === cat 
                      ? 'bg-purple-600 text-white font-medium shadow-md shadow-purple-600/20' 
                      : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            {filteredServices.map((service) => (
              <div key={service.id} className="bg-[#0c0d0f] border border-neutral-800/80 rounded-2xl p-5 space-y-4 hover:border-neutral-700 transition-colors">
                
                {/* Top Row: Service Meta */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2.5">
                      <span className="text-sm font-semibold text-white">{service.name}</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-neutral-900 border border-neutral-800 text-neutral-400">
                        {service.category}
                      </span>
                    </div>
                    <p className="text-xs text-neutral-400">{service.description}</p>
                  </div>

                  <div className="flex items-center gap-4">
                    <span className="text-xs font-mono text-neutral-400">{service.latencyMs}ms</span>
                    <span className="text-xs font-mono font-semibold text-neutral-200">{service.uptimePercent}</span>
                    
                    {service.status === 'operational' && (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        Operational
                      </span>
                    )}
                    {service.status === 'degraded' && (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                        Degraded
                      </span>
                    )}
                  </div>
                </div>

                {/* Bottom Row: 30-Day Uptime Segmented Bar */}
                <div className="space-y-1.5 pt-2 border-t border-neutral-900">
                  <div className="flex items-center justify-between text-[10px] font-mono text-neutral-500">
                    <span>30 days ago</span>
                    <span>100% uptime solid</span>
                    <span>Today</span>
                  </div>
                  <div className="grid grid-cols-30 gap-1 h-6 items-center">
                    {service.history.map((dayStatus, i) => (
                      <div
                        key={i}
                        title={`Day ${i + 1}: ${dayStatus}`}
                        className={`h-5 rounded-sm transition-opacity hover:opacity-80 cursor-pointer ${
                          dayStatus === 'operational' ? 'bg-emerald-500/80' : dayStatus === 'degraded' ? 'bg-amber-400' : 'bg-red-500'
                        }`}
                      />
                    ))}
                  </div>
                </div>

              </div>
            ))}
          </div>

        </section>

        {/* RECENT INCIDENTS TIMELINE */}
        <section className="space-y-4 pt-4">
          <h3 className="text-xs font-mono uppercase tracking-wider text-neutral-400">Incident History & Logs</h3>
          
          <div className="bg-[#0c0d0f] border border-neutral-800/80 rounded-2xl p-6 space-y-6">
            
            <div className="relative pl-6 border-l-2 border-amber-500 space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <span className="text-sm font-semibold text-amber-400">Media CDN Attachment Upload Latency</span>
                <span className="text-[10px] font-mono text-neutral-500">21 Aug 2026 — 01:15 UTC</span>
              </div>
              <p className="text-xs text-neutral-300 leading-relaxed">
                <strong className="text-neutral-200 font-mono">Update (Investigating):</strong> Our image proxy server experienced increased memory pressure due to high attachment volume. Transcoding pipelines are currently processing queues with a ~3 second delay.
              </p>
            </div>

            <div className="relative pl-6 border-l-2 border-emerald-500 space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <span className="text-sm font-semibold text-emerald-400">Scheduled Database Maintenance & Index Tuning</span>
                <span className="text-[10px] font-mono text-neutral-500">20 Aug 2026 — 04:00 UTC</span>
              </div>
              <p className="text-xs text-neutral-400 leading-relaxed">
                Completed planned RLS performance optimizations on message reactions and pinned tables across all cluster nodes. Zero client downtime reported.
              </p>
            </div>

          </div>
        </section>

        {/* FOOTER */}
        <footer className="pt-8 border-t border-neutral-800/80 flex flex-col sm:flex-row items-center justify-between text-xs text-neutral-500 font-mono gap-4">
          <span>Pulse Application Infrastructure © 2026</span>
          <div className="flex items-center gap-6">
            <a href="/privacy" className="hover:text-white transition-colors">Privacy Policy</a>
            <a href="/terms" className="hover:text-white transition-colors">Terms of Service</a>
            <a href="https://supabase.com" target="_blank" rel="noreferrer" className="hover:text-white transition-colors flex items-center gap-1">
              <span>Supabase Metrics</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </footer>

      </div>
    </div>
  );
}