/**
 * Public SMS Terms & Conditions — required for A2P 10DLC campaign
 * registration. Must be reachable without auth (see middleware
 * isPublicRoute).
 *
 * Legal entity is "Kerry Brothers Truck Repair" (the registered/approved
 * A2P Brand). "Kerry Leasing" is only the product/program name it operates;
 * the Program Description ties Brand ↔ program ↔ kerryleasing.com so
 * campaign vetting doesn't flag a name/website mismatch. Contains the
 * carrier-mandated program description, opt-in/opt-out keywords, frequency,
 * cost, and carrier non-liability.
 */

import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'SMS Terms & Conditions — Kerry Brothers Truck Repair',
  description:
    'Terms and Conditions for the Kerry Leasing Driver Safety Scorecard SMS program, operated by Kerry Brothers Truck Repair.',
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

export default function SmsTermsPage() {
  return (
    <div className="min-h-screen" style={{ background: '#0f1923', color: '#fff' }}>
      <header className="border-b" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
        <div className="max-w-3xl mx-auto px-6 py-5 flex items-center justify-between">
          <Link href="/" className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.75)' }}>
            Kerry Brothers Truck Repair
          </Link>
          <Link href="/privacy" className="text-sm" style={{ color: '#d9a528' }}>
            Privacy Policy
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12 space-y-10">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-white">
            SMS Terms &amp; Conditions
          </h1>
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
            Last updated {LAST_UPDATED}
          </p>
        </div>

        <Section title="Program Description">
          <p>
            The Kerry Leasing Driver Safety Scorecard SMS program (the &ldquo;Program&rdquo;) is
            operated by <strong>Kerry Brothers Truck Repair</strong> (&ldquo;Kerry Brothers Truck
            Repair,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;). &ldquo;Kerry
            Leasing&rdquo; is a product and program name operated by Kerry Brothers Truck Repair,
            including the website at{' '}
            <span style={{ color: 'rgba(255,255,255,0.85)' }}>kerryleasing.com</span>; it is not a
            separate legal entity. The Program sends enrolled commercial fleet drivers recurring
            automated text messages containing a secure link to their personalized weekly driver
            safety and performance scorecard, along with occasional related account or service
            notifications.
          </p>
        </Section>

        <Section title="Consent & Enrollment">
          <p>
            Mobile numbers are provided by the driver or by the driver&rsquo;s employer or fleet
            operator as part of enrollment in the fleet driver safety program. By participating, you
            consent to receive the recurring messages described above at the mobile number provided.
            You may opt out at any time as described below. Consent to receive messages is not a
            condition of any purchase.
          </p>
        </Section>

        <Section title="Message Frequency">
          <p>
            The Program sends approximately one (1) message per week, plus occasional account or
            service messages. Message frequency may vary.
          </p>
        </Section>

        <Section title="Cost">
          <p>
            <strong style={{ color: 'rgba(255,255,255,0.9)' }}>
              Message and data rates may apply.
            </strong>{' '}
            Kerry Brothers Truck Repair does not charge for the messages, but your wireless
            carrier&rsquo;s standard message and data rates may apply. Contact your wireless provider
            for details about your plan.
          </p>
        </Section>

        <Section title="How to Opt Out">
          <p>
            You can cancel the SMS service at any time by replying{' '}
            <strong>STOP</strong> to any message (the keywords STOP, STOPALL, UNSUBSCRIBE, CANCEL,
            END, and QUIT are also accepted). After you send the opt-out message, you will receive a
            one-time confirmation message, and no further messages will be sent unless you re-enroll.
          </p>
          <p>
            To re-subscribe after opting out, reply <strong>START</strong> to the same number, or
            contact us using the information below.
          </p>
        </Section>

        <Section title="Help">
          <p>
            For help, reply <strong>HELP</strong> to any message, or contact{' '}
            <a href="mailto:james@kerrybros.com" style={{ color: '#d9a528' }}>
              james@kerrybros.com
            </a>
            .
          </p>
        </Section>

        <Section title="Carriers & Delivery">
          <p>
            Supported carriers include AT&amp;T, Verizon Wireless, T-Mobile, and other major U.S.
            carriers. Carriers are not liable for delayed or undelivered messages. Delivery is
            subject to effective transmission from your wireless service provider and is not
            guaranteed.
          </p>
        </Section>

        <Section title="Privacy">
          <p>
            Your information is handled in accordance with our{' '}
            <Link href="/privacy" style={{ color: '#d9a528' }}>
              Privacy Policy
            </Link>
            , which explains that we do not sell or share mobile numbers or consent data with third
            parties for marketing.
          </p>
        </Section>

        <Section title="Changes to These Terms">
          <p>
            We may modify these Terms &amp; Conditions at any time. Changes are effective when posted
            on this page, and the &ldquo;Last updated&rdquo; date will be revised accordingly.
          </p>
        </Section>

        <Section title="Contact Us">
          <p>
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
