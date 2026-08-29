'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Copy, Check, Trash2, Plus, UserX, Ban } from 'lucide-react';
import {
  getSpace,
  updateSpace,
  listSpaceRoles,
  createSpaceRole,
  updateSpaceRolePermissions,
  deleteSpaceRole,
  listMemberRoleAssignments,
  assignSpaceRole,
  unassignSpaceRole,
  listSpaceMembers,
  hasSpacePermission,
  kickSpaceMember,
  banSpaceMember,
  unbanSpaceMember,
  listSpaceBans,
  type SpaceRolePermissions,
} from '../../lib/api/spaces';
import { useAppStore } from '../../store/useAppStore';

type Tab = 'overview' | 'roles' | 'members' | 'invites';

const PERMISSION_LABELS: { key: keyof SpaceRolePermissions; label: string; hint: string }[] = [
  { key: 'manage_channels', label: 'Manage Channels', hint: 'Create, reorder, and delete channels and categories.' },
  { key: 'manage_roles', label: 'Manage Roles', hint: 'Create roles and assign them to members.' },
  { key: 'manage_messages', label: 'Manage Messages', hint: "Delete other people's messages in this space." },
  { key: 'kick_members', label: 'Kick Members', hint: 'Remove members from this space.' },
  { key: 'ban_members', label: 'Ban Members', hint: 'Remove members and block them from rejoining.' },
  { key: 'create_invites', label: 'Create Invites', hint: 'Generate invite links for this space.' },
];

