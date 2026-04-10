import { SignIn } from '@clerk/nextjs';
import Image from 'next/image';

export default function SignInPage() {
  return (
    <div className="min-h-screen flex bg-[#0f1923]">
      {/* Left panel — branding */}
      <div className="hidden lg:flex flex-col justify-between w-[42%] px-14 py-12 relative overflow-hidden">
        {/* Background gradient blobs */}
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(ellipse 80% 60% at 10% 20%, rgba(217,165,40,0.18) 0%, transparent 70%), radial-gradient(ellipse 60% 80% at 90% 80%, rgba(217,165,40,0.10) 0%, transparent 60%)',
          }}
        />
        {/* Subtle grid lines */}
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none opacity-[0.04]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />

        {/* Logo row */}
        <div className="relative z-10 flex items-center gap-4">
          <div className="bg-white rounded-xl px-4 py-3 flex items-center gap-4 shadow-lg shadow-black/30">
            <Image
              src="/logos/Kerry Leasing Logo.png"
              alt="Kerry Leasing"
              width={140}
              height={48}
              className="h-9 w-auto object-contain"
              priority
            />
            <div className="w-px h-9 bg-gray-200" />
            <Image
              src="/logos/Kerry Brothers Truck Repair Logo Transpaent.png"
              alt="Kerry Brothers Truck Repair"
              width={160}
              height={55}
              className="h-10 w-auto object-contain"
            />
          </div>
        </div>

        {/* Headline */}
        <div className="relative z-10 space-y-5">
          <div
            className="w-10 h-1 rounded-full"
            style={{ background: '#d9a528' }}
          />
          <h1 className="text-4xl font-bold text-white leading-tight tracking-tight">
            Fleet management<br />built for fixed-cost<br />contracts.
          </h1>
          <p className="text-base text-white/50 leading-relaxed max-w-sm">
            One portal for telematics, repair history, and driver performance — purpose-built for Kerry Leasing customers.
          </p>
        </div>

        {/* Footer */}
        <p className="relative z-10 text-xs text-white/25">
          &copy; {new Date().getFullYear()} Kerry Leasing. All rights reserved.
        </p>
      </div>

      {/* Right panel — sign-in form */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 bg-white">
        {/* Mobile logos */}
        <div className="lg:hidden mb-8 bg-gray-50 rounded-xl px-4 py-3 flex items-center gap-4 border border-gray-100">
          <Image
            src="/logos/Kerry Leasing Logo.png"
            alt="Kerry Leasing"
            width={120}
            height={40}
            className="h-8 w-auto object-contain"
            priority
          />
          <div className="w-px h-8 bg-gray-200" />
          <Image
            src="/logos/Kerry Brothers Truck Repair Logo Transpaent.png"
            alt="Kerry Brothers Truck Repair"
            width={140}
            height={48}
            className="h-9 w-auto object-contain"
          />
        </div>

        <SignIn />
      </div>
    </div>
  );
}
