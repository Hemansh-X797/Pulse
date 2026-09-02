export interface AvatarDecorationDef {
  id: string;
  label: string;
}

// Allowlist — equipped_avatar_decoration is stored as plain text (not a
// DB enum, so new ones can ship without a migration) but is never
// trusted directly as a file path. Anything not in this list renders as
// "no decoration" rather than attempting to load an arbitrary filename.
// Same pattern as src/lib/nameplates.ts.
export const AVATAR_DECORATIONS: AvatarDecorationDef[] = [
  { id: 'halo', label: 'Halo' },
  { id: 'thorns', label: 'Thorns' },
  { id: 'circuit', label: 'Circuit' },
  { id: 'stars', label: 'Stars' },
  { id: 'flame-ring', label: 'Flame Ring' },
  { id: 'crown', label: 'Crown' },
];

export function isValidDecorationId(id: string | null | undefined): id is string {
  return !!id && AVATAR_DECORATIONS.some((d) => d.id === id);
}

export function decorationSrc(id: string): string {
  return `/avatar-decorations/${id}.svg`;
}
