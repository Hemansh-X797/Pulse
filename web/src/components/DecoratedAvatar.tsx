import type { ReactNode } from 'react';
import { isValidDecorationId, decorationSrc } from '../lib/avatarDecorations';

/**
 * Wraps any avatar element with an optional decoration overlay — a ring/
 * frame image (see public/avatar-decorations/) drawn oversized and
 * centered on top of the avatar via absolute positioning, scaled to
 * whatever size the avatar itself renders at. `children` should be
 * exactly the avatar element (image or initials fallback); this only
 * adds the overlay + the extra sizing room it needs.
 */
export function DecoratedAvatar({
  decorationId,
  size,
  children,
}: {
  decorationId: string | null | undefined;
  size: number;
  children: ReactNode;
}) {
  if (!isValidDecorationId(decorationId)) return <>{children}</>;

  // Decorations extend ~15% past the avatar's own edge (see the SVGs'
  // viewBox — the ring sits inside a 100x100 box drawn around a ~92%
  // diameter circle), so the wrapper needs to be a little larger than
  // the avatar itself and the avatar centered inside it.
  const wrapperSize = Math.round(size * 1.32);

  return (
    <div className="relative shrink-0" style={{ width: wrapperSize, height: wrapperSize }}>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
      <img
        src={decorationSrc(decorationId)}
        alt=""
        className="pointer-events-none absolute inset-0 h-full w-full"
      />
    </div>
  );
}
