import type { CSSProperties } from 'react';

export type NameFont = 'sans' | 'serif' | 'gothic' | 'pixel' | 'orbitron' | 'bungee' | 'marker';
export type NameEffect = 'solid' | 'gradient' | 'neon' | 'toon' | 'prism' | 'gummy' | 'chrome' | 'fire' | 'ice' | 'glitch';

export interface NameStyleData {
  font?: NameFont;
  effect?: NameEffect;
  colors?: string[];
}

const FONT_CLASS: Record<NameFont, string> = {
  sans: '',
  serif: 'name-font-serif',
  gothic: 'name-font-gothic',
  pixel: 'name-font-pixel',
  orbitron: 'name-font-orbitron',
  bungee: 'name-font-bungee',
  marker: 'name-font-marker',
};

// Minimum colors each effect actually needs — used to fall back to
// Solid/plain rather than rendering a broken-looking gradient off
// undefined custom properties if someone's saved data is incomplete
// (a partially-applied style, an older format, whatever).
const MIN_COLORS: Record<NameEffect, number> = {
  solid: 1,
  gradient: 2,
  neon: 2,
  toon: 1,
  prism: 7,
  gummy: 2,
  chrome: 2,
  fire: 2,
  ice: 2,
  glitch: 2,
};

function isValidHex(c: string): boolean {
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c);
}

/**
 * Renders `name` with the person's saved font + color effect. Always
 * degrades gracefully: an unset style, an unknown font/effect string,
 * or too-few/invalid colors all just render plain text rather than a
 * half-broken gradient or a crash — this is display-only data a person
 * fully controls about themselves, so malformed input should never be
 * able to break someone else's screen.
 */
export function NameStyle({ name, style, className }: { name: string; style: NameStyleData | null | undefined; className?: string }) {
  const font = style?.font && style.font in FONT_CLASS ? style.font : 'sans';
  const effect = style?.effect && style.effect in MIN_COLORS ? style.effect : 'solid';
  const colors = (style?.colors ?? []).filter(isValidHex);
  const hasEnoughColors = colors.length >= MIN_COLORS[effect];

  const fontClass = FONT_CLASS[font];

  if (!hasEnoughColors || effect === 'solid') {
    // Solid also lands here — it's just the font plus a single color,
    // no background-clip/text-shadow machinery needed.
    const solidColor = colors[0];
    return (
      <span className={`${fontClass} ${className ?? ''}`} style={solidColor ? { color: solidColor } : undefined}>
        {name}
      </span>
    );
  }

  if (effect === 'gradient') {
    const vars = { ['--name-c1' as string]: colors[0], ['--name-c2' as string]: colors[1] } as CSSProperties;
    return (
      <span className={`name-effect-gradient ${fontClass} ${className ?? ''}`} style={vars}>
        {name}
      </span>
    );
  }

  if (effect === 'neon') {
    const vars = { ['--name-c1' as string]: colors[0], ['--name-c2' as string]: colors[1] } as CSSProperties;
    return (
      <span className={`name-effect-neon ${fontClass} ${className ?? ''}`} style={vars}>
        {name}
      </span>
    );
  }

  if (effect === 'toon') {
    const vars = { ['--name-c1' as string]: colors[0] } as CSSProperties;
    return (
      <span className={`name-effect-toon ${fontClass} ${className ?? ''}`} style={vars}>
        {name}
      </span>
    );
  }

  if (effect === 'prism') {
    const vars = {
      ['--name-c1' as string]: colors[0],
      ['--name-c2' as string]: colors[1],
      ['--name-c3' as string]: colors[2],
      ['--name-c4' as string]: colors[3],
      ['--name-c5' as string]: colors[4],
      ['--name-c6' as string]: colors[5],
      ['--name-c7' as string]: colors[6],
    } as CSSProperties;
    return (
      <span className={`name-effect-prism ${fontClass} ${className ?? ''}`} style={vars}>
        {name}
      </span>
    );
  }

  if (effect === 'chrome') {
    const vars = { ['--name-c1' as string]: colors[0], ['--name-c2' as string]: colors[1] } as CSSProperties;
    return (
      <span className={`name-effect-chrome ${fontClass} ${className ?? ''}`} style={vars}>
        {name}
      </span>
    );
  }

  if (effect === 'fire') {
    const vars = { ['--name-c1' as string]: colors[0], ['--name-c2' as string]: colors[1] } as CSSProperties;
    return (
      <span className={`name-effect-fire ${fontClass} ${className ?? ''}`} style={vars}>
        {name}
      </span>
    );
  }

  if (effect === 'ice') {
    const vars = { ['--name-c1' as string]: colors[0], ['--name-c2' as string]: colors[1] } as CSSProperties;
    return (
      <span className={`name-effect-ice ${fontClass} ${className ?? ''}`} style={vars}>
        {name}
      </span>
    );
  }

  if (effect === 'glitch') {
    const vars = { ['--name-c1' as string]: colors[0], ['--name-c2' as string]: colors[1] } as CSSProperties;
    return (
      <span className={`name-effect-glitch ${fontClass} ${className ?? ''}`} style={vars} data-glitch-text={name}>
        {name}
      </span>
    );
  }

  // Gummy: exactly 2 colors, alternating per letter. CSS alone can't
  // target "every other character" of an arbitrary text node, so this
  // wraps each character in its own span with the alternating color set
  // inline — the only effect that needs per-character markup rather
  // than a single styled span. Uses Array.from rather than .split('')
  // so multi-code-unit characters (emoji, combining diacritics, most
  // non-Latin scripts) don't get sliced apart mid-character — .split('')
  // works on raw UTF-16 code units, so a display name with an emoji or
  // e.g. Hindi/Devanagari text would previously render mangled/broken
  // halves through this effect specifically.
  const graphemes = Array.from(name);
  return (
    <span className={`${fontClass} ${className ?? ''}`}>
      {graphemes.map((char, i) => (
        <span
          key={i}
          className="name-effect-gummy-letter"
          style={{ ['--name-letter-c' as string]: colors[i % 2] } as CSSProperties}
        >
          {char}
        </span>
      ))}
    </span>
  );
}