export function SpaceSettingsModal({ spaceId, onClose }: { spaceId: string; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('overview');
  const profile = useAppStore((s) => s.profile);

  const { data: space } = useQuery({ queryKey: ['space', spaceId], queryFn: () => getSpace(spaceId) });
  const { data: canManageRoles = false } = useQuery({
    queryKey: ['space-permission', spaceId, 'manage_roles'],
    queryFn: () => hasSpacePermission(spaceId, 'manage_roles'),
  });
  const isOwner = space?.owner_id === profile?.id;

  const TABS: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Server Profile' },
    { id: 'roles', label: 'Roles' },
    { id: 'members', label: 'Members' },
    { id: 'invites', label: 'Invites' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-[80vh] w-full max-w-3xl overflow-hidden rounded-2xl border border-[var(--color-hairline-strong)] bg-[var(--color-surface-overlay)] shadow-2xl"
      >
        <nav className="w-48 shrink-0 border-r border-[var(--color-hairline)] bg-[var(--color-surface)] p-3">
          <div className="mb-2 truncate px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-[var(--color-ink-faint)]">
            {space?.name ?? 'Space'}
          </div>
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`mb-0.5 block w-full rounded-lg px-2.5 py-2 text-left text-[13px] font-medium transition-colors ${
                tab === t.id ? 'bg-[var(--color-surface-raised)] text-[var(--color-ink)]' : 'text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-raised)]/60'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="relative flex-1 overflow-y-auto p-6">
          <button
            onClick={onClose}
            className="absolute right-5 top-5 flex h-8 w-8 items-center justify-center rounded-full border border-[var(--color-hairline)] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
            aria-label="Close"
          >
            <X size={15} />
          </button>

          {tab === 'overview' && space && <OverviewTab spaceId={spaceId} space={space} canEdit={isOwner} />}
          {tab === 'roles' && <RolesTab spaceId={spaceId} canManage={canManageRoles} />}
          {tab === 'members' && space && <MembersTab spaceId={spaceId} canManageRoles={canManageRoles} spaceOwnerId={space.owner_id} />}
          {tab === 'invites' && space && <InvitesTab space={space} />}
        </div>
      </div>
    </div>
  );
}

function OverviewTab({
  spaceId,
  space,
  canEdit,
}: {
  spaceId: string;
  space: { name: string; description: string; accent_color_top: string; accent_color_bottom: string };
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(space.name);
  const [description, setDescription] = useState(space.description);

  const saveMutation = useMutation({
    mutationFn: () => updateSpace(spaceId, { name: name.trim(), description: description.trim() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['space', spaceId] });
      queryClient.invalidateQueries({ queryKey: ['spaces'] });
    },
  });

  return (
    <div className="max-w-lg">
      <h2 className="mb-1 text-lg font-semibold">Server Profile</h2>
      <p className="mb-5 text-[12.5px] text-[var(--color-ink-muted)]">Name and description shown in invites and Discover.</p>

      <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-[var(--color-ink-faint)]">Name</label>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        disabled={!canEdit}
        className="mb-4 w-full rounded-lg border border-[var(--color-hairline)] bg-[var(--color-surface-raised)] px-3 py-2 text-[14px] outline-none focus:border-[var(--presence-default-a)] disabled:opacity-60"
      />

      <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-[var(--color-ink-faint)]">Description</label>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        disabled={!canEdit}
        maxLength={300}
        rows={3}
        className="mb-4 w-full resize-none rounded-lg border border-[var(--color-hairline)] bg-[var(--color-surface-raised)] px-3 py-2 text-[13.5px] outline-none focus:border-[var(--presence-default-a)] disabled:opacity-60"
      />

      {canEdit ? (
        <button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending || (name === space.name && description === space.description)}
          className="rounded-lg presence-fill px-5 py-2 text-[13px] font-semibold text-black disabled:opacity-50"
        >
          {saveMutation.isPending ? 'Saving…' : 'Save changes'}
        </button>
      ) : (
        <p className="text-[11.5px] text-[var(--color-ink-faint)]">Only the space owner can edit these fields.</p>
      )}
    </div>
  );
}

function RolesTab({ spaceId, canManage }: { spaceId: string; canManage: boolean }) {
  const queryClient = useQueryClient();
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [newRoleName, setNewRoleName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: roles = [] } = useQuery({ queryKey: ['space-roles', spaceId], queryFn: () => listSpaceRoles(spaceId) });
  const selectedRole = roles.find((r) => r.id === selectedRoleId) ?? roles[0];

  const createMutation = useMutation({
    mutationFn: () => createSpaceRole(spaceId, newRoleName.trim() || 'new role'),
    onSuccess: () => {
      setNewRoleName('');
      queryClient.invalidateQueries({ queryKey: ['space-roles', spaceId] });
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Could not create role.'),
  });

  const permMutation = useMutation({
    mutationFn: (permissions: SpaceRolePermissions) => updateSpaceRolePermissions(selectedRole!.id, permissions),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['space-roles', spaceId] }),
    onError: (e) => setError(e instanceof Error ? e.message : 'Could not update permissions.'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteSpaceRole(selectedRole!.id),
    onSuccess: () => {
      setSelectedRoleId(null);
      queryClient.invalidateQueries({ queryKey: ['space-roles', spaceId] });
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Could not delete role.'),
  });

  return (
    <div className="flex h-full gap-6">
      <div className="w-48 shrink-0">
        <h2 className="mb-3 text-lg font-semibold">Roles</h2>
        <div className="mb-3 space-y-1">
          {roles.map((role) => (
            <button
              key={role.id}
              onClick={() => setSelectedRoleId(role.id)}
              className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] ${
                selectedRole?.id === role.id ? 'bg-[var(--color-surface-raised)]' : 'hover:bg-[var(--color-surface-raised)]/60'
              }`}
            >
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: role.color }} />
              <span className="truncate">{role.name}</span>
              {role.is_default && <span className="ml-auto text-[9px] uppercase text-[var(--color-ink-faint)]">Default</span>}
            </button>
          ))}
        </div>
        {canManage && (
          <div className="flex gap-1.5">
            <input
              value={newRoleName}
              onChange={(e) => setNewRoleName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && createMutation.mutate()}
              placeholder="Role name"
              className="min-w-0 flex-1 rounded-lg border border-[var(--color-hairline)] bg-[var(--color-surface-raised)] px-2.5 py-1.5 text-[12px] outline-none"
            />
            <button
              onClick={() => createMutation.mutate()}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-surface-raised)] hover:bg-[var(--color-hairline-strong)]"
              aria-label="Create role"
            >
              <Plus size={14} />
            </button>
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        {error && (
          <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12.5px] text-red-300">{error}</div>
        )}
        {selectedRole ? (
          <>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-[15px] font-semibold">{selectedRole.name}</h3>
              {canManage && !selectedRole.is_default && (
                <button
                  onClick={() => deleteMutation.mutate()}
                  className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11.5px] text-red-400 hover:bg-red-500/10"
                >
                  <Trash2 size={12} /> Delete role
                </button>
              )}
            </div>
            <div className="space-y-3">
              {PERMISSION_LABELS.map(({ key, label, hint }) => {
                const on = !!selectedRole.permissions[key];
                return (
                  <div key={key} className="flex items-center justify-between border-b border-[var(--color-hairline)] py-2.5 last:border-0">
                    <div>
                      <div className="text-[13px] font-medium">{label}</div>
                      <div className="text-[11px] text-[var(--color-ink-faint)]">{hint}</div>
                    </div>
                    <button
                      disabled={!canManage || selectedRole.is_default}
                      onClick={() => permMutation.mutate({ ...selectedRole.permissions, [key]: !on })}
                      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-40 ${on ? 'bg-[var(--presence-default-a)]' : 'bg-[var(--color-hairline-strong)]'}`}
                    >
                      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${on ? 'translate-x-4' : 'translate-x-0.5'}`} />
                    </button>
                  </div>
                );
              })}
            </div>
            {selectedRole.is_default && (
              <p className="mt-3 text-[11px] text-[var(--color-ink-faint)]">
                The default Admin role always has every permission and can&apos;t be edited or deleted.
              </p>
            )}
          </>
        ) : (
          <p className="text-[13px] text-[var(--color-ink-muted)]">No roles yet.</p>
        )}
      </div>
    </div>
  );
}

