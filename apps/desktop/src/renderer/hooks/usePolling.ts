import { useState, useEffect, useCallback, useRef } from 'react';

export function usePolling<T>(
  fetcher: () => Promise<T>,
  intervalMs: number = 3000,
  enabled: boolean = true
): { data: T | null; loading: boolean; error: string | null; refresh: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const fetch = useCallback(async () => {
    try {
      const result = await fetcher();
      if (mountedRef.current) {
        setData(result);
        setError(null);
        setLoading(false);
      }
    } catch (err: any) {
      if (mountedRef.current) {
        setError(err.message || 'Unknown error');
        setLoading(false);
      }
    }
  }, [fetcher]);

  useEffect(() => {
    mountedRef.current = true;
    if (!enabled) return;

    fetch();
    const timer = setInterval(fetch, intervalMs);

    return () => {
      mountedRef.current = false;
      clearInterval(timer);
    };
  }, [fetch, intervalMs, enabled]);

  return { data, loading, error, refresh: fetch };
}
