'use client';

import { useSignUp } from '@clerk/nextjs';

export function InvitationEmailDisplay() {
  const { isLoaded, signUp } = useSignUp();

  if (!isLoaded || !signUp?.emailAddress) return null;

  return (
    <div className="w-full max-w-[25rem] mb-3 rounded-lg bg-white border border-gray-200 shadow-sm px-4 py-2.5 flex items-center gap-3">
      <div className="w-7 h-7 rounded-md bg-[#d9a528]/10 flex items-center justify-center flex-shrink-0">
        <svg
          viewBox="0 0 20 20"
          fill="currentColor"
          className="w-3.5 h-3.5 text-[#d9a528]"
          aria-hidden="true"
        >
          <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
          <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
        </svg>
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold leading-tight">
          Invitation for
        </div>
        <div className="text-sm text-gray-900 font-medium truncate leading-snug">
          {signUp.emailAddress}
        </div>
      </div>
    </div>
  );
}
