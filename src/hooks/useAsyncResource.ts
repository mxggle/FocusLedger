import { useCallback, useEffect, useState, type DependencyList } from "react";

type AsyncResourceOptions = {
  /** When false the loader is skipped and the fallback is held. */
  enabled?: boolean;
  /** Called when the loader rejects — e.g. to surface a toast. */
  onError?: (error: unknown) => void;
};

type AsyncResource<T> = {
  data: T;
  loading: boolean;
  error: boolean;
  /** Re-run the loader (e.g. from a "Try again" button). */
  reload: () => void;
};

/**
 * Loads an async value with cancellation, loading, and error tracking, so
 * pages don't each re-implement the same effect boilerplate. Re-runs whenever
 * `deps` change; while disabled it stays on the fallback. On failure it falls
 * back, flags `error`, and calls `onError` instead of silently swallowing.
 */
export function useAsyncResource<T>(
  loader: () => Promise<T>,
  fallback: T,
  deps: DependencyList,
  options: AsyncResourceOptions = {}
): AsyncResource<T> {
  const { enabled = true, onError } = options;
  const [data, setData] = useState<T>(fallback);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((value) => value + 1), []);

  useEffect(() => {
    if (!enabled) {
      setData(fallback);
      setLoading(false);
      setError(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(false);

    loader()
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setData(fallback);
        setLoading(false);
        setError(true);
        onError?.(err);
      });

    return () => {
      cancelled = true;
    };
    // The caller's `deps` are the source of truth for when to reload; `enabled`
    // and `nonce` (manual reload) extend them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, enabled, nonce]);

  return { data, loading, error, reload };
}
