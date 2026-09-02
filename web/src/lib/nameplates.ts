export interface NameplateDef {
  id: string;
  label: string;
}

// Allowlist — equipped_nameplate is stored as plain text (not a DB
// enum, so new ones can ship without a migration) but is never trusted
// directly as a file path. Anything not in this list renders as "no
// nameplate" rather than attempting to load an arbitrary filename.
export const NAMEPLATES: NameplateDef[] = [
  { id: 'ember', label: 'Ember' },
  { id: 'frost', label: 'Frost' },
  { id: 'void', label: 'Void' },
  { id: 'bloom', label: 'Bloom' },
  { id: 'static', label: 'Static' },
  { id: 'aurora', label: 'Aurora' },
  { id: 'galaxy', label: 'Galaxy' },
];

export function isValidNameplateId(id: string | null | undefined): id is string {
  return !!id && NAMEPLATES.some((n) => n.id === id);
}

export function nameplateSrc(id: string): string {
  return `/nameplates/${id}.svg`;
}
