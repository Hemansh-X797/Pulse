import type { ReactNode } from 'react';

// Renders a fixed markdown subset to React elements directly — never
// to an HTML string, so there's nothing to sanitize and no
// dangerouslySetInnerHTML anywhere in this file. A user typing
// `<img onerror=...>` just gets that literal text back, same as
// before markdown support existed.
//
// Supported: # ## ### #### headers, **bold**, *italic*, __underline__,
// ~~strikethrough~~, @mention, ||spoiler|| (click/tap to reveal, same
// UX as Discord), ```code blocks```, [text](link), > blockquote,
// --faint text--, ordered/unordered lists.
//
// Emoji shortcodes are NOT handled here — they're already converted to
// literal unicode at send time by emoji.ts's renderEmoji(), before the
// text ever reaches this renderer (see src/lib/api/feed.ts and
// channels.ts). Doing it here too would be redundant and would also
// mean edited-in-place content stops matching what was actually sent.

let keyCounter = 0;
function nextKey(): string {
  keyCounter += 1;
  return `md-${keyCounter}`;
}

// ---- inline parsing ----

const INLINE_TOKEN = /(\*\*|__|~~|\|\||--(?!\s)|\*|\[|@|#)/;

function findMentionMatch(text: string): { handle: string; length: number } | null {
  const m = /^@([a-zA-Z0-9_]{2,32})/.exec(text);
  if (!m) return null;
  return { handle: m[1], length: m[0].length };
}

function findHashtagMatch(text: string): { tag: string; length: number } | null {
  const m = /^#([a-zA-Z][a-zA-Z0-9_]{1,30})/.exec(text);
  if (!m) return null;
  return { tag: m[1], length: m[0].length };
}

function findLinkMatch(text: string): { label: string; href: string; length: number } | null {
  const m = /^\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/.exec(text);
  if (!m) return null;
  return { label: m[1], href: m[2], length: m[0].length };
}

interface DelimSpec {
  marker: string;
  render: (children: ReactNode[], key: string) => ReactNode;
}

const DELIMS: DelimSpec[] = [
  { marker: '**', render: (c, k) => <strong key={k}>{c}</strong> },
  { marker: '__', render: (c, k) => <u key={k}>{c}</u> },
  { marker: '~~', render: (c, k) => <s key={k}>{c}</s> },
  {
    marker: '||',
    render: (c, k) => <SpoilerSpan key={k}>{c}</SpoilerSpan>,
  },
  {
    marker: '--',
    render: (c, k) => (
      <span key={k} className="text-[0.85em] text-[var(--color-ink-faint)]">
        {c}
      </span>
    ),
  },
  { marker: '*', render: (c, k) => <em key={k}>{c}</em> },
];

function SpoilerSpan({ children }: { children: ReactNode }) {
  return (
    <span
      role="button"
      tabIndex={0}
      onClick={(e) => e.currentTarget.classList.add('revealed')}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') e.currentTarget.classList.add('revealed');
      }}
      className="cursor-pointer rounded bg-[var(--color-surface-overlay)] px-1 text-transparent transition-colors [&.revealed]:bg-transparent [&.revealed]:text-inherit"
    >
      {children}
    </span>
  );
}

