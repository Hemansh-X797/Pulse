import Link from 'next/link';

export const metadata = { title: 'Privacy Policy — PalSpace' };

export default function PrivacyPage() {
  return (
    <div className="mx-auto min-h-screen max-w-2xl px-6 py-12 text-[var(--color-ink)]">
      <Link href="/" className="mb-8 inline-block text-[13px] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]">
        ← Back to PalSpace
      </Link>

      <h1 className="mb-1 font-serif text-3xl font-semibold">Privacy Policy</h1>
      <p className="mb-8 text-[13px] text-[var(--color-ink-faint)]">Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>

      <div className="mb-8 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-[13px] leading-relaxed text-amber-200">
        This describes what PalSpace actually collects and stores today, based on the real schema and integrations
        in the codebase — not generic boilerplate. It still isn&apos;t legal advice; have it reviewed before you
        treat it as final, especially if you ever handle EU/UK users (GDPR) or California residents (CCPA), which
        have specific disclosure requirements not fully spelled out below.
      </div>

      <div className="space-y-6 text-[14px] leading-relaxed text-[var(--color-ink-muted)]">
        <Section title="1. What we collect">
          <ul className="ml-4 list-disc space-y-1">
            <li>Account info: email, username, display name, password (hashed by Supabase Auth — PalSpace never sees it in plain text).</li>
            <li>Profile info you add: bio, pronouns, avatar/banner images, accent colors, interests.</li>
            <li>Content you create: posts, comments, messages, stories, reactions, and any images/video you upload.</li>
            <li>Usage data: who you&apos;re friends with, which spaces you&apos;ve joined, read/unread status, presence (online/offline).</li>
            <li>If you connect Google, Discord, or GitHub: your email and profile info from that provider, as permitted by their own consent screens.</li>
          </ul>
        </Section>

        <Section title="2. How we use it">
          To run PalSpace: showing your feed and messages to the right people, enforcing blocks and privacy
          settings, sending notifications you&apos;ve opted into, and letting you find friends and spaces via
          search.
        </Section>

        <Section title="3. Where it's stored">
          Account data, messages, posts, and uploaded media are stored with Supabase (Postgres database + file
          storage), governed by row-level security policies that determine who can read what — for example, direct
          messages are only ever readable by their participants, private spaces only by their members.
        </Section>

        <Section title="4. Third parties">
          <ul className="ml-4 list-disc space-y-1">
            <li>Supabase — hosts the database, authentication, and file storage.</li>
            <li>Google / Discord / GitHub — only if you choose to sign in or link an account with them.</li>
            <li>Giphy / Tenor — only when you search for a GIF; your search query is sent to whichever provider you&apos;re using.</li>
            <li>When you post a link, PalSpace&apos;s own server fetches that page&apos;s preview info (title/image) — the linked site sees a request from PalSpace&apos;s server, not from you directly.</li>
          </ul>
          PalSpace does not sell your data to advertisers or data brokers.
        </Section>

        <Section title="5. Your controls">
          <ul className="ml-4 list-disc space-y-1">
            <li>Edit or delete your posts, comments, and messages at any time.</li>
            <li>Block other users — this hides you from each other in feeds, DMs, and friend requests.</li>
            <li>Control notification types individually in Settings → Notifications.</li>
            <li>Delete your account, which removes your profile and content per Supabase&apos;s cascade-delete rules on account deletion.</li>
          </ul>
        </Section>

        <Section title="6. Data retention">
          Stories are automatically deleted 24 hours after posting. Other content (posts, messages, profile data)
          is kept until you delete it or delete your account.
        </Section>

        <Section title="7. Children's privacy">
          PalSpace isn&apos;t intended for children under 13, and we don&apos;t knowingly collect data from them.
        </Section>

        <Section title="8. Changes to this policy">
          If this policy changes materially, the date at the top of this page will be updated.
        </Section>

        <Section title="9. Contact">
          Questions about your data? Reach out through the contact details on the PalSpace landing page.
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-1.5 text-[15px] font-semibold text-[var(--color-ink)]">{title}</h2>
      <div>{children}</div>
    </section>
  );
}