function MembersTab({ spaceId, canManageRoles, spaceOwnerId }: { spaceId: string; canManageRoles: boolean; spaceOwnerId: string }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [showBans, setShowBans] = useState(false);
  const { data: members = [] } = useQuery({ queryKey: ['space-members', spaceId], queryFn: () => listSpaceMembers(spaceId) });
  const { data: roles = [] } = useQuery({ queryKey: ['space-roles', spaceId], queryFn: () => listSpaceRoles(spaceId) });
  const { data: assignments = [] } = useQuery({ queryKey: ['space-role-assignments', spaceId], queryFn: () => listMemberRoleAssignments(spaceId) });
  const { data: canKick = false } = useQuery({ queryKey: ['space-permission', spaceId, 'kick_members'], queryFn: () => hasSpacePermission(spaceId, 'kick_members') });
  const { data: canBan = false } = useQuery({ queryKey: ['space-permission', spaceId, 'ban_members'], queryFn: () => hasSpacePermission(spaceId, 'ban_members') });
  const { data: bans = [] } = useQuery({ queryKey: ['space-bans', spaceId], queryFn: () => listSpaceBans(spaceId), enabled: showBans && canBan });

  const assignMutation = useMutation({
    mutationFn: ({ userId, roleId }: { userId: string; roleId: string }) => assignSpaceRole(spaceId, userId, roleId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['space-role-assignments', spaceId] }),
  });
  const unassignMutation = useMutation({
    mutationFn: ({ userId, roleId }: { userId: string; roleId: string }) => unassignSpaceRole(spaceId, userId, roleId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['space-role-assignments', spaceId] }),
  });
  const kickMutation = useMutation({
    mutationFn: (userId: string) => kickSpaceMember(spaceId, userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['space-members', spaceId] }),
    onError: (e) => setError(e instanceof Error ? e.message : 'Could not kick member.'),
  });
  const banMutation = useMutation({
    mutationFn: (userId: string) => banSpaceMember(spaceId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['space-members', spaceId] });
      queryClient.invalidateQueries({ queryKey: ['space-bans', spaceId] });
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Could not ban member.'),
  });
  const unbanMutation = useMutation({
    mutationFn: (userId: string) => unbanSpaceMember(spaceId, userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['space-bans', spaceId] }),
  });

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Members — {members.length}</h2>
        {canBan && (
          <button onClick={() => setShowBans((v) => !v)} className="flex items-center gap-1.5 text-[11.5px] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]">
            <Ban size={12} /> {showBans ? 'Hide' : 'Show'} banned users
          </button>
        )}
      </div>

      {error && (
        <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12.5px] text-red-300">{error}</div>
      )}

      {showBans && canBan && (
        <div className="mb-4 rounded-lg border border-[var(--color-hairline)] p-3">
          <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-[var(--color-ink-faint)]">Banned</div>
          {bans.length === 0 && <p className="text-[12px] text-[var(--color-ink-faint)]">No one is banned.</p>}
          {bans.map((b) => (
            <div key={b.user_id} className="flex items-center justify-between py-1.5">
              <span className="text-[12.5px]">{b.display_name}</span>
              <button onClick={() => unbanMutation.mutate(b.user_id)} className="text-[11px] font-medium text-[var(--presence-default-a)]">
                Unban
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-1">
        {members.map((m) => {
          const memberProfile = m.profiles as unknown as { username: string; display_name: string; avatar_url: string } | null;
          const memberRoleIds = assignments.filter((a) => a.user_id === m.user_id).map((a) => a.role_id);
          const isOwnerRow = m.user_id === spaceOwnerId;
          return (
            <div key={m.user_id} className="flex items-center gap-3 border-b border-[var(--color-hairline)] py-2.5 last:border-0">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-surface-raised)] text-[11px] font-bold">
                {memberProfile?.avatar_url ? (
                  <img src={memberProfile.avatar_url} alt="" className="h-full w-full rounded-full object-cover" />
                ) : (
                  (memberProfile?.display_name ?? '?').slice(0, 2).toUpperCase()
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 truncate text-[13px] font-medium">
                  {memberProfile?.display_name ?? m.user_id}
                  {isOwnerRow && <span className="text-[9px] uppercase text-[var(--color-ink-faint)]">Owner</span>}
                </div>
                <div className="flex flex-wrap gap-1">
                  {roles
                    .filter((r) => memberRoleIds.includes(r.id))
                    .map((r) => (
                      <span
                        key={r.id}
                        className="flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px]"
                        style={{ background: `${r.color}22`, color: r.color }}
                      >
                        {r.name}
                        {canManageRoles && !r.is_default && (
                          <button onClick={() => unassignMutation.mutate({ userId: m.user_id, roleId: r.id })} aria-label={`Remove ${r.name}`}>
                            <X size={9} />
                          </button>
                        )}
                      </span>
                    ))}
                </div>
              </div>
              {canManageRoles && (
                <select
                  onChange={(e) => {
                    if (e.target.value) assignMutation.mutate({ userId: m.user_id, roleId: e.target.value });
                    e.target.value = '';
                  }}
                  defaultValue=""
                  className="rounded-lg border border-[var(--color-hairline)] bg-[var(--color-surface-raised)] px-2 py-1 text-[11px]"
                >
                  <option value="" disabled>
                    + Add role
                  </option>
                  {roles
                    .filter((r) => !r.is_default && !memberRoleIds.includes(r.id))
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                </select>
              )}
              {!isOwnerRow && (canKick || canBan) && (
                <div className="flex gap-1">
                  {canKick && (
                    <button
                      onClick={() => window.confirm(`Kick ${memberProfile?.display_name}?`) && kickMutation.mutate(m.user_id)}
                      className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-ink)]"
                      title="Kick"
                      aria-label={`Kick ${memberProfile?.display_name}`}
                    >
                      <UserX size={13} />
                    </button>
                  )}
                  {canBan && (
                    <button
                      onClick={() => window.confirm(`Ban ${memberProfile?.display_name}? They won't be able to rejoin.`) && banMutation.mutate(m.user_id)}
                      className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--color-ink-muted)] hover:bg-red-500/10 hover:text-red-400"
                      title="Ban"
                      aria-label={`Ban ${memberProfile?.display_name}`}
                    >
                      <Ban size={13} />
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function InvitesTab({ space }: { space: { id: string; invite_code: string } }) {
  const [copied, setCopied] = useState(false);
  const inviteLink = typeof window !== 'undefined' ? `${window.location.origin}/join/${space.invite_code}` : `/join/${space.invite_code}`;

  function handleCopy() {
    navigator.clipboard.writeText(inviteLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="max-w-lg">
      <h2 className="mb-1 text-lg font-semibold">Invites</h2>
      <p className="mb-5 text-[12.5px] text-[var(--color-ink-muted)]">
        Anyone with this link can join. Per your request, the invite also shows this space&apos;s ID directly, not
        just the invite code.
      </p>

      <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-[var(--color-ink-faint)]">Invite Link</label>
      <div className="mb-4 flex items-center gap-2 rounded-lg border border-[var(--color-hairline)] bg-[var(--color-surface-raised)] px-3 py-2">
        <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--color-ink-muted)]">{inviteLink}</span>
        <button onClick={handleCopy} className="flex shrink-0 items-center gap-1 text-[12px] font-medium text-[var(--presence-default-a)]">
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-[var(--color-ink-faint)]">Server ID</label>
      <div className="flex items-center gap-2 rounded-lg border border-[var(--color-hairline)] bg-[var(--color-surface-raised)] px-3 py-2">
        <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-[var(--color-ink-muted)]">{space.id}</span>
        <button
          onClick={() => navigator.clipboard.writeText(space.id)}
          className="flex shrink-0 items-center gap-1 text-[12px] font-medium text-[var(--presence-default-a)]"
        >
          <Copy size={13} /> Copy
        </button>
      </div>
    </div>
  );
}
