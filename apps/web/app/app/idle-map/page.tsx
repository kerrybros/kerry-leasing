import { Map } from 'lucide-react';
import { Suspense } from 'react';
import IdleMapClient from './IdleMapClient';

export const metadata = {
  title: 'Idle Map',
};

export default function IdleMapPage() {
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-3 px-4 pt-6 pb-3 shrink-0">
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Map className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold leading-tight">Idle Map</h1>
          <p className="text-sm text-muted-foreground">Fleet idle events by location</p>
        </div>
      </div>
      <Suspense fallback={<div className="flex-1 bg-muted animate-pulse rounded-xl mx-4 mb-4" />}>
        <IdleMapClient />
      </Suspense>
    </div>
  );
}
