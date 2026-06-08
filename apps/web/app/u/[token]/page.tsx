/**
 * Public email unsubscribe page. Mirrors /r/[token]: a server component reads
 * the route param and hands the token to a small client component that performs
 * the opt-out via an explicit button press (POST) — never on load, so email
 * link scanners can't auto-unsubscribe a driver.
 */

import { UnsubscribeForm } from './UnsubscribeForm';

export default function UnsubscribePage({ params }: { params: { token: string } }) {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <UnsubscribeForm token={params.token} />
    </div>
  );
}
