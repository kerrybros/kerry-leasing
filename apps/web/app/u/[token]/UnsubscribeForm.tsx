'use client';

import { useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4100';

export function UnsubscribeForm({ token }: { token: string }) {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');

  const unsubscribe = async () => {
    setState('loading');
    try {
      const res = await fetch(`${API_URL}/u/${encodeURIComponent(token)}`, { method: 'POST' });
      setState(res.ok ? 'done' : 'error');
    } catch {
      setState('error');
    }
  };

  return (
    <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
      {state === 'done' ? (
        <>
          <h1 className="text-lg font-semibold text-slate-900">You&apos;re unsubscribed</h1>
          <p className="mt-2 text-sm text-slate-500">
            You won&apos;t receive any more weekly driver scorecard emails. Your fleet
            manager can re-enable them for you if you change your mind.
          </p>
        </>
      ) : (
        <>
          <h1 className="text-lg font-semibold text-slate-900">
            Unsubscribe from weekly emails?
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Stop receiving the weekly driver scorecard email. This won&apos;t affect any
            text messages.
          </p>
          <button
            onClick={unsubscribe}
            disabled={state === 'loading'}
            className="mt-5 inline-flex items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {state === 'loading' ? 'Unsubscribing…' : 'Unsubscribe'}
          </button>
          {state === 'error' && (
            <p className="mt-3 text-sm text-rose-600">
              Something went wrong. Please try again, or contact your fleet manager.
            </p>
          )}
        </>
      )}
    </div>
  );
}
