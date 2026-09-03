'use client';

import { useEffect, useState } from 'react';
import { X, Check, Hash } from 'lucide-react';
import { listMyDMs, forwardMessage, type DmSummary } from '../../lib/api/channels';
import { listMySpaces, listSpaceTopics } from '../../lib/api/spaces';
import type { Message, Space, Topic } from '../../lib/database.types';

export function ForwardMessageModal({
  message,
  onClose,
}: {
  message: Message & { sender_username: string };
  onClose: () => void;
}) {
  const [dms, setDms] = useState<DmSummary[]>([]);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [topicsBySpace, setTopicsBySpace] = useState<Record<string, Topic[]>>({});
  const [expandedSpace, setExpandedSpace] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sendingTo, setSendingTo] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([listMyDMs(), listMySpaces()])
      .then(([d, s]) => {
        setDms(d);
        setSpaces(s);
      })
      .catch(() => setError('Could not load your chats.'))
      .finally(() => setLoading(false));
  }, []);

  async function handleExpandSpace(spaceId: string) {
    if (expandedSpace === spaceId) {
      setExpandedSpace(null);
      return;
    }
    setExpandedSpace(spaceId);
    if (!topicsBySpace[spaceId]) {
      try {
        const topics = await listSpaceTopics(spaceId);
        setTopicsBySpace((prev) => ({ ...prev, [spaceId]: topics }));
      } catch {
        setError('Could not load topics for that space.');
      }
    }
  }

  async function handleSend(channelId: string) {
    setSendingTo(channelId);
    setError(null);
    try {
      await forwardMessage(channelId, message);
      setSentTo((prev) => new Set(prev).add(channelId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not forward.');
    } finally {
      setSendingTo(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[70vh] w-full max-w-sm flex-col overflow-hidden rounded-2xl border border-[var(--color-hairline-strong)] bg-[var(--color-surface-overlay)] shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-[var(--color-hairline)] px-4 py-3">
          <h3 className="text-[14px] font-semibold">Forward message</h3>
          <button onClick={onClose} className="text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        {error && (
          <div className="mx-4 mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12.5px] text-red-300">{error}</div>
        )}

        <div className="flex-1 overflow-y-auto p-2">
          {loading && <div className="px-3 py-6 text-center text-[12.5px] text-[var(--color-ink-faint)]">Loading…</div>}

          {!loading && dms.length > 0 && (
            <div className="mb-2">
              <div className="px-2 py-1 text-[10.5px] font-medium uppercase tracking-wide text-[var(--color-ink-faint)]">Direct messages</div>
              {dms.map((dm) => (
                <ForwardTarget
                  key={dm.channel_id}
                  label={dm.is_group ? dm.group_name || dm.other_users.map((u) => u.display_name).join(', ') || 'Group' : (dm.other_users[0]?.display_name ?? 'Unknown')}
                  sublabel={dm.is_group ? `${dm.other_users.length + 1} members` : `@${dm.other_users[0]?.username ?? ''}`}
                  sending={sendingTo === dm.channel_id}
                  sent={sentTo.has(dm.channel_id)}
                  onClick={() => handleSend(dm.channel_id)}
                />
              ))}
            </div>
          )}

          {!loading && spaces.length > 0 && (
            <div>
              <div className="px-2 py-1 text-[10.5px] font-medium uppercase tracking-wide text-[var(--color-ink-faint)]">Spaces</div>
              {spaces.map((space) => (
                <div key={space.id}>
                  <button
                    onClick={() => handleExpandSpace(space.id)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] hover:bg-[var(--color-surface-raised)]"
                  >
                    <div
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[9px] font-bold text-black presence-fill"
                      style={{ ['--p-a' as string]: space.accent_color_top, ['--p-b' as string]: space.accent_color_bottom }}
                    >
                      {space.name.slice(0, 2).toUpperCase()}
                    </div>
                    {space.name}
                  </button>
                  {expandedSpace === space.id && (
                    <div className="ml-6 border-l border-[var(--color-hairline)] pl-2">
                      {(topicsBySpace[space.id] ?? []).map((topic) => (
                        <ForwardTarget
                          key={topic.id}
                          icon={<Hash size={12} />}
                          label={topic.name}
                          sending={sendingTo === topic.id}
                          sent={sentTo.has(topic.id)}
                          onClick={() => handleSend(topic.id)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {!loading && dms.length === 0 && spaces.length === 0 && (
            <p className="px-3 py-6 text-center text-[12.5px] text-[var(--color-ink-faint)]">Nowhere to forward to yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function ForwardTarget({
  icon,
  label,
  sublabel,
  sending,
  sent,
  onClick,
}: {
  icon?: React.ReactNode;
  label: string;
  sublabel?: string;
  sending: boolean;
  sent: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={sending || sent}
      className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] hover:bg-[var(--color-surface-raised)] disabled:opacity-70"
    >
      <span className="flex min-w-0 items-center gap-1.5 truncate">
        {icon}
        <span className="truncate">{label}</span>
        {sublabel && <span className="truncate text-[11px] text-[var(--color-ink-faint)]">{sublabel}</span>}
      </span>
      {sent ? (
        <Check size={13} className="shrink-0 text-[var(--presence-default-a)]" />
      ) : sending ? (
        <span className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-[var(--color-ink-faint)]/30 border-t-[var(--color-ink-faint)]" />
      ) : null}
    </button>
  );
}