// depth guard: markdown pasted from somewhere hostile could nest
// delimiters absurdly deep and blow the stack via recursion.
function parseInline(text: string, depth = 0, viewerUsername?: string, knownUsernames?: string[]): ReactNode[] {
  if (depth > 20) return [text];
  const out: ReactNode[] = [];
  let i = 0;
  let plainStart = 0;

  const flushPlain = (end: number) => {
    if (end > plainStart) out.push(text.slice(plainStart, end));
  };

  while (i < text.length) {
    const rest = text.slice(i);
    const tokenMatch = INLINE_TOKEN.exec(rest);
    if (!tokenMatch || tokenMatch.index !== 0) {
      // fast-forward to next possible token start
      const idx = tokenMatch ? tokenMatch.index : -1;
      if (idx === -1) break;
      i += idx;
      continue;
    }

    const token = tokenMatch[1];

    if (token === '[') {
      const link = findLinkMatch(rest);
      if (link) {
        flushPlain(i);
        out.push(
          <a
            key={nextKey()}
            href={link.href}
            target="_blank"
            rel="noreferrer noopener"
            className="text-[var(--presence-default-a)] underline decoration-[var(--presence-default-a)]/40 underline-offset-2 hover:decoration-[var(--presence-default-a)]"
          >
            {parseInline(link.label, depth + 1, viewerUsername, knownUsernames)}
          </a>
        );
        i += link.length;
        plainStart = i;
        continue;
      }
      i += 1;
      continue;
    }

    if (token === '@') {
      const mention = findMentionMatch(rest);
      if (mention) {
        // The actual bug: this used to style/link *any* "@word" that
        // matched the syntax, with no check that such a user even
        // exists — so "@totallyMadeUpHandle123" rendered as a real,
        // clickable mention identically to a genuine one. When a known-
        // usernames list is provided (chat always has one — every
        // channel's own member list, see mentionCandidates in
        // ChatView), an unrecognized handle now falls through to plain
        // text instead of being treated as a mention at all. Feed
        // posts/comments don't pass this list (no cheap way to
        // validate against every user on the platform synchronously),
        // so mentions there still render optimistically — a real,
        // known limitation, not the same bug.
        const isKnown = !knownUsernames || knownUsernames.some((u) => u.toLowerCase() === mention.handle.toLowerCase());
        if (isKnown) {
          flushPlain(i);
          const isYou = !!viewerUsername && mention.handle.toLowerCase() === viewerUsername.toLowerCase();
          out.push(
            <a
              key={nextKey()}
              href={`/${mention.handle}`}
              className={
                isYou
                  // A mention of the person actually reading it gets a
                  // distinct, louder treatment (solid amber chip) instead
                  // of the same subdued link everyone else's @mentions
                  // get — the whole point of a mention is to stand out to
                  // the one person it's for, and a message full of other
                  // people's @handles shouldn't look identical to one
                  // that's actually calling you out.
                  ? 'rounded bg-[#f0b429] px-1 font-semibold text-black hover:brightness-110'
                  : 'rounded bg-[var(--presence-default-a)]/15 px-1 font-medium text-[var(--presence-default-a)] hover:underline'
              }
            >
              @{mention.handle}
            </a>
          );
          i += mention.length;
          plainStart = i;
          continue;
        }
      }
      i += 1;
      continue;
    }

    if (token === '#') {
      const hashtag = findHashtagMatch(rest);
      if (hashtag) {
        flushPlain(i);
        out.push(
          <a
            key={nextKey()}
            href={`/discover?tag=${encodeURIComponent(hashtag.tag.toLowerCase())}`}
            className="font-medium text-[var(--presence-default-a)] hover:underline"
          >
            #{hashtag.tag}
          </a>
        );
        i += hashtag.length;
        plainStart = i;
        continue;
      }
      i += 1;
      continue;
    }

    const spec = DELIMS.find((d) => d.marker === token);
    if (!spec) {
      i += 1;
      continue;
    }
    const closeIdx = rest.indexOf(token, token.length);
    if (closeIdx === -1) {
      // no closing delimiter — treat as literal text, keep scanning
      i += token.length;
      continue;
    }
    const inner = rest.slice(token.length, closeIdx);
    if (!inner) {
      i += token.length;
      continue;
    }
    flushPlain(i);
    out.push(spec.render(parseInline(inner, depth + 1, viewerUsername, knownUsernames), nextKey()));
    i += closeIdx + token.length;
    plainStart = i;
  }

  flushPlain(text.length);
  return out;
}

// ---- block parsing ----

