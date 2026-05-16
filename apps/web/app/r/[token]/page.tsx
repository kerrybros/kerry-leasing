/**
 * Public mobile-first driver weekly scorecard — server component.
 *
 * Renders the immutable kpiSnapshot persisted at send time. No auth — the
 * tokenized link is the sole identifier. Uses the shared
 * DriverScorecardOnePager component, which is also used inline in the
 * fleet admin's Weekly SMS Preview tab.
 */

import { notFound } from 'next/navigation';
import { DriverScorecardOnePager, type OnePagerSnapshot } from '@/features/drivers/components/DriverScorecardOnePager';

interface SnapshotResponse {
  weekStart: string;
  sentAt: string;
  isTest: boolean;
  snapshot: OnePagerSnapshot;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4100';

async function loadSnapshot(token: string): Promise<SnapshotResponse | null> {
  const res = await fetch(`${API_URL}/r/${encodeURIComponent(token)}`, { cache: 'no-store' });
  if (res.status === 404 || res.status === 410) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export default async function ReportPage({ params }: { params: { token: string } }) {
  const data = await loadSnapshot(params.token);
  if (!data) notFound();
  return (
    <div className="min-h-screen bg-slate-50">
      <DriverScorecardOnePager
        weekStart={data.weekStart}
        snapshot={data.snapshot}
        sentAt={data.sentAt}
        isTest={data.isTest}
      />
    </div>
  );
}
