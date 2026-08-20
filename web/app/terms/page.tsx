import Link from 'next/link';

export const metadata = { title: 'Terms of Service — PalSpace' };

export default function TermsPage() {
  return (
    <div className="mx-auto min-h-screen max-w-2xl px-6 py-12 text-[var(--color-ink)]">
      <Link href="/" className="mb-8 inline-block text-[13px] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]">
        ← Back to PalSpace
      </Link>

      <h1 className="mb-1 font-serif text-3xl font-semibold">Terms of Service</h1>
      <p className="mb-8 text-[13px] text-[var(--color-ink-faint)]">Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>

      <div className="mb-8 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-[13px] leading-relaxed text-amber-200">
        This is a starting template covering the standard sections a chat/social app needs, written to match what
        PalSpace actually does. It is not legal advice, and hasn't been reviewed by a lawyer. Have one look it over
        — especially the age/eligibility, liability, and termination sections — before treating this as final.
      </div>

      <div className="space-y-6 text-[14px] leading-relaxed text-[var(--color-ink-muted)]">
        <Section title="1. Acceptance of terms">
          By creating an account or using PalSpace, you agree to these Terms of Service and the{' '}
          <Link href="/privacy" className="text-[var(--presence-default-a)] underline">
            Privacy Policy
          </Link>
          . If you don&apos;t agree, don&apos;t use PalSpace.
        </Section>

        <Section title="2. Eligibility">
          You must be at least 13 years old to use PalSpace. If you&apos;re under the age of majority where you
          live, you confirm you have a parent or guardian&apos;s permission to use it.
        </Section>

        <Section title="3. Your account">
          You&apos;re responsible for what happens under your account, including anything posted, sent, or done
          using it. Keep your login credentials to yourself. Tell us if you think your account has been
          compromised.
        </Section>

        <Section title="4. Content you post">
          You own what you post — text, images, video, anything you upload to PalSpace. By posting it, you give
          PalSpace a license to store, display, and transmit it as needed to operate the service (e.g. showing your
          posts to your friends, serving your uploaded images from storage). You&apos;re responsible for making sure
          you have the right to post what you post.
        </Section>

        <Section title="5. Acceptable use">
          Don&apos;t use PalSpace to: harass or threaten others; post illegal content, including content that
          sexualizes minors in any way; impersonate someone else; spam; upload malware; or attempt to access other
          people&apos;s accounts or data without permission. Space owners are responsible for moderating their own
          spaces.
        </Section>

        <Section title="6. Third-party services">
          PalSpace uses third-party services to work — Supabase for data storage and authentication, and
          optionally Google, Discord, or GitHub if you choose to sign in with them, and Giphy/Tenor if you search
          for GIFs. Their own terms and privacy policies apply to your use of those integrations.
        </Section>

        <Section title="7. Termination">
          You can delete your account at any time from Settings. We can suspend or terminate accounts that violate
          these terms, including posting illegal content or harassing other users.
        </Section>

        <Section title="8. Disclaimers">
          PalSpace is provided &ldquo;as is,&rdquo; without warranties of any kind. We don&apos;t guarantee it will
          always be available, bug-free, or lossless — back up anything that matters to you elsewhere.
        </Section>

        <Section title="9. Changes to these terms">
          These terms may change as PalSpace changes. Material changes will be reflected by updating the date at
          the top of this page.
        </Section>

        <Section title="10. Contact">
          Questions about these terms? Reach out through the contact details on the PalSpace landing page.
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-1.5 text-[15px] font-semibold text-[var(--color-ink)]">{title}</h2>
      <p>{children}</p>
    </section>
  );
}