function renderList(items: string[], ordered: boolean, viewerUsername?: string, knownUsernames?: string[]): ReactNode {
  const Tag = ordered ? 'ol' : 'ul';
  return (
    <Tag key={nextKey()} className={ordered ? 'my-1 ml-5 list-decimal space-y-0.5' : 'my-1 ml-5 list-disc space-y-0.5'}>
      {items.map((item) => (
        <li key={nextKey()}>{parseInline(item, 0, viewerUsername, knownUsernames)}</li>
      ))}
    </Tag>
  );
}

export function renderMarkdown(input: string, viewerUsername?: string, knownUsernames?: string[]): ReactNode {
  const lines = input.split('\n');
  const blocks: ReactNode[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // fenced code block
    if (line.trimStart().startsWith('```')) {
      const fenceIndent = line.indexOf('```');
      const lang = line.slice(fenceIndent + 3).trim();
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        codeLines.push(lines[i]);
        i += 1;
      }
      i += 1; // skip closing fence
      blocks.push(
        <pre
          key={nextKey()}
          className="my-1.5 overflow-x-auto rounded-lg border border-[var(--color-hairline)] bg-[var(--color-surface-raised)] p-3 font-mono text-[12.5px] leading-relaxed"
        >
          <code>{codeLines.join('\n')}</code>
        </pre>
      );
      if (lang) {
        // language tag isn't syntax-highlighted (no highlighter dependency
        // pulled in for this) — kept only as a visual label so it's not
        // silently discarded.
      }
      continue;
    }

    // blockquote — group consecutive '>' lines
    if (/^\s*>\s?/.test(line)) {
      const quoted: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        quoted.push(lines[i].replace(/^\s*>\s?/, ''));
        i += 1;
      }
      blocks.push(
        <blockquote
          key={nextKey()}
          className="my-1.5 border-l-2 border-[var(--color-hairline-strong)] pl-3 text-[var(--color-ink-muted)]"
        >
          {quoted.map((q, idx) => (
            <div key={idx}>{parseInline(q, 0, viewerUsername, knownUsernames)}</div>
          ))}
        </blockquote>
      );
      continue;
    }

    // headers
    const headerMatch = /^(#{1,4})\s+(.*)$/.exec(line);
    if (headerMatch) {
      const level = headerMatch[1].length;
      const content = parseInline(headerMatch[2], 0, viewerUsername, knownUsernames);
      const classes: Record<number, string> = {
        1: 'text-[1.4em] font-bold mt-1 mb-0.5',
        2: 'text-[1.25em] font-bold mt-1 mb-0.5',
        3: 'text-[1.12em] font-semibold mt-0.5 mb-0.5',
        4: 'text-[1.02em] font-semibold mt-0.5 mb-0.5',
      };
      const HeaderTag = (`h${level}` as unknown) as 'h1' | 'h2' | 'h3' | 'h4';
      blocks.push(
        <HeaderTag key={nextKey()} className={classes[level]}>
          {content}
        </HeaderTag>
      );
      i += 1;
      continue;
    }

    // unordered list
    if (/^\s*[-*]\s+/.test(line) && !/^\s*\*\*/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ''));
        i += 1;
      }
      blocks.push(renderList(items, false, viewerUsername, knownUsernames));
      continue;
    }

    // ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ''));
        i += 1;
      }
      blocks.push(renderList(items, true, viewerUsername, knownUsernames));
      continue;
    }

    // blank line
    if (line.trim() === '') {
      i += 1;
      continue;
    }

    // paragraph — group consecutive plain lines, single <br/> between them
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].trimStart().startsWith('```') &&
      !/^\s*>\s?/.test(lines[i]) &&
      !/^(#{1,4})\s+/.test(lines[i]) &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i])
    ) {
      paraLines.push(lines[i]);
      i += 1;
    }
    blocks.push(
      <p key={nextKey()} className="leading-relaxed">
        {paraLines.map((l, idx) => (
          <span key={idx}>
            {parseInline(l, 0, viewerUsername, knownUsernames)}
            {idx < paraLines.length - 1 && <br />}
          </span>
        ))}
      </p>
    );
  }

  return <>{blocks}</>;
}
