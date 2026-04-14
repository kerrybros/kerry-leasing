'use client';

import { QueryClient, QueryClientProvider, dehydrate, hydrate } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

const TWENTY_HOURS = 20 * 60 * 60 * 1000;
const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
const TWENTY_FIVE_HOURS = 25 * 60 * 60 * 1000;

const CACHE_KEY = 'kl-query-cache-v1';

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
    const raw = localStorage.getItem(CACHE_KEY);
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
  } catch {
    try { localStorage.removeItem(CACHE_KEY); } catch { /* ignore */ }
  }

  // Save cache to localStorage whenever a query succeeds (debounced 1s).
  // Also saved on beforeunload as a safety net.
  //
  // Strategy: try the full cache first. If localStorage quota is exceeded (large
  // fleets with many vehicles × days of utilization data can approach 5MB), fall
  // back to saving everything except the large all-time utilization arrays so that
  // at least org settings, fleet units, repairs, and scorecard are cached.
  const LARGE_QUERY_KEYS = new Set(['vehicle-utilization', 'driver-utilization']);

  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  function persistCache() {
    const payload = {
      buster: getCacheBuster(),
      timestamp: Date.now(),
      data: dehydrate(queryClient),
    };
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
    } catch {
      // Quota exceeded — retry without the large utilization datasets
      try {
        const slim = {
          ...payload,
          data: dehydrate(queryClient, {
            shouldDehydrateQuery: (query) =>
              !LARGE_QUERY_KEYS.has(query.queryKey[0] as string) &&
              query.state.status === 'success',
          }),
        };
        localStorage.setItem(CACHE_KEY, JSON.stringify(slim));
      } catch { /* truly can't save — storage may be full or disabled */ }
    }
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
