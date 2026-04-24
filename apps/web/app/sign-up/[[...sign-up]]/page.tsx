import { SignUp } from '@clerk/nextjs';
import Image from 'next/image';
import { CLERK_POST_AUTH_PATH } from '@/lib/clerkAuthPaths';

/**
 * /sign-up is only reachable when an invitation ticket is present
 * (see apps/web/middleware.ts — direct visits are redirected to /sign-in).
 * This page completes the Clerk invitation flow.
 */
export default function SignUpPage() {
  return (
    <div className="min-h-screen flex bg-[#0f1923]">
      {/* Left panel — branding (mirrors /sign-in) */}
      <div className="hidden lg:flex flex-col justify-between w-[42%] px-14 py-12 relative overflow-hidden">
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(ellipse 80% 60% at 10% 20%, rgba(217,165,40,0.18) 0%, transparent 70%), radial-gradient(ellipse 60% 80% at 90% 80%, rgba(217,165,40,0.10) 0%, transparent 60%)',
          }}
        />
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none opacity-[0.04]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />

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

        <div className="relative z-10 space-y-4">
          <div
            className="w-10 h-1 rounded-full"
            style={{ background: '#d9a528' }}
          />
          <h1 className="text-4xl font-bold text-white leading-tight tracking-tight">
            Welcome aboard.<br />Finish your invite.
          </h1>
          <p className="text-sm text-white/40 tracking-wide uppercase">
            Telematics · Repairs · Driver Performance
          </p>
        </div>

        <p className="relative z-10 text-xs text-white/25">
          &copy; {new Date().getFullYear()} Kerry Leasing. All rights reserved.
        </p>
      </div>

      {/* Right panel — sign-up form */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 bg-white">
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

        <SignUp
          path="/sign-up"
          routing="path"
          signInUrl="/sign-in"
          fallbackRedirectUrl={CLERK_POST_AUTH_PATH}
          signInFallbackRedirectUrl={CLERK_POST_AUTH_PATH}
        />
      </div>
    </div>
  );
}
