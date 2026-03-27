import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { Truck, Wrench, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default async function HomePage() {
  const { userId } = auth();

  if (userId) {
    redirect('/app/fleet');
  }

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-primary)] text-[var(--text-primary)]">
      {/* Header */}
      <header className="border-b border-[var(--border)] bg-[var(--bg-secondary)]">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4 bg-white rounded-lg px-3 py-2">
            <Image
              src="/logos/Kerry Leasing Logo.png"
              alt="Kerry Leasing"
              width={160}
              height={54}
              className="h-10 w-auto object-contain"
              priority
            />
            <div className="w-px h-10 bg-gray-200" />
            <Image
              src="/logos/Kerry Brothers Truck Repair Logo Transpaent.png"
              alt="Kerry Brothers Truck Repair"
              width={200}
              height={68}
              className="h-12 w-auto object-contain"
            />
          </div>
          <Link href="/sign-in">
            <Button>Sign In</Button>
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="flex-1 flex flex-col items-center justify-center text-center px-6 py-24">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-[var(--text-primary)] mb-6">
            Full-service fleet management built for fixed-cost contracts.
          </h1>
          <p className="text-lg text-[var(--text-secondary)] mb-10 max-w-xl mx-auto">
            One portal for telematics, repair history, and driver performance — purpose-built for Kerry Leasing customers.
          </p>
          <Link href="/sign-in">
            <Button size="lg" className="px-10 text-base">
              Sign In to Your Portal
            </Button>
          </Link>
        </div>
      </section>

      {/* Feature columns */}
      <section className="border-t border-[var(--border)] bg-[var(--bg-secondary)]">
        <div className="max-w-5xl mx-auto px-6 py-20">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            <div className="flex flex-col gap-4">
              <div className="w-10 h-10 rounded-lg bg-[var(--primary)]/10 flex items-center justify-center">
                <Truck className="w-5 h-5 text-[var(--primary)]" />
              </div>
              <h3 className="text-lg font-semibold text-[var(--text-primary)]">Fleet Telematics</h3>
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                MPG, idle time, and miles visibility across your entire fleet. Monthly trends, unit breakdowns, and top-performer rankings in one view.
              </p>
            </div>

            <div className="flex flex-col gap-4">
              <div className="w-10 h-10 rounded-lg bg-[var(--primary)]/10 flex items-center justify-center">
                <Wrench className="w-5 h-5 text-[var(--primary)]" />
              </div>
              <h3 className="text-lg font-semibold text-[var(--text-primary)]">Repair Tracking</h3>
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                Complete repair history with damage flagging and job counts. Know exactly what work has been done on every unit in your fleet.
              </p>
            </div>

            <div className="flex flex-col gap-4">
              <div className="w-10 h-10 rounded-lg bg-[var(--primary)]/10 flex items-center justify-center">
                <FileText className="w-5 h-5 text-[var(--primary)]" />
              </div>
              <h3 className="text-lg font-semibold text-[var(--text-primary)]">Fixed-Cost Clarity</h3>
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                No invoices, no surprises. Track fleet performance and maintenance activity under your fixed-cost service contract.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[var(--border)] bg-[var(--bg-secondary)]">
        <div className="max-w-6xl mx-auto px-6 py-6 text-center text-sm text-[var(--text-secondary)]">
          &copy; {new Date().getFullYear()} Kerry Leasing. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
