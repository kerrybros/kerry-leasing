/**
 * Public Privacy Policy — required for A2P 10DLC campaign registration.
 * Must be reachable without auth (see middleware isPublicRoute).
 *
 * Legal entity is "Kerry Brothers Truck Repair" (the registered/approved
 * A2P Brand). "Kerry Leasing" is only a product/portal name it operates —
 * the Overview section bridges Brand ↔ program ↔ kerryleasing.com domain
 * so campaign vetting doesn't flag a name/website mismatch. The SMS section
 * carries the carrier-mandated clauses: non-sharing of mobile numbers,
 * message frequency, and "message and data rates may apply".
 */

import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy — Kerry Brothers Truck Repair',
  description:
    'Privacy Policy for Kerry Brothers Truck Repair, including the Kerry Leasing SMS messaging program.',
  // Unlisted compliance page: reachable by direct URL (and by Twilio/TCR
  // vetting) but kept out of search engines. noindex does not block fetching.
  robots: { index: false, follow: false },
};

const LAST_UPDATED = 'May 15, 2026';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold text-white">{title}</h2>
      <div className="space-y-3 text-[0.95rem] leading-relaxed" style={{ color: 'rgba(255,255,255,0.7)' }}>
        {children}
      </div>
    </section>
  );
}

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen" style={{ background: '#0f1923', color: '#fff' }}>
      <header className="border-b" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
        <div className="max-w-3xl mx-auto px-6 py-5 flex items-center justify-between">
          <Link href="/" className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.75)' }}>
            Kerry Brothers Truck Repair
          </Link>
          <Link href="/terms" className="text-sm" style={{ color: '#d9a528' }}>
            SMS Terms &amp; Conditions
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12 space-y-10">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-white">Privacy Policy</h1>
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
            Last updated {LAST_UPDATED}
          </p>
        </div>

        <Section title="Who We Are">
          <p>
            Kerry Brothers Truck Repair (&ldquo;Kerry Brothers Truck Repair,&rdquo; &ldquo;we,&rdquo;
            &ldquo;us,&rdquo; or &ldquo;our&rdquo;) operates <strong>Kerry Leasing</strong>, a fleet
            management portal and driver safety program, including this website (
            <span style={{ color: 'rgba(255,255,255,0.85)' }}>kerryleasing.com</span>) and an SMS
            text messaging service. &ldquo;Kerry Leasing&rdquo; is a product and program name
            operated by Kerry Brothers Truck Repair and is not a separate legal entity. This Privacy
            Policy explains what information we collect, how we use it, and the specific privacy
            terms that apply to our SMS messaging program.
          </p>
        </Section>

        <Section title="Information We Collect">
          <p>In connection with the driver safety program and SMS service, we collect:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Driver name and mobile phone number;</li>
            <li>Employer or fleet operator affiliation;</li>
            <li>
              Vehicle telematics and driver safety/performance data used to generate the personalized
              scorecard;
            </li>
            <li>Message delivery metadata (e.g., delivery status, opt-out status).</li>
          </ul>
        </Section>

        <Section title="How We Use Information">
          <p>We use this information solely to:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>
              Send enrolled drivers a weekly text message containing a secure link to their
              personalized driver safety and performance scorecard;
            </li>
            <li>Send occasional related account or service messages;</li>
            <li>Operate, maintain, and improve the fleet driver safety program.</li>
          </ul>
        </Section>

        <Section title="SMS / Mobile Information — No Sharing for Marketing">
          <p>
            <strong style={{ color: 'rgba(255,255,255,0.9)' }}>
              We do not sell, rent, or share mobile phone numbers, SMS opt-in, or consent data with
              any third parties or affiliates for marketing or promotional purposes.
            </strong>{' '}
            Mobile information obtained through the SMS program is used only to deliver the messages
            described in our{' '}
            <Link href="/terms" style={{ color: '#d9a528' }}>
              SMS Terms &amp; Conditions
            </Link>
            .
          </p>
          <p>
            We share mobile information only with our SMS delivery provider (Twilio) strictly to
            transmit the messages you are enrolled to receive, and only as required to comply with
            applicable law or legal process.
          </p>
        </Section>

        <Section title="Message Frequency & Rates">
          <p>
            The SMS program sends recurring messages — approximately one (1) message per week, plus
            occasional account or service messages. Message frequency may vary.{' '}
            <strong style={{ color: 'rgba(255,255,255,0.9)' }}>
              Message and data rates may apply.
            </strong>{' '}
            Contact your wireless carrier for details about your plan.
          </p>
        </Section>

        <Section title="Opting Out">
          <p>
            You can opt out of SMS messages at any time by replying <strong>STOP</strong> to any
            message. For help, reply <strong>HELP</strong> or contact us using the information
            below. Full instructions are in our{' '}
            <Link href="/terms" style={{ color: '#d9a528' }}>
              SMS Terms &amp; Conditions
            </Link>
            .
          </p>
        </Section>

        <Section title="Data Retention & Security">
          <p>
            We retain mobile and program information only as long as needed to operate the driver
            safety program and to meet legal or recordkeeping obligations, and we apply reasonable
            technical and organizational measures to protect it.
          </p>
        </Section>

        <Section title="Children's Privacy">
          <p>
            This service is intended for commercial fleet drivers and is not directed to individuals
            under 18. We do not knowingly collect information from children.
          </p>
        </Section>

        <Section title="Changes to This Policy">
          <p>
            We may update this Privacy Policy from time to time. Changes are effective when posted on
            this page, and the &ldquo;Last updated&rdquo; date will be revised accordingly.
          </p>
        </Section>

        <Section title="Contact Us">
          <p>
            Questions about this Privacy Policy or the SMS program:
            <br />
            Kerry Brothers Truck Repair
            <br />
            Email:{' '}
            <a href="mailto:james@kerrybros.com" style={{ color: '#d9a528' }}>
              james@kerrybros.com
            </a>
          </p>
        </Section>
      </main>

      <footer
        className="border-t py-6 text-center text-xs"
        style={{ borderColor: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.25)' }}
      >
        &copy; {new Date().getFullYear()} Kerry Brothers Truck Repair. Kerry Leasing is a fleet
        portal and SMS program operated by Kerry Brothers Truck Repair.
      </footer>
    </div>
  );
}
