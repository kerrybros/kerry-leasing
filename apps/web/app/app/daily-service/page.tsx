'use client';

import { useState, useEffect, useCallback } from 'react';
import { FileSpreadsheet, RefreshCw } from 'lucide-react';

const embedUrl = process.env.NEXT_PUBLIC_DAILY_SERVICE_EMBED_URL;

const AUTO_REFRESH_MS = 5 * 60 * 1000; // 5 minutes

function buildSrc(base: string) {
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}_t=${Date.now()}`;
}

export default function DailyServicePage() {
  const [src, setSrc] = useState(() => embedUrl ? buildSrc(embedUrl) : '');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refresh = useCallback(() => {
    if (!embedUrl) return;
    setIsRefreshing(true);
    setSrc(buildSrc(embedUrl));
    setTimeout(() => setIsRefreshing(false), 1500);
  }, []);

  useEffect(() => {
    const id = setInterval(refresh, AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, [refresh]);

  if (!embedUrl) {
    return (
      <div className="flex flex-col flex-1 min-h-0 items-center justify-center gap-4 p-8">
        <FileSpreadsheet className="h-12 w-12 text-muted-foreground" />
        <div className="text-center max-w-sm">
          <h2 className="text-lg font-semibold mb-1">Service Log</h2>
          <p className="text-sm text-muted-foreground mb-4">
            No embed URL configured. Open the Excel file in Excel Online, go to{' '}
            <strong>File → Share → Embed</strong>, copy the iframe URL, and add it to{' '}
            <code className="text-xs bg-muted px-1 py-0.5 rounded">NEXT_PUBLIC_DAILY_SERVICE_EMBED_URL</code>{' '}
            in your <code className="text-xs bg-muted px-1 py-0.5 rounded">.env.local</code>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col p-4 pt-6" style={{ height: '100vh' }}>
      <div className="relative flex-1 min-h-0 rounded-xl border border-border overflow-hidden shadow-sm">
        <iframe
          src={src}
          title="Service Log"
          allowFullScreen
          style={{ border: 'none', display: 'block', width: '100%', height: '100%' }}
        />
        {/* Cover the Excel status bar without hiding the sheet tab row */}
        <div className="absolute bottom-0 left-0 right-0 bg-background pointer-events-none" style={{ height: 22 }} />
        {/* Manual refresh button */}
        <button
          onClick={refresh}
          title="Refresh"
          className="absolute top-2 right-2 z-10 flex items-center gap-1.5 rounded-md bg-background/80 backdrop-blur-sm border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-background transition-colors shadow-sm"
        >
          <RefreshCw className={`h-3 w-3 ${isRefreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>
    </div>
  );
}
