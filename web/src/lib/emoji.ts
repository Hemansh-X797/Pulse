// Direct TypeScript port of server/src/common/emoji_map.hpp +
// emoji_renderer.hpp. Same shortcode set, same one-pass scan algorithm —
// this is genuinely the same logic, not a rewrite from scratch, so
// behavior matches the C++ version exactly (same unknown-shortcode
// fallback, same token character rules).

export const EMOJI_MAP: Record<string, string> = {
  fire: '\u{1F525}',
  heart: '\u2764\uFE0F',
  joy: '\u{1F602}',
  laughing: '\u{1F606}',
  smile: '\u{1F604}',
  cry: '\u{1F622}',
  sob: '\u{1F62D}',
  thumbsup: '\u{1F44D}',
  '+1': '\u{1F44D}',
  thumbsdown: '\u{1F44E}',
  '-1': '\u{1F44E}',
  clap: '\u{1F44F}',
  eyes: '\u{1F440}',
  skull: '\u{1F480}',
  '100': '\u{1F4AF}',
  tada: '\u{1F389}',
  rocket: '\u{1F680}',
  star: '\u2B50',
  star2: '\u{1F31F}',
  sparkles: '\u2728',
  thinking: '\u{1F914}',
  wave: '\u{1F44B}',
  pray: '\u{1F64F}',
  ok_hand: '\u{1F44C}',
  muscle: '\u{1F4AA}',
  heart_eyes: '\u{1F60D}',
  sunglasses: '\u{1F60E}',
  angry: '\u{1F620}',
  scream: '\u{1F631}',
  peace: '\u270C\uFE0F',
  pizza: '\u{1F355}',
  coffee: '\u2615',
  beers: '\u{1F37B}',
  moneybag: '\u{1F4B0}',
  gem: '\u{1F48E}',
  trophy: '\u{1F3C6}',
  warning: '\u26A0\uFE0F',
  x: '\u274C',
  check: '\u2705',
  heavy_check_mark: '\u2714\uFE0F',
  question: '\u2753',
  exclamation: '\u2757',
  zzz: '\u{1F4A4}',
  raised_hands: '\u{1F64C}',
  handshake: '\u{1F91D}',
  broken_heart: '\u{1F494}',
  purple_heart: '\u{1F49C}',
  blue_heart: '\u{1F499}',
  green_heart: '\u{1F49A}',
  yellow_heart: '\u{1F49B}',
  black_heart: '\u{1F5A4}',
  rofl: '\u{1F923}',
  ghost: '\u{1F47B}',
  alien: '\u{1F47D}',
  robot: '\u{1F916}',
  unicorn: '\u{1F984}',
  rainbow: '\u{1F308}',
  sun: '\u2600\uFE0F',
  moon: '\u{1F319}',
  cloud: '\u2601\uFE0F',
  snowflake: '\u2744\uFE0F',
  sparkle: '\u2747\uFE0F',
  party_popper: '\u{1F389}',
};

function isShortcodeChar(c: string): boolean {
  return /[a-zA-Z0-9_+-]/.test(c);
}

/**
 * Expands every `:token:` span whose token is a known shortcode into the
 * corresponding unicode emoji. Unknown tokens are left as literal text
 * (":notarealthing:" stays ":notarealthing:"), matching the C++
 * renderer's fallback behavior exactly — this is intentional, not a bug,
 * and several bugs elsewhere in this project were actually confirmations
 * that this fallback was working as designed.
 */
export function renderEmoji(input: string): string {
  let out = '';
  let i = 0;
  const n = input.length;

  while (i < n) {
    if (input[i] === ':') {
      let j = i + 1;
      while (j < n && isShortcodeChar(input[j])) j++;
      if (j < n && input[j] === ':' && j > i + 1) {
        const token = input.slice(i + 1, j);
        const emoji = EMOJI_MAP[token];
        if (emoji) {
          out += emoji;
          i = j + 1;
          continue;
        }
      }
    }
    out += input[i];
    i++;
  }
  return out;
}
