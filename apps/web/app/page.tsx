import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { Truck, Wrench, FileText } from 'lucide-react';

export default async function HomePage() {
  const { userId } = auth();

  if (userId) {
    redirect('/app/fleet');
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#0f1923', color: '#fff' }}>

      {/* Ambient background — gradient blobs + grid (same as sign-in) */}
      <div
        aria-hidden
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 70% 55% at 15% 15%, rgba(217,165,40,0.16) 0%, transparent 70%), radial-gradient(ellipse 55% 70% at 85% 85%, rgba(217,165,40,0.10) 0%, transparent 60%), radial-gradient(ellipse 40% 40% at 50% 50%, rgba(217,165,40,0.04) 0%, transparent 70%)',
        }}
      />
      <div
        aria-hidden
        className="fixed inset-0 pointer-events-none opacity-[0.035]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />

      {/* Header — minimal, just Sign In */}
      <header className="relative z-10">
        <div className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-end">
          <Link
            href="/sign-in"
            className="inline-flex items-center px-5 py-2 rounded-lg text-sm font-semibold transition-opacity hover:opacity-85"
            style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.75)', border: '1px solid rgba(255,255,255,0.1)' }}
          >
            Sign In
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="relative z-10 flex-1 flex flex-col items-center justify-center text-center px-6 py-16">
        <div className="max-w-2xl mx-auto flex flex-col items-center gap-10">

          {/* Logo card — the hero centrepiece */}
          <div
            className="w-full rounded-2xl px-10 py-8 flex flex-col items-center gap-6 shadow-2xl shadow-black/40"
            style={{
              background: 'rgba(255,255,255,0.97)',
              border: '1px solid rgba(255,255,255,0.15)',
            }}
          >
            {/* Top gold accent */}
            <div className="w-12 h-1 rounded-full" style={{ background: '#d9a528' }} />

            <div className="flex flex-col sm:flex-row items-center gap-6 sm:gap-10">
              <Image
                src="/logos/Kerry Leasing Logo.png"
                alt="Kerry Leasing"
                width={200}
                height={68}
                className="h-14 w-auto object-contain"
                priority
              />
              <div className="w-px h-14 hidden sm:block" style={{ background: '#e5e7eb' }} />
              <div className="h-px w-20 sm:hidden" style={{ background: '#e5e7eb' }} />
              <Image
                src="/logos/Kerry Brothers Truck Repair Logo Transpaent.png"
                alt="Kerry Brothers Truck Repair"
                width={240}
                height={82}
                className="h-16 w-auto object-contain"
              />
            </div>
          </div>

          {/* Headline + CTA */}
          <div className="space-y-4">
            <h1 className="text-5xl sm:text-6xl font-bold tracking-tight leading-tight text-white">
              Your fleet.<br />One portal.
            </h1>
            <p className="text-sm uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.4)' }}>
              Telematics · Repairs · Driver Performance
            </p>
          </div>

          <Link
            href="/sign-in"
            className="inline-flex items-center px-12 py-3.5 rounded-lg text-base font-semibold transition-opacity hover:opacity-90"
            style={{ background: '#d9a528', color: '#0f1923' }}
          >
            Sign In
          </Link>
        </div>
      </section>

      {/* Feature columns */}
      <section className="relative z-10 border-t" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
        <div className="max-w-5xl mx-auto px-6 py-20">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                icon: Truck,
                title: 'Fleet Telematics',
                body: 'MPG, idle time, and mileage across every unit.',
              },
              {
                icon: Wrench,
                title: 'Repair Tracking',
                body: 'Full repair history with damage flagging and job counts.',
              },
              {
                icon: FileText,
                title: 'Fixed-Cost Clarity',
                body: 'No invoices, no surprises. Just performance.',
              },
            ].map(({ icon: Icon, title, body }) => (
              <div
                key={title}
                className="rounded-xl p-6 flex flex-col gap-4"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{ background: 'rgba(217,165,40,0.15)' }}
                >
                  <Icon className="w-5 h-5" style={{ color: '#d9a528' }} />
                </div>
                <h3 className="text-base font-semibold text-white">{title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.45)' }}>
                  {body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t py-6 text-center text-xs" style={{ borderColor: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.25)' }}>
        &copy; {new Date().getFullYear()} Kerry Leasing. All rights reserved.
      </footer>
    </div>
  );
}
