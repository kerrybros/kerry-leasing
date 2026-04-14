'use client';

import { QueryClient, QueryClientProvider, dehydrate, hydrate } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { compressToUTF16, decompressFromUTF16 } from 'lz-string';

const TWENTY_HOURS = 20 * 60 * 60 * 1000;
const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
const TWENTY_FIVE_HOURS = 25 * 60 * 60 * 1000;

// v2: added lz-string compression — evicts old uncompressed entries
const CACHE_KEY = 'kl-query-cache-v2';

/**
 * Returns a stable key for the current data cycle — changes exactly at 3am
 * each day when the nightly ETL runs. When the buster changes, the entire
 * localStorage cache is discarded and fresh data is fetched.
 */
function getCacheBuster(): string {
  const now = new Date();
  const todayCutoff = new Date(now);
  todayCutoff.setHours(3, 0, 0, 0);
  const base = now < todayCutoff
    ? new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
    : now;
  return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}-${String(base.getDate()).padStart(2, '0')}`;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: TWENTY_HOURS,
      gcTime: TWENTY_FOUR_HOURS,
    },
  },
});

// Restore cache synchronously at module load time — before any React render.
// This means useQuery hooks receive cached data on their very first call.
if (typeof window !== 'undefined') {
  try {
    const compressed = localStorage.getItem(CACHE_KEY);
    if (compressed) {
      const raw = decompressFromUTF16(compressed);
      if (raw) {
        const { buster, timestamp, data } = JSON.parse(raw) as {
          buster: string;
          timestamp: number;
          data: unknown;
        };
        const age = Date.now() - (timestamp ?? 0);
        if (buster === getCacheBuster() && age < TWENTY_FIVE_HOURS) {
          hydrate(queryClient, data);
        } else {
          localStorage.removeItem(CACHE_KEY);
        }
      }
    }
  } catch {
    try { localStorage.removeItem(CACHE_KEY); } catch { /* ignore */ }
  }

  // Save cache to localStorage whenever a query succeeds (debounced 1s).
  // Also saved on beforeunload as a safety net.
  //
  // Compression via lz-string reduces large utilization datasets by ~70%, keeping
  // even large fleets well within the localStorage quota so vehicle/driver
  // utilization is preserved across refreshes.
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  function persistCache() {
    const payload = {
      buster: getCacheBuster(),
      timestamp: Date.now(),
      data: dehydrate(queryClient),
    };
    try {
      const compressed = compressToUTF16(JSON.stringify(payload));
      localStorage.setItem(CACHE_KEY, compressed);
    } catch { /* storage disabled or truly full */ }
  }

  queryClient.getQueryCache().subscribe((event) => {
    if (event?.type === 'updated' && event.action.type === 'success') {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(persistCache, 1000);
    }
  });

  window.addEventListener('beforeunload', persistCache);
}

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {process.env.NODE_ENV !== 'production' && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  );
}
